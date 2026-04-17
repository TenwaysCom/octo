import { describe, expect, it } from "vitest";
import { parseExportedSessionWire } from "../src/adapters/kimi-acp/session-export.js";

describe("parseExportedSessionWire", () => {
  it("reconstructs user and assistant transcript events from exported wire logs", () => {
    const events = parseExportedSessionWire(
      "sess_1",
      [
        JSON.stringify({
          type: "metadata",
          protocol_version: "1.6",
        }),
        JSON.stringify({
          timestamp: 1,
          message: {
            type: "TurnBegin",
            payload: {
              user_input: [{ type: "text", text: "first question" }],
            },
          },
        }),
        JSON.stringify({
          timestamp: 2,
          message: {
            type: "ContentPart",
            payload: {
              type: "text",
              text: "first answer",
            },
          },
        }),
        JSON.stringify({
          timestamp: 3,
          message: {
            type: "TurnBegin",
            payload: {
              user_input: [{ type: "text", text: "second question" }],
            },
          },
        }),
        JSON.stringify({
          timestamp: 4,
          message: {
            type: "ContentPart",
            payload: {
              type: "text",
              text: "second answer",
            },
          },
        }),
      ].join("\n"),
    );

    expect(events).toEqual([
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_1",
          update: {
            sessionUpdate: "user_message_chunk",
            content: {
              type: "text",
              text: "first question",
            },
          },
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_1",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "first answer",
            },
          },
        },
      },
      {
        event: "done",
        data: {
          sessionId: "sess_1",
          stopReason: "end_turn",
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_1",
          update: {
            sessionUpdate: "user_message_chunk",
            content: {
              type: "text",
              text: "second question",
            },
          },
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_1",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "second answer",
            },
          },
        },
      },
      {
        event: "done",
        data: {
          sessionId: "sess_1",
          stopReason: "end_turn",
        },
      },
    ]);
  });
});
