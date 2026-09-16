import { describe, expect, it, vi } from "vitest";
import { runInteractiveSession } from "./interactive-session.js";

describe("runInteractiveSession", () => {
  it("initializes once, reuses one session, and exits on /exit", async () => {
    const callOrder: string[] = [];
    const connection = {
      initialize: vi.fn(async () => {
        callOrder.push("initialize");
        return {
          protocolVersion: 1,
          agentCapabilities: {},
        };
      }),
      createSession: vi.fn(async ({ cwd }: { cwd: string }) => {
        callOrder.push(`session/new:${cwd}`);
        return {
          sessionId: "sess_repl_001",
        };
      }),
      prompt: vi.fn(async ({ sessionId, prompt }: { sessionId: string; prompt: string }) => {
        callOrder.push(`session/prompt:${sessionId}:${prompt}`);
        return {
          stopReason: "end_turn",
        };
      }),
    };

    const seenReady: string[] = [];
    const seenTurns: string[] = [];

    const result = await runInteractiveSession({
      connection,
      cwd: "/tmp/project",
      lines: createLines(["first question", "second question", "/exit"]),
      onReady: ({ sessionId }) => {
        seenReady.push(sessionId);
      },
      onTurnComplete: ({ stopReason }) => {
        seenTurns.push(stopReason);
      },
    });

    expect(callOrder).toEqual([
      "initialize",
      "session/new:/tmp/project",
      "session/prompt:sess_repl_001:first question",
      "session/prompt:sess_repl_001:second question",
    ]);
    expect(seenReady).toEqual(["sess_repl_001"]);
    expect(seenTurns).toEqual(["end_turn", "end_turn"]);
    expect(result).toEqual({
      sessionId: "sess_repl_001",
      promptCount: 2,
      protocolVersion: 1,
      capabilities: {},
      exitReason: "user_exit",
    });
  });

  it("ignores empty lines and supports /quit", async () => {
    const connection = {
      initialize: vi.fn(async () => ({
        protocolVersion: 1,
        agentCapabilities: {
          mcpCapabilities: {
            http: true,
          },
        },
      })),
      createSession: vi.fn(async () => ({
        sessionId: "sess_repl_002",
      })),
      prompt: vi.fn(async () => ({
        stopReason: "end_turn",
      })),
    };

    const result = await runInteractiveSession({
      connection,
      cwd: "/tmp/project",
      lines: createLines(["", "   ", "/quit"]),
    });

    expect(connection.prompt).not.toHaveBeenCalled();
    expect(result).toEqual({
      sessionId: "sess_repl_002",
      promptCount: 0,
      protocolVersion: 1,
      capabilities: {
        mcpCapabilities: {
          http: true,
        },
      },
      exitReason: "user_exit",
    });
  });
});

async function* createLines(lines: string[]): AsyncIterable<string> {
  for (const line of lines) {
    yield line;
  }
}
