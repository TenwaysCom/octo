# Kimi ACP Plugin-to-Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the plugin -> backend -> `kimi acp` path end-to-end, then grow it into a single-session multi-turn chat surface before improving ACP event rendering and adding command/skill capabilities.

**Architecture:** Use the existing REPL experiment as the reference ACP client and move one layer up in small product-facing milestones. The backend owns the `kimi acp` subprocess and ACP session lifecycle; the popup is a thin chat probe that first proves a single streamed turn, then reuses one backend-owned session for follow-up turns, and only after that adds richer rendering and command/skill affordances.

**Tech Stack:** TypeScript, Express 5, `@agentclientprotocol/sdk`, Node stdio subprocesses, Server-Sent Events, Vue 3, Vitest

---

## Scope and Product Boundaries

This plan is intentionally split by user-visible capability, not backend layering.

Constraints that apply to every phase:

- keep PM Analysis ACP V1 separate; this plan is only for the Kimi ACP track
- use the existing REPL experiment as the semantic reference for session reuse and ACP update handling
- do not introduce background-port routing, multi-popup fanout, or popup recovery in the first two phases
- keep the first multi-turn checkpoint to **single popup, single session, in-memory state**
- treat `commands` and `skills` as separate phases; do not promise skill support until Kimi ACP capability signals are verified in practice

## REPL-to-Bridge Mapping

Use the existing REPL as the protocol reference, but not as the final transport or UI architecture.

