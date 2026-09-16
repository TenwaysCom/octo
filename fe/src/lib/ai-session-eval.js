import { transcriptFromAiSessionEvents } from "./ai-session-transcript.js";

/**
 * Produces the small, non-sensitive trace contract consumed by the external
 * DeepEval harness. The browser action remains the source of the SSE events.
 */
export function summarizeAiSessionForEval(events) {
  const messages = transcriptFromAiSessionEvents(events);
  const assistantMessages = messages.filter((entry) => entry.kind === "assistant");
  const toolCalls = assistantMessages.flatMap((entry) => (entry.toolCalls || []).map((toolCall) => ({
    title: toolCall.title,
    status: toolCall.status || null,
    detail: toolCall.detail || null,
  })));
  const doneEvent = [...events].reverse().find((event) => event?.event === "done");

  return {
    output: assistantMessages.map((entry) => entry.text).filter(Boolean).join("\n\n"),
    toolCalls,
    stopReason: typeof doneEvent?.data?.stopReason === "string" ? doneEvent.data.stopReason : null,
    eventCount: events.length,
  };
}
