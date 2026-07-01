import type { ContentBlock, SessionNotification } from "@agentclientprotocol/sdk";

export interface RenderedSessionUpdate {
  stdoutText?: string;
  stderrLine?: string;
  thoughtText?: string;
}

export interface RenderSessionUpdateOptions {
  rawEvents?: boolean;
  showThoughts?: boolean;
}

export function renderSessionUpdate(
  update: SessionNotification["update"],
  options: RenderSessionUpdateOptions = {},
): RenderedSessionUpdate | null {
  if (options.rawEvents && update.sessionUpdate !== "agent_message_chunk") {
    return {
      stderrLine: `[session_update] ${JSON.stringify(update)}\n`,
    };
  }

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
      if (!options.showThoughts) {
        return null;
      }

      if (update.content.type === "text") {
        return {
          thoughtText: update.content.text,
        };
      }

      return renderChunkSummary("thought", update.content);
    case "plan":
      return {
        stderrLine: `${summarizePlan(update.entries)}\n`,
      };
    case "current_mode_update":
      return {
        stderrLine: `[mode] ${update.currentModeId}\n`,
      };
    case "session_info_update": {
      const summary = summarizeSessionInfo(update);

      if (!summary) {
        return null;
      }

      return {
        stderrLine: `${summary}\n`,
      };
    }
    case "user_message_chunk":
    case "available_commands_update":
    case "config_option_update":
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

function renderChunkSummary(
  label: string,
  content: ContentBlock,
): RenderedSessionUpdate {
  if (content.type === "text") {
    return {
      stderrLine: `[${label}] ${content.text}\n`,
    };
  }

  return {
    stderrLine: `[${label}:${content.type}]\n`,
  };
}

function summarizePlan(
  entries: Array<{ status: "pending" | "in_progress" | "completed" }>,
): string {
  const counts = {
    inProgress: 0,
    pending: 0,
    completed: 0,
  };

  for (const entry of entries) {
    if (entry.status === "in_progress") {
      counts.inProgress += 1;
      continue;
    }

    if (entry.status === "pending") {
      counts.pending += 1;
      continue;
    }

    counts.completed += 1;
  }

  return `[plan] ${entries.length} tasks (${counts.inProgress} in_progress, ${counts.pending} pending, ${counts.completed} completed)`;
}

function summarizeSessionInfo(
  update: Extract<
    SessionNotification["update"],
    {
      sessionUpdate: "session_info_update";
    }
  >,
): string | null {
  const parts: string[] = [];

  if ("title" in update) {
    parts.push(`title=${JSON.stringify(update.title ?? null)}`);
  }

  if ("updatedAt" in update) {
    parts.push(`updatedAt=${update.updatedAt ?? "null"}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `[session] ${parts.join(" ")}`;
}
