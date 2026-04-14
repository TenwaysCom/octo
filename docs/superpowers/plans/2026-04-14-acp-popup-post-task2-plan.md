# ACP Popup Post-Task2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the ACP popup frontend with the newly agreed dual-layer design: keep the current-compatible transcript shell stable, then grow it into a target-state ACP chat UI with aggregated messages, thought/tool rendering, and controlled performance upgrades.

**Architecture:** Treat the current popup as a compatibility layer, not a half-finished rich chat UI. Preserve the Task 1 / Task 2 session flow and isolate future complexity behind a new front-end view-model layer that aggregates ACP session updates into richer messages without changing the backend wire contract.

**Tech Stack:** Vue 3, TypeScript, ACP SSE, Vitest

---

**Current baseline**

- Task 1 single-turn bridge is complete
- Task 2 single-session follow-up is complete
- Current frontend model stays lightweight for now: `sessionId + draft + transcript entries`

**This plan supersedes**

- The later frontend-facing intent of Task 3+ in [2026-03-31-kimi-acp-backend-bridge-implementation-plan.md](/home/uynil/projects/tw-itdog/docs/superpowers/plans/2026-03-31-kimi-acp-backend-bridge-implementation-plan.md)
- It does not replace the completed Task 1 / Task 2 work

## Task 1: Current-Compatible UX Polish

**Files:**
- Create: `extension/src/popup/composables/use-smart-scroll.ts`
- Create: `extension/src/popup/composables/use-smart-scroll.test.ts`
- Modify: `extension/src/popup/components/KimiChatPanel.vue`
- Modify: `extension/src/popup/components/KimiChatPanel.test.ts`
- Modify: `extension/src/popup/composables/use-popup-app.ts`
- Modify: `extension/src/popup/composables/use-popup-app.test.ts`

- [ ] **Step 1: Write the failing smart-scroll tests**

Cover:
- transcript auto-scrolls only when the user is already near the bottom
- transcript does not force-scroll when the user has scrolled up
- resetting the session keeps the transcript shell consistent

- [ ] **Step 2: Run the new tests to verify they fail**

Run:
- `cd extension && npm test -- src/popup/components/KimiChatPanel.test.ts src/popup/composables/use-popup-app.test.ts src/popup/composables/use-smart-scroll.test.ts`

Expected: FAIL because smart sticky-scroll behavior does not exist yet

- [ ] **Step 3: Implement smart sticky-scroll**

Implement:
- a small smart-scroll composable scoped to the transcript container
- transcript auto-follow only when the user is near the bottom
- no new rendering model yet; keep the current lightweight transcript shell

- [ ] **Step 4: Run the tests again and make them pass**

Run:
- `cd extension && npm test -- src/popup/components/KimiChatPanel.test.ts src/popup/composables/use-popup-app.test.ts src/popup/composables/use-smart-scroll.test.ts`

Expected: PASS

## Task 2: Introduce Aggregated ChatMessage View Model

**Files:**
- Create: `extension/src/popup/chat-message-model.ts`
- Create: `extension/src/popup/chat-message-model.test.ts`
- Modify: `extension/src/types/acp-kimi.ts`
- Modify: `extension/src/popup/kimi-chat.ts`
- Modify: `extension/src/popup/composables/use-popup-app.ts`
- Modify: `extension/src/popup/composables/use-popup-app.test.ts`
- Reference: `server/src/experiments/kimi-acp/session-update-output.ts`

- [ ] **Step 1: Write the failing aggregation tests**

Cover:
- `agent_message_chunk` aggregates into `ChatMessage.content`
- `agent_thought_chunk` aggregates into `ChatMessage.thoughts`
- `tool_call` / `tool_call_update` aggregate into `toolCalls`
- `done` finalizes message status

- [ ] **Step 2: Run the new tests to verify they fail**

Run:
- `cd extension && npm test -- src/popup/chat-message-model.test.ts src/popup/kimi-chat.test.ts src/popup/composables/use-popup-app.test.ts`

Expected: FAIL because the popup still only stores transcript rows

- [ ] **Step 3: Implement the target-state message view model**

Implement:
- a dedicated `ChatMessage` aggregation layer in the popup
- a clear separation between ACP wire events and rendered message state
- migration from raw transcript-only rendering to message-driven rendering, while keeping the current backend API unchanged

