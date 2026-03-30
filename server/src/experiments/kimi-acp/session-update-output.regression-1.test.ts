import { describe, expect, it } from "vitest";
import { renderSessionUpdate } from "./session-update-output.js";

describe("renderSessionUpdate", () => {
  it("keeps assistant message chunks on stdout", () => {
    const rendered = renderSessionUpdate({
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: "OK",
      },
    } as never);

    expect(rendered).toEqual({
      stdoutText: "OK",
    });
  });

  it("suppresses thought chunks from terminal output", () => {
    const rendered = renderSessionUpdate({
      sessionUpdate: "agent_thought_chunk",
      content: {
        type: "text",
        text: "internal reasoning",
      },
    } as never);

    expect(rendered).toBeNull();
  });

  it("suppresses metadata-only session updates", () => {
    const rendered = renderSessionUpdate({
      sessionUpdate: "available_commands_update",
      commands: [],
    } as never);

    expect(rendered).toBeNull();
  });

  it("keeps tool activity visible on stderr", () => {
    const rendered = renderSessionUpdate({
      sessionUpdate: "tool_call",
      title: "Read file",
      status: "completed",
    } as never);

    expect(rendered).toEqual({
      stderrLine: "[tool_call] Read file (completed)\n",
    });
  });
});
