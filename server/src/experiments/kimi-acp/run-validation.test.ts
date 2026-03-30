import { describe, expect, it, vi } from "vitest";
import { runValidationTurn } from "./run-validation.js";

describe("runValidationTurn", () => {
  it("runs initialize, session/new, and session/prompt in order", async () => {
    const callOrder: string[] = [];
    const onUpdate = vi.fn();
    const connection = {
      initialize: vi.fn(async () => {
        callOrder.push("initialize");
        return {
          protocolVersion: 1,
          agentCapabilities: {
            mcpCapabilities: {
              http: false,
              sse: false,
            },
          },
        };
      }),
      createSession: vi.fn(async (input: { cwd: string }) => {
        callOrder.push(`session/new:${input.cwd}`);
        return {
          sessionId: "sess_123",
        };
      }),
      prompt: vi.fn(async (input: { sessionId: string; prompt: string }) => {
        callOrder.push(`session/prompt:${input.sessionId}`);
        onUpdate({ kind: "content", text: "hello" });
        return {
          stopReason: "end_turn",
        };
      }),
    };

    const result = await runValidationTurn({
      connection,
      cwd: "/tmp/project",
      prompt: "say hello",
      onUpdate,
    });

    expect(callOrder).toEqual([
      "initialize",
      "session/new:/tmp/project",
      "session/prompt:sess_123",
    ]);
    expect(onUpdate).toHaveBeenCalledWith({ kind: "content", text: "hello" });
    expect(result).toEqual({
      sessionId: "sess_123",
      stopReason: "end_turn",
      protocolVersion: 1,
      capabilities: {
        mcpCapabilities: {
          http: false,
          sse: false,
        },
      },
    });
  });
});