- [ ] **Step 4: Run the tests again and make them pass**

Run:
- `cd extension && npm test -- src/popup/chat-message-model.test.ts src/popup/kimi-chat.test.ts src/popup/composables/use-popup-app.test.ts`

Expected: PASS

## Task 3: Thought / Tool / Final Answer Rendering

**Files:**
- Modify: `extension/src/popup/components/KimiChatPanel.vue`
- Modify: `extension/src/popup/components/KimiChatPanel.test.ts`
- Modify: `extension/src/popup/chat-message-model.ts`
- Reference: `server/src/experiments/kimi-acp/session-update-output.ts`

- [ ] **Step 1: Write the failing rendering tests**

Cover:
- thought content renders separately from the final assistant answer
- tool call updates render as status cards
- non-message updates still have a readable fallback

- [ ] **Step 2: Run the rendering tests to verify they fail**

Run:
- `cd extension && npm test -- src/popup/components/KimiChatPanel.test.ts src/popup/chat-message-model.test.ts`

Expected: FAIL because the popup still renders a simple text list

- [ ] **Step 3: Implement ACP-aware rendering**

Implement:
- collapsible thought section
- tool call cards with calling/success/error states
- final answer section separated from thoughts and tools
- no source/citation UI yet

- [ ] **Step 4: Run the tests again and make them pass**

Run:
- `cd extension && npm test -- src/popup/components/KimiChatPanel.test.ts src/popup/chat-message-model.test.ts`

Expected: PASS

## Task 4: Stop / Abort and Streaming Performance

**Files:**
- Modify: `extension/src/popup/kimi-chat.ts`
- Modify: `extension/src/popup/composables/use-popup-app.ts`
- Modify: `extension/src/popup/composables/use-popup-app.test.ts`
- Modify: `extension/src/popup/components/KimiChatPanel.vue`
- Modify: `extension/src/popup/components/KimiChatPanel.test.ts`
- Create: `extension/src/popup/markdown-stream.ts`
- Create: `extension/src/popup/markdown-stream.test.ts`

- [ ] **Step 1: Write the failing abort and throttling tests**

Cover:
- user can stop an in-flight response
- stopped responses do not append more chunks
- high-frequency update bursts are throttled
- incomplete Markdown does not break rendering during streaming

- [ ] **Step 2: Run the tests to verify they fail**

Run:
- `cd extension && npm test -- src/popup/composables/use-popup-app.test.ts src/popup/components/KimiChatPanel.test.ts src/popup/markdown-stream.test.ts`

Expected: FAIL because stop/throttling/markdown tolerance are not implemented yet

- [ ] **Step 3: Implement stop/abort and performance safeguards**

Implement:
- `AbortController` on the popup request path
- stop-generation button in the panel
- batched state updates via `requestAnimationFrame` or equivalent
- lightweight markdown streaming guard

- [ ] **Step 4: Run the tests again and make them pass**

Run:
- `cd extension && npm test -- src/popup/composables/use-popup-app.test.ts src/popup/components/KimiChatPanel.test.ts src/popup/markdown-stream.test.ts`

Expected: PASS

## Task 5: Capability-Gated Skills and Commands

**Files:**
- Modify: `extension/src/types/acp-kimi.ts`
- Modify: `extension/src/popup/chat-message-model.ts`
- Modify: `extension/src/popup/components/KimiChatPanel.vue`
- Modify: `extension/src/popup/components/KimiChatPanel.test.ts`
- Modify: `extension/src/popup/kimi-chat.ts`

- [ ] **Step 1: Capture actual capability fixtures**

Cover:
- `available_commands_update`
- any real skills-like capability emitted by upstream ACP

- [ ] **Step 2: Run probe-oriented tests**

Run:
- `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`

Expected:
- either a verified capability shape, or a documented stop condition

- [ ] **Step 3: Implement only the verified capability surface**

Rules:
- do not invent generic skills UI
- do not invent commands if upstream only supports prompt-prefill semantics
- no citations/sources in this task

- [ ] **Step 4: Run the tests again and make them pass**

Run:
- `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`

Expected: PASS for the verified capability shape

## Deferred Beyond This Plan

Do not include these in the next execution batch:

- citation/source jump UI
- search provenance cards
- background-owned session restore
- multi-tab or multi-popup synchronization
- session history recovery after popup close
