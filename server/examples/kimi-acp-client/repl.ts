#!/usr/bin/env node

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { createInterface, type Interface } from "node:readline";
import process from "node:process";
import * as acp from "@agentclientprotocol/sdk";
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { buildKimiAcpSpawnConfig } from "../../src/experiments/kimi-acp/config.js";
import { runInteractiveSession } from "../../src/experiments/kimi-acp/interactive-session.js";
import {
  cleanupAgentProcess,
  runWithAgentProcessGuard,
} from "../../src/experiments/kimi-acp/process-lifecycle.js";
import { renderSessionUpdate } from "../../src/experiments/kimi-acp/session-update-output.js";

class LoggingClient implements acp.Client {
  async requestPermission(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    console.error(
      `[kimi-acp] permission requested for tool call: ${params.toolCall.title}`,
    );

    return {
      outcome: {
        outcome: "cancelled",
      },
    };
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    const rendered = renderSessionUpdate(params.update);

    if (!rendered) {
      return;
    }

    if (rendered.stdoutText) {
      process.stdout.write(rendered.stdoutText);
    }

    if (rendered.stderrLine) {
      process.stderr.write(rendered.stderrLine);
    }
  }
}

async function main() {
  const spawnConfig = buildKimiAcpSpawnConfig(process.env);
  const agentProcess = spawnAgentProcess(spawnConfig);
  const cleanup = installCleanup(agentProcess);
  const useTerminalPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const inputLoop = useTerminalPrompt
    ? createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      })
    : null;

  try {
    const input = Writable.toWeb(agentProcess.stdin);
    const output = Readable.toWeb(agentProcess.stdout);
    const stream = acp.ndJsonStream(input, output);
    const connection = new acp.ClientSideConnection(
      () => new LoggingClient(),
      stream,
    );

    const result = await runWithAgentProcessGuard(agentProcess, () =>
      runInteractiveSession({
        cwd: process.cwd(),
        lines: useTerminalPrompt
          ? readPromptLines(inputLoop)
          : readPipedLines(process.stdin),
        connection: {
          initialize: () =>
            connection.initialize({
              protocolVersion: acp.PROTOCOL_VERSION,
              clientInfo: {
                name: "tenways-octo-kimi-repl",
                version: "0.1.0",
              },
              clientCapabilities: {},
            }),
          createSession: ({ cwd }) =>
            connection.newSession({
              cwd,
              mcpServers: [],
            }),
          prompt: ({ sessionId, prompt }) =>
            connection.prompt({
              sessionId,
              prompt: [
                {
                  type: "text",
                  text: prompt,
                },
              ],
            }),
        },
        onReady: ({ sessionId, protocolVersion, capabilities }) => {
          console.log(`[kimi-acp] protocolVersion=${protocolVersion}`);
          console.log(
            `[kimi-acp] mcpCapabilities=${JSON.stringify(
              capabilities.mcpCapabilities || {},
            )}`,
          );
          console.log(`[kimi-acp] sessionId=${sessionId}`);
          console.log("[kimi-acp] interactive session ready");
          console.log("[kimi-acp] enter /exit or /quit to leave");
        },
        onTurnComplete: ({ stopReason }) => {
          process.stdout.write("\n");
          console.log(`[kimi-acp] stopReason=${stopReason}`);
        },
      }),
    );

    console.log(`[kimi-acp] exitReason=${result.exitReason}`);
    console.log(`[kimi-acp] promptCount=${result.promptCount}`);
  } finally {
    inputLoop?.close();
    await cleanup();
  }
}

async function* readPromptLines(inputLoop: Interface): AsyncIterable<string> {
  while (true) {
    inputLoop.prompt();
    const line = await waitForPromptLine(inputLoop);

    if (line === null) {
      return;
    }

    yield line;
  }
}

async function* readPipedLines(
  input: NodeJS.ReadableStream,
): AsyncIterable<string> {
  let buffered = "";

  for await (const chunk of input) {
    buffered += String(chunk);

    while (true) {
      const newlineIndex = buffered.indexOf("\n");

      if (newlineIndex === -1) {
        break;
      }

      const line = buffered.slice(0, newlineIndex).replace(/\r$/, "");
      buffered = buffered.slice(newlineIndex + 1);
      yield line;
    }
  }

  if (buffered) {
    yield buffered.replace(/\r$/, "");
  }
}

function waitForPromptLine(inputLoop: Interface): Promise<string | null> {
  return new Promise((resolve) => {
    const handleLine = (line: string) => {
      cleanup();
      resolve(line);
    };
    const handleClose = () => {
      cleanup();
      resolve(null);
    };
    const cleanup = () => {
      inputLoop.off("line", handleLine);
      inputLoop.off("close", handleClose);
    };

    inputLoop.once("line", handleLine);
    inputLoop.once("close", handleClose);
  });
}

function spawnAgentProcess(
  spawnConfig: ReturnType<typeof buildKimiAcpSpawnConfig>,
): ChildProcessWithoutNullStreams {
  const agentProcess = spawn(spawnConfig.command, spawnConfig.args, {
    env: spawnConfig.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  agentProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[kimi-acp:stderr] ${String(chunk)}`);
  });

  return agentProcess;
}

function installCleanup(agentProcess: ChildProcessWithoutNullStreams) {
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;

    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    process.off("uncaughtException", handleUncaughtException);
    process.off("unhandledRejection", handleUnhandledRejection);

    await cleanupAgentProcess(agentProcess);
  };

  const handleSignal = async () => {
    await cleanup();
    process.exit(130);
  };

  const handleUncaughtException = async (error: unknown) => {
    console.error("[kimi-acp] uncaught exception:", error);
    await cleanup();
    process.exit(1);
  };

  const handleUnhandledRejection = async (reason: unknown) => {
    console.error("[kimi-acp] unhandled rejection:", reason);
    await cleanup();
    process.exit(1);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
  process.on("uncaughtException", handleUncaughtException);
  process.on("unhandledRejection", handleUnhandledRejection);

  return cleanup;
}

void main().catch(async (error) => {
  console.error("[kimi-acp] repl failed:", error);
  process.exit(1);
});