| REPL unit | Current role in the experiment | ACP mechanism | Bridge/popup target | Keep or change |
| --- | --- | --- | --- | --- |
| `server/src/experiments/kimi-acp/config.ts` | Parses `KIMI_ACP_COMMAND`, `KIMI_ACP_ARGS_JSON`, `KIMI_ACP_ENV_JSON` and builds `spawn()` config | ACP agent bootstrap over local stdio; startup config normalization before `initialize` | Reuse as `server/src/adapters/kimi-acp/kimi-acp-config.ts` for backend-owned runtime startup | Keep the mechanism; move into backend adapter naming |
| `server/examples/kimi-acp-client/repl.ts` | Owns subprocess startup, ACP connection wiring, input loop, and terminal output | Local ACP client over `ndJsonStream`, then `initialize -> session/new -> session/prompt` | Split into backend route/controller ownership plus popup chat probe | Split apart; do not carry over stdin/stdout loop or terminal UX |
| `server/src/experiments/kimi-acp/interactive-session.ts` | Creates one ACP session and reuses it for every prompt line | Single ACP session, serial prompt turns, in-memory `sessionId` reuse | Backend runtime methods plus bridge service follow-up orchestration | Keep the session reuse mechanism; remove CLI line-reading responsibility |
| `server/src/experiments/kimi-acp/process-lifecycle.ts` | Guards child-process startup/exit and performs cleanup on shutdown | ACP runtime lifecycle guard around a long-lived stdio subprocess | Backend runtime lifecycle, downstream abort handling, idle cleanup | Keep the guard pattern; expand exit conditions for HTTP/SSE lifecycle |
| `LoggingClient.sessionUpdate()` in `server/examples/kimi-acp-client/repl.ts` | Receives streamed ACP updates and hands them to the renderer | ACP `session/update` callback path for message, thought, tool, and metadata events | Backend callback that forwards SSE; popup parser that updates transcript state | Keep update classification semantics; replace direct terminal writes |
| `server/src/experiments/kimi-acp/session-update-output.ts` | Interprets ACP updates into message/thought/tool/status display semantics | ACP update-type discrimination: `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `current_mode_update`, `session_info_update` | Popup-friendly transcript/event parser and optional raw debug fallback | Keep the classification model; redesign the display layer for popup UI |
| `server/src/experiments/kimi-acp/repl-output-writer.ts` | Merges thought chunks and writes human-readable terminal output | Human-mode rendering over ACP thought/message/tool updates | Popup transcript rendering and debug/raw mode toggles | Replace; terminal-specific merge logic should not leak into backend transport |
| `requestPermission()` in `server/examples/kimi-acp-client/repl.ts` | Cancels every permission request by default | ACP permission request interception during tool or command execution | Backend permission strategy and later popup command/skill UX | Change; current always-cancel behavior is only safe for the experiment |
| REPL in-memory process state | Holds one live ACP session for one terminal process | One local client process owns one live ACP session until user exits | Backend session registry keyed by `sessionId` and `operatorLarkId` | Change; move from process-local memory to backend-owned live session registry |

## File Structure

### Create

- `server/src/modules/acp-kimi/acp-kimi.dto.ts`
  - request schema, bridge session schema, typed SSE payload schema/types
- `server/src/modules/acp-kimi/event-stream.ts`
  - SSE frame writer helpers for the Kimi bridge route
- `server/src/modules/acp-kimi/acp-kimi.controller.ts`
  - Express controller for `POST /api/acp/kimi/chat`
- `server/src/adapters/kimi-acp/kimi-acp-config.ts`
  - env parsing for `KIMI_ACP_COMMAND`, `KIMI_ACP_ARGS_JSON`, `KIMI_ACP_ENV_JSON`, and idle TTL
- `server/src/adapters/kimi-acp/kimi-acp-runtime.ts`
  - ACP runtime wrapper around `spawn(command, args, { env })`, initialization, prompt streaming, and cleanup
- `server/src/adapters/kimi-acp/kimi-session-registry.ts`
  - live-session metadata types and registry interface
- `server/src/adapters/kimi-acp/in-memory-kimi-session-registry.ts`
  - in-memory live-session registry for the first bridge checkpoint
- `server/src/application/services/acp-kimi-proxy.service.ts`
  - first-turn and follow-up orchestration over live ACP runtimes
- `server/tests/acp-kimi.dto.test.ts`
  - contract coverage for request parsing and SSE event payloads
- `server/tests/kimi-acp-runtime.test.ts`
  - runtime lifecycle coverage using a stubbed ACP seam
- `server/tests/kimi-session-registry.test.ts`
  - live-session registry behavior and ownership lookups
- `server/tests/acp-kimi-proxy.service.test.ts`
  - first-turn, follow-up, abort, and ownership behavior coverage
- `server/tests/acp-kimi.controller.test.ts`
  - SSE controller coverage using a mocked Express `Response`
- `extension/src/types/acp-kimi.ts`
  - popup-facing event and conversation types for the Kimi chat probe
- `extension/src/popup/kimi-chat.ts`
  - thin popup client for `fetch + ReadableStream` against `/api/acp/kimi/chat`
- `extension/src/popup/kimi-chat.test.ts`
  - parser and state-transition coverage for SSE event handling
- `extension/src/popup/components/KimiChatPanel.vue`
  - minimal chat surface for the popup
- `extension/src/popup/components/KimiChatPanel.test.ts`
  - rendering coverage for input, messages, and state transitions

### Modify

- `server/src/index.ts`
  - register the streaming Kimi ACP route outside the JSON `handleController()` wrapper
- `server/.env.example`
  - document Kimi ACP bridge config
- `server/README.md`
  - add the Kimi ACP bridge route and smoke-test examples
- `extension/src/popup/composables/use-popup-app.ts`
  - mount the chat probe into the existing popup action flow
- `extension/src/popup/pages/HomePage.vue`
  - render the Kimi chat panel without replacing the existing feature cards
- `extension/src/popup/types.ts`
  - add popup-level chat state and log typing if needed
- `docs/superpowers/plans/2026-03-30-acp-backend-inheritance-implementation-plan.md`
  - keep the REPL checkpoint synced as the prerequisite for this Kimi track

## Route Contract

The bridge route stays fixed across the first three phases:

- `POST /api/acp/kimi/chat`

Request body shape:

```ts
{
  operatorLarkId: "ou_xxx",
  message: "帮我拆一下这个需求",
  sessionId?: "sess_kimi_bridge_001"
}
```

Core SSE event sequence:

```text
event: session.created
data: {"sessionId":"sess_kimi_bridge_001"}

event: acp.session.update
data: {"sessionId":"sess_kimi_bridge_001","update":{...}}

