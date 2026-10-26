export const LARK_HERMES_ANSWER_ACTION = "lark-ticket-support-qa-answer";

export function isHermesAnswerSession(session) {
  return session?.actionKey === LARK_HERMES_ANSWER_ACTION && session.agentProvider === "hermes_acp";
}

export function getHermesAnswerHistory(sessions) {
  return sessions.filter(isHermesAnswerSession).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

// Group presentation by user turn without changing the shared ACP transcript.
// Keep reasoning separate from copyable answers and preserve the original text.
export function getHermesTurns(messages) {
  const turns = [];
  for (const entry of messages) {
    if (entry.kind === "user" || !turns.length) {
      turns.push({ id: entry.id, question: "", answers: [], reasoning: [], tools: [], sources: [], permissions: [], hasThinking: false, latestActivity: "preparing" });
    }
    const turn = turns.at(-1);
    if (entry.kind === "user") turn.question = entry.text;
    if (entry.kind === "permission") turn.permissions.push(entry);
    if (entry.kind !== "assistant") continue;
    if (Array.isArray(entry.sources)) turn.sources = entry.sources;
    if (entry.thoughts?.length) {
      turn.hasThinking = true;
      turn.reasoning.push(...entry.thoughts.filter((thought) => thought.text?.trim()));
      turn.latestActivity = "thinking";
    }
    if (entry.text) {
      turn.answers.push({ id: entry.id, text: entry.text });
      turn.latestActivity = "answering";
    }
    for (const tool of entry.toolCalls || []) {
      const index = turn.tools.findIndex((item) => item.id === tool.id);
      if (index === -1) turn.tools.push(tool);
      else turn.tools[index] = tool;
      turn.latestActivity = "tools";
    }
  }
  return turns;
}
