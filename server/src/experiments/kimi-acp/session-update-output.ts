import type { SessionNotification } from "@agentclientprotocol/sdk";

export interface RenderedSessionUpdate {
  stdoutText?: string;
  stderrLine?: string;
}

export function renderSessionUpdate(
  update: SessionNotification["update"],
): RenderedSessionUpdate | null {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      if (update.content.type === "text") {
        return {
          stdoutText: update.content.text,
        };
      }

      return {
        stderrLine: `[agent_message_chunk:${update.content.type}]\n`,
      };
    case "tool_call":
      return {
        stderrLine: `[tool_call] ${update.title} (${update.status})\n`,
      };
    case "tool_call_update":
      return {
        stderrLine: `[tool_call_update] ${update.toolCallId} -> ${update.status}\n`,
      };
    case "agent_thought_chunk":
    case "user_message_chunk":
    case "plan":
    case "available_commands_update":
    case "current_mode_update":
    case "config_option_update":
    case "session_info_update":
    case "usage_update":
      return null;
    default: {
      const unhandled = update as { sessionUpdate?: string };

      return {
        stderrLine: `[unhandled session update:${unhandled.sessionUpdate ?? "unknown"}]\n`,
      };
    }
  }
}