event: done
data: {"sessionId":"sess_kimi_bridge_001","stopReason":"end_turn"}
```

Bridge rules:

- first turn: omit `sessionId`
- follow-up turns: reuse the returned `sessionId`
- ownership is keyed by `operatorLarkId`
- popup display flags never travel to the backend API

## Task 1: Single-Turn End-to-End Skeleton

**Files:**
- Create: `server/src/modules/acp-kimi/acp-kimi.dto.ts`
- Create: `server/src/modules/acp-kimi/event-stream.ts`
- Create: `server/src/modules/acp-kimi/acp-kimi.controller.ts`
- Create: `server/src/adapters/kimi-acp/kimi-acp-config.ts`
- Create: `server/src/adapters/kimi-acp/kimi-acp-runtime.ts`
- Create: `server/src/application/services/acp-kimi-proxy.service.ts`
- Create: `server/tests/acp-kimi.dto.test.ts`
- Create: `server/tests/kimi-acp-runtime.test.ts`
- Create: `server/tests/acp-kimi.controller.test.ts`
- Create: `extension/src/types/acp-kimi.ts`
- Create: `extension/src/popup/kimi-chat.ts`
- Create: `extension/src/popup/kimi-chat.test.ts`
- Create: `extension/src/popup/components/KimiChatPanel.vue`
- Create: `extension/src/popup/components/KimiChatPanel.test.ts`
- Modify: `server/src/index.ts`
- Modify: `server/.env.example`
- Modify: `server/README.md`
- Modify: `extension/src/popup/composables/use-popup-app.ts`
- Modify: `extension/src/popup/pages/HomePage.vue`

- [ ] **Step 1: Write the failing backend contract and popup parser tests**

Write:
- `server/tests/acp-kimi.dto.test.ts`
- `server/tests/acp-kimi.controller.test.ts`
- `extension/src/popup/kimi-chat.test.ts`
- `extension/src/popup/components/KimiChatPanel.test.ts`

Cover the minimum product proof:
- popup can send one message
- backend can emit `session.created`, at least one `acp.session.update`, and `done`
- popup can parse SSE frames and append them to a visible transcript

- [ ] **Step 2: Run the new tests to verify they fail**

Run:
- `cd server && npm test -- tests/acp-kimi.dto.test.ts tests/acp-kimi.controller.test.ts`
- `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`

Expected: FAIL because the bridge route, popup client, and chat panel do not exist yet

- [ ] **Step 3: Implement the single-turn bridge and popup probe**

Implement the minimum viable path:
- backend route `POST /api/acp/kimi/chat`
- backend runtime launches `kimi acp` and handles one streamed turn
- popup chat panel with:
  - one input field
  - one send button
  - streaming transcript area
- `runFeatureAction("analyze")` or an adjacent chat entrypoint opens the panel instead of staying as a placeholder

Keep strict limits:
- no session reuse yet
- no background worker routing
- no popup recovery after close
- no multi-tab synchronization

- [ ] **Step 4: Run the tests again and make them pass**

Run:
- `cd server && npm test -- tests/acp-kimi.dto.test.ts tests/kimi-acp-runtime.test.ts tests/acp-kimi.controller.test.ts`
- `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`

Expected: PASS

- [ ] **Step 5: Run the end-to-end smoke check**

Run:
- `cd server && npm run build`
- `cd extension && npm test -- src/popup/kimi-chat.test.ts`
- manually open the popup and send one message

Expected:
- popup transcript shows one streamed reply
- backend emits `session.created`, one or more `acp.session.update`, and `done`

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/acp-kimi server/src/adapters/kimi-acp server/src/application/services/acp-kimi-proxy.service.ts server/tests/acp-kimi.dto.test.ts server/tests/kimi-acp-runtime.test.ts server/tests/acp-kimi.controller.test.ts server/src/index.ts server/.env.example server/README.md extension/src/types/acp-kimi.ts extension/src/popup/kimi-chat.ts extension/src/popup/kimi-chat.test.ts extension/src/popup/components/KimiChatPanel.vue extension/src/popup/components/KimiChatPanel.test.ts extension/src/popup/composables/use-popup-app.ts extension/src/popup/pages/HomePage.vue
git commit -m "add single turn kimi acp popup bridge"
```

## Task 2: Single-Session Multi-Turn Chat

**Files:**
- Create: `server/src/adapters/kimi-acp/kimi-session-registry.ts`
- Create: `server/src/adapters/kimi-acp/in-memory-kimi-session-registry.ts`
- Create: `server/tests/kimi-session-registry.test.ts`
- Create: `server/tests/acp-kimi-proxy.service.test.ts`
- Modify: `server/src/application/services/acp-kimi-proxy.service.ts`
- Modify: `server/src/modules/acp-kimi/acp-kimi.controller.ts`
- Modify: `extension/src/types/acp-kimi.ts`
- Modify: `extension/src/popup/kimi-chat.ts`
- Modify: `extension/src/popup/components/KimiChatPanel.vue`
- Modify: `extension/src/popup/components/KimiChatPanel.test.ts`
- Modify: `extension/src/popup/composables/use-popup-app.ts`

