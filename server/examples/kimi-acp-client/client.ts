#!/usr/bin/env node

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import process from "node:process";
import * as acp from "@agentclientprotocol/sdk";
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { buildKimiAcpSpawnConfig } from "../../src/experiments/kimi-acp/config.js";
import { runValidationTurn } from "../../src/experiments/kimi-acp/run-validation.js";

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
    const update = params.update;

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
      case "agent_thought_chunk":
      case "user_message_chunk":
        if (update.content.type === "text") {
          process.stdout.write(update.content.text);
        } else {
          console.log(`\n[${update.sessionUpdate}:${update.content.type}]`);
        }
        break;
      case "tool_call":
        console.log(`\n[tool_call] ${update.title} (${update.status})`);
        break;
      case "tool_call_update":
        console.log(
          `\n[tool_call_update] ${update.toolCallId} -> ${update.status}`,
        );
        break;
      case "plan":
      case "available_commands_update":
      case "current_mode_update":
      case "config_option_update":
      case "session_info_update":
      case "usage_update":
        console.log(`\n[${update.sessionUpdate}]`);
        break;
      default:
        console.log(`\n[unhandled session update]`);
        break;
    }
  }
}

async function main() {
  const prompt = getPromptFromArgs(process.argv.slice(2));
  const spawnConfig = buildKimiAcpSpawnConfig(process.env);
  const agentProcess = spawnAgentProcess(spawnConfig);
  const cleanup = installCleanup(agentProcess);

  try {
    await confirmAgentProcessStarted(agentProcess);

    const input = Writable.toWeb(agentProcess.stdin);
    const output = Readable.toWeb(agentProcess.stdout);
    const stream = acp.ndJsonStream(input, output);
    const connection = new acp.ClientSideConnection(
      () => new LoggingClient(),
      stream,
    );

    const result = await runValidationTurn({
      cwd: process.cwd(),
      prompt,
      connection: {
        initialize: () =>
          connection.initialize({
            protocolVersion: acp.PROTOCOL_VERSION,
            clientInfo: {
              name: "tenways-octo-kimi-validator",
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
    });

    console.log("\n");
    console.log(`[kimi-acp] protocolVersion=${result.protocolVersion}`);
    console.log(
      `[kimi-acp] mcpCapabilities=${JSON.stringify(
        result.capabilities.mcpCapabilities || {},
      )}`,
    );
    console.log(`[kimi-acp] sessionId=${result.sessionId}`);
    console.log(`[kimi-acp] stopReason=${result.stopReason}`);
  } finally {
    await cleanup();
  }
}

function getPromptFromArgs(args: string[]): string {
  if (args.length === 0) {
    return "请简单介绍你自己，并确认 ACP 会话已经建立。";
  }

  return args.join(" ");
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

function confirmAgentProcessStarted(
  agentProcess: ChildProcessWithoutNullStreams,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      agentProcess.off("error", handleError);
      agentProcess.off("exit", handleExit);
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const handleError = (error: Error) => {
      settle(() => {
        reject(new Error(`failed to start subprocess: ${error.message}`));
      });
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      settle(() => {
        reject(
          new Error(
            `subprocess exited before ACP handshake (code=${code ?? "null"}, signal=${signal ?? "null"})`,
          ),
        );
      });
    };

    const timer = setTimeout(() => {
      settle(resolve);
    }, 0);

    agentProcess.once("error", handleError);
    agentProcess.once("exit", handleExit);
  });
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

    if (!agentProcess.killed && agentProcess.exitCode === null) {
      agentProcess.kill("SIGTERM");
      await onceExit(agentProcess);
    }
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

function onceExit(agentProcess: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    if (agentProcess.exitCode !== null) {
      resolve();
      return;
    }

    agentProcess.once("exit", () => resolve());
  });
}

void main().catch(async (error) => {
  console.error("[kimi-acp] validation failed:", error);
  process.exit(1);
});
