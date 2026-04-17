import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";

const execFile = promisify(execFileCallback);

export async function exportKimiSessionEvents(
  sessionId: string,
  deps: {
    command?: string;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<AcpKimiStreamEvent[]> {
  const workdir = await mkdtemp(join(tmpdir(), "tenways-octo-kimi-export-"));
  const zipPath = join(workdir, `${sessionId}.zip`);

  try {
    await execFile(
      deps.command ?? "kimi",
      ["export", "-y", "-o", zipPath, sessionId],
      {
        cwd: deps.cwd ?? process.cwd(),
        env: deps.env ?? process.env,
      },
    );

    const { stdout } = await execFile(
      "python3",
      [
        "-c",
        PYTHON_EXPORT_READER,
        zipPath,
      ],
      {
        cwd: deps.cwd ?? process.cwd(),
        env: deps.env ?? process.env,
      },
    );

    return parseExportedSessionWire(sessionId, stdout);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

export function parseExportedSessionWire(
  sessionId: string,
  wireJsonl: string,
): AcpKimiStreamEvent[] {
  const events: AcpKimiStreamEvent[] = [];
  let assistantOpen = false;

  const lines = wireJsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parsed = JSON.parse(line) as {
      message?: {
        type?: string;
        payload?: Record<string, unknown>;
      };
    };
    const message = parsed.message;
    if (!message?.type) {
      continue;
    }

    if (message.type === "TurnBegin") {
      if (assistantOpen) {
        events.push({
          event: "done",
          data: {
            sessionId,
            stopReason: "end_turn",
          },
        });
        assistantOpen = false;
      }

      const payload = message.payload ?? {};
      const userInput = Array.isArray(payload.user_input)
        ? (payload.user_input as Array<Record<string, unknown>>)
        : [];
      const userText = userInput
        .filter(
          (part) =>
            part.type === "text" &&
            typeof part.text === "string" &&
            part.text.trim().length > 0,
        )
        .map((part) => String(part.text))
        .join("\n");

      if (userText) {
        events.push({
          event: "acp.session.update",
          data: {
            sessionId,
            update: {
              sessionUpdate: "user_message_chunk",
              content: {
                type: "text",
                text: userText,
              },
            },
          },
        });
      }

      continue;
    }

    if (message.type === "ContentPart") {
      const payload = message.payload ?? {};
      if (payload.type === "text" && typeof payload.text === "string") {
        assistantOpen = true;
        events.push({
          event: "acp.session.update",
          data: {
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: payload.text,
              },
            },
          },
        });
      }
    }
  }

  if (assistantOpen) {
    events.push({
      event: "done",
      data: {
        sessionId,
        stopReason: "end_turn",
      },
    });
  }

  return events;
}

const PYTHON_EXPORT_READER = `
import sys, zipfile
from pathlib import Path

zip_path = Path(sys.argv[1])
with zipfile.ZipFile(zip_path, "r") as zf:
    sys.stdout.write(zf.read("wire.jsonl").decode("utf-8"))
`;
