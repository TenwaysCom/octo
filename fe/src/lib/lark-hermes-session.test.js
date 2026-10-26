import test from "node:test";
import assert from "node:assert/strict";
import { getHermesAnswerHistory, getHermesTurns, isHermesAnswerSession, LARK_HERMES_ANSWER_ACTION } from "./lark-hermes-session.js";
import { appendAiSessionEvent, createAiUserMessage, transcriptFromAiSessionEvents } from "./ai-session-transcript.js";

test("renders API sources for streaming and replay without parsing answer headings, and isolates turns", () => {
  const update = (sessionUpdate, text) => ({ event: "acp.session.update", data: { update: { sessionUpdate, content: { type: "text", text } } } });
  const sources = [{ id: "doc", kind: "document", title: "规则", location: "docs/llm-wiki/concepts/rule.md" }];
  const events = [update("user_message_chunk", "问题"), update("agent_message_chunk", "答案 [1]"), { event: "answer.sources", data: { sources } }, { event: "done", data: { stopReason: "end_turn" } }];
  let live = [];
  for (const event of events) live = appendAiSessionEvent(live, event);
  assert.deepEqual(getHermesTurns(live)[0].sources, sources);
  assert.deepEqual(getHermesTurns(transcriptFromAiSessionEvents(events))[0].sources, sources);
  live = [...live, createAiUserMessage("追问")];
  live = appendAiSessionEvent(live, update("agent_message_chunk", "没有新引用"));
  live = appendAiSessionEvent(live, { event: "answer.sources", data: { sources: [] } });
  assert.deepEqual(getHermesTurns(live).map((turn) => turn.sources), [sources, []]);
});

test("ignores malformed source events and disallows executable or credential-bearing links", () => {
  const messages = [{ id: "answer", kind: "assistant", text: "回答", thoughts: [], toolCalls: [] }];
  assert.equal(appendAiSessionEvent(messages, { event: "answer.sources", data: {} }), messages);
  const sources = ["javascript:alert(1)", "https://user:secret@example.com/", "invalid"].map((href) => ({ id: href, title: "x", location: "x", href, kind: "web" }));
  assert.deepEqual(getHermesTurns(appendAiSessionEvent(messages, { event: "answer.sources", data: { sources } }))[0].sources, []);
});

test("Hermes history uses server provider metadata and excludes Kimi, Wiki and unclassified sessions", () => {
  const answer = { actionKey: LARK_HERMES_ANSWER_ACTION, agentProvider: "hermes_acp" };
  const items = [
    { ...answer, sessionId: "old", updatedAt: "2026-10-20" },
    { ...answer, sessionId: "new", updatedAt: "2026-10-21" },
    { ...answer, agentProvider: "kimi_acp", sessionId: "hermes_fake" },
    { actionKey: LARK_HERMES_ANSWER_ACTION, sessionId: "hermes_legacy_unknown" },
    { ...answer, actionKey: "lark-ticket-wiki-qa" },
  ];
  assert.deepEqual(getHermesAnswerHistory(items).map(item => item.sessionId), ["new", "old"]);
  assert.equal(items[0].sessionId, "old");
  assert.equal(isHermesAnswerSession(null), false);
});
