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

  it("shows thought chunks when thought output is enabled", () => {
    const rendered = renderSessionUpdate(
      {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "text",
          text: "internal reasoning",
        },
      } as never,
      {
        showThoughts: true,
      },
    );

    expect(rendered).toEqual({
      thoughtText: "internal reasoning",
    });
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

  it("summarizes plan updates", () => {
    const rendered = renderSessionUpdate({
      sessionUpdate: "plan",
      entries: [
        {
          content: "Implement bridge",
          priority: "high",
          status: "in_progress",
        },
        {
          content: "Write tests",
          priority: "medium",
          status: "pending",
        },
        {
          content: "Verify build",
          priority: "low",
          status: "completed",
        },
      ],
    } as never);

    expect(rendered).toEqual({
      stderrLine: "[plan] 3 tasks (1 in_progress, 1 pending, 1 completed)\n",
    });
  });

  it("shows mode updates as one-line summaries", () => {
    const rendered = renderSessionUpdate({
      sessionUpdate: "current_mode_update",
      currentModeId: "code",
    } as never);

    expect(rendered).toEqual({
      stderrLine: "[mode] code\n",
    });
  });

  it("shows session info updates as one-line summaries", () => {
    const rendered = renderSessionUpdate({
      sessionUpdate: "session_info_update",
      title: "Implement user authentication",
      updatedAt: "2026-03-31T10:00:00Z",
    } as never);

    expect(rendered).toEqual({
      stderrLine:
        '[session] title="Implement user authentication" updatedAt=2026-03-31T10:00:00Z\n',
    });
  });

  it("prints raw json for non-message events in raw mode", () => {
    const rendered = renderSessionUpdate(
      {
        sessionUpdate: "tool_call_update",
        toolCallId: "tool_123",
        status: "in_progress",
        title: "FetchURL",
      } as never,
      {
        rawEvents: true,
      },
    );

    expect(rendered).toEqual({
      stderrLine:
        '[session_update] {"sessionUpdate":"tool_call_update","toolCallId":"tool_123","status":"in_progress","title":"FetchURL"}\n',
    });
  });
});