- [ ] **Step 1: Write the failing follow-up tests**

Add failing tests for:
- backend session reuse by `sessionId`
- `operatorLarkId` ownership checks
- popup transcript history persistence while the popup remains open
- second send reusing the first turn’s `sessionId`

- [ ] **Step 2: Run the follow-up tests to verify they fail**

Run:
- `cd server && npm test -- tests/kimi-session-registry.test.ts tests/acp-kimi-proxy.service.test.ts`
- `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`

Expected: FAIL because session reuse and follow-up state do not exist yet

- [ ] **Step 3: Implement single-popup multi-turn support**

Implement:
- in-memory bridge session registry on the backend
- runtime reuse keyed by bridge `sessionId`
- popup-local state for:
  - `sessionId`
  - transcript messages
  - pending input
  - `isStreaming`

Keep the scope narrow:
- single popup
- single active conversation
- no history restore after popup closes
- no background-owned session state

- [ ] **Step 4: Run the tests again and make them pass**

Run:
- `cd server && npm test -- tests/kimi-session-registry.test.ts tests/acp-kimi-proxy.service.test.ts tests/acp-kimi.controller.test.ts`
- `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`

Expected: PASS

- [ ] **Step 5: Run the multi-turn smoke check**

Manual verification:
- open popup
- send first message
- send second follow-up message without reloading the popup

Expected:
- second request carries the first turn’s `sessionId`
- backend reuses the same live ACP session
- Kimi responds with prior-turn context intact

- [ ] **Step 6: Commit**

```bash
git add server/src/adapters/kimi-acp server/src/application/services/acp-kimi-proxy.service.ts server/tests/kimi-session-registry.test.ts server/tests/acp-kimi-proxy.service.test.ts server/src/modules/acp-kimi/acp-kimi.controller.ts extension/src/types/acp-kimi.ts extension/src/popup/kimi-chat.ts extension/src/popup/components/KimiChatPanel.vue extension/src/popup/components/KimiChatPanel.test.ts extension/src/popup/composables/use-popup-app.ts
git commit -m "add single session kimi acp followups"
```

## Task 3: ACP Event Rendering and Display Modes

**Files:**
- Modify: `server/src/modules/acp-kimi/acp-kimi.dto.ts`
- Modify: `extension/src/types/acp-kimi.ts`
- Modify: `extension/src/popup/kimi-chat.ts`
- Modify: `extension/src/popup/components/KimiChatPanel.vue`
- Modify: `extension/src/popup/components/KimiChatPanel.test.ts`
- Reference: `server/examples/kimi-acp-client/repl.ts`
- Reference: `server/src/experiments/kimi-acp/session-update-output.ts`

- [ ] **Step 1: Write the failing rendering tests**

Cover:
- assistant message rendering
- thought rendering with human-friendly merging semantics where appropriate
- tool call and tool update rendering
- `plan`, `current_mode_update`, and `session_info_update` summaries
- raw event fallback for unsupported update kinds

- [ ] **Step 2: Run the rendering tests to verify they fail**

Run: `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`
Expected: FAIL because the popup still treats streamed updates as plain text

- [ ] **Step 3: Implement ACP-aware rendering**

Use the REPL experiment as the semantic reference:
- keep assistant text readable
- distinguish thought from assistant answer
- group tool activity instead of dumping opaque JSON
- keep a raw/debug mode available for unsupported payloads

Do not overbuild:
- no markdown renderer
- no complex rich text
- no background-owned display state

- [ ] **Step 4: Run the rendering tests again and make them pass**

Run: `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`
Expected: PASS

- [ ] **Step 5: Run the UI smoke check**

Manual verification with a prompt that triggers thought/tool output if available.

Expected:
- popup transcript clearly separates message, thought, and tool updates
- unsupported updates remain inspectable instead of disappearing silently

- [ ] **Step 6: Commit**

```bash
git add extension/src/types/acp-kimi.ts extension/src/popup/kimi-chat.ts extension/src/popup/components/KimiChatPanel.vue extension/src/popup/components/KimiChatPanel.test.ts server/src/modules/acp-kimi/acp-kimi.dto.ts
git commit -m "improve kimi acp popup rendering"
```

## Task 4: Capability-Gated Skills Support

**Files:**
- Modify: `server/src/modules/acp-kimi/acp-kimi.dto.ts`
- Modify: `extension/src/types/acp-kimi.ts`
- Modify: `extension/src/popup/kimi-chat.ts`
- Modify: `extension/src/popup/components/KimiChatPanel.vue`
- Modify: `extension/src/popup/components/KimiChatPanel.test.ts`
- Docs: `server/README.md`

- [ ] **Step 1: Write the capability probe and failing skill tests**

Before promising UI support, capture actual upstream capability signals in tests or fixtures:
- does Kimi ACP emit skill metadata or skill-selection affordances?
- are skills represented as commands, tool calls, mode switches, or a separate structure?

Write failing tests only for the behavior that is actually observed.

- [ ] **Step 2: Run the capability probe and tests**

Run:
- capture a real ACP session fixture from the bridge or REPL
- `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`

Expected:
- either a verified skill-capability shape, or a documented stop condition that defers the phase

- [ ] **Step 3: Implement the minimal verified skill surface**

Rules:
- do not invent a generic “skills system” in the popup
- only expose the exact capability shape Kimi ACP actually returns
- if the capability is not stable or not exposed, stop and document the gap instead of shipping a speculative UI

- [ ] **Step 4: Run the tests again and make them pass**

Run: `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`
Expected: PASS for the verified capability shape, or no-op with the documented stop condition

- [ ] **Step 5: Update docs and commit**

Document whether skills are:
- supported and surfaced
- command-backed
- unsupported in the current Kimi ACP surface

```bash
git add extension/src/types/acp-kimi.ts extension/src/popup/kimi-chat.ts extension/src/popup/components/KimiChatPanel.vue extension/src/popup/components/KimiChatPanel.test.ts server/src/modules/acp-kimi/acp-kimi.dto.ts server/README.md
git commit -m "add capability gated kimi skill support"
```

## Task 5: Optional Commands Phase

**Files:**
- Modify: `extension/src/types/acp-kimi.ts`
- Modify: `extension/src/popup/kimi-chat.ts`
- Modify: `extension/src/popup/components/KimiChatPanel.vue`
- Modify: `extension/src/popup/components/KimiChatPanel.test.ts`
- Modify: `server/src/modules/acp-kimi/acp-kimi.dto.ts`

- [ ] **Step 1: Write the failing command discovery tests**

Cover:
- popup receives and stores `available_commands_update`
- popup renders the currently available commands
- selecting a command injects a valid command-form input into the send flow

- [ ] **Step 2: Run the command tests to verify they fail**

Run: `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`
Expected: FAIL because command discovery is not surfaced yet

- [ ] **Step 3: Implement command discovery and invocation**

Important boundary:
- only implement commands that are actually exposed by upstream ACP updates
- if command invocation is prompt-shaped in practice, treat selection as input prefill instead of inventing a fake RPC
- do not build a large command palette in this phase

- [ ] **Step 4: Run the command tests again and make them pass**

Run: `cd extension && npm test -- src/popup/kimi-chat.test.ts src/popup/components/KimiChatPanel.test.ts`
Expected: PASS

- [ ] **Step 5: Smoke-test available commands manually**

Expected:
- command list appears when Kimi ACP advertises commands
- selecting one results in a valid outbound request and visible response

- [ ] **Step 6: Commit**

```bash
git add extension/src/types/acp-kimi.ts extension/src/popup/kimi-chat.ts extension/src/popup/components/KimiChatPanel.vue extension/src/popup/components/KimiChatPanel.test.ts server/src/modules/acp-kimi/acp-kimi.dto.ts
git commit -m "surface kimi acp commands in popup"
```

This phase is optional for the first usable checkpoint.

Only start it after Task 1, Task 2, Task 3, and any chosen skill work are green and the core chat path already feels stable.

## Exit Criteria

Do not move to background-owned session routing or multi-popup synchronization until all of these are true:

- popup can complete a first turn against `/api/acp/kimi/chat`
- popup can complete a follow-up turn against the same backend-owned `sessionId`
- ACP message, thought, and tool output are readable in the popup
- any skill support that ships is grounded in real Kimi ACP capability signals, not guessed UI

Optional extension after the main checkpoint:

- command support is verified against real upstream capability signals

## Notes

- This plan intentionally starts with a popup probe because the product risk is “does plugin -> backend -> Kimi ACP feel real,” not “can the backend stream SSE in isolation.”
- The first two phases are deliberately underpowered: single popup, single session, in-memory state. That is a feature, not a bug.
- The REPL remains the protocol/debug reference. The popup should borrow its semantics, not its terminal formatting.
