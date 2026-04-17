# ACP Chat Page Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `KimiChatPanel` to `AcpChatPanel` and refactor popup `Chat` into a real ACP chat page with a session toolbar and empty-session layout.

**Architecture:** Keep one user-visible `Chat` page, move page-level session UI into `ChatPage`, and keep the renamed `AcpChatPanel` focused on transcript/composer concerns. Reuse existing popup state in `usePopupApp` instead of introducing a second chat state model.

**Tech Stack:** Vue 3, Ant Design Vue, Vitest, Vue Test Utils

---

### Task 1: Lock the current rename and page-shell expectations in tests

**Files:**
- Modify: `extension/src/popup/components/KimiChatPanel.test.ts`
- Modify: `extension/src/popup/App.test.ts`
- Create/Modify: `extension/src/popup/pages/ChatPage.test.ts`

- [ ] **Step 1: Write the failing component rename expectation**

Update the chat panel test import target from `KimiChatPanel.vue` to `AcpChatPanel.vue`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/popup/components/KimiChatPanel.test.ts`
Expected: FAIL because `AcpChatPanel.vue` does not exist yet or import paths are stale.

- [ ] **Step 3: Add failing ChatPage toolbar/empty-state tests**

Cover:
- empty transcript shows session toolbar and empty-state copy
- transcript present still shows toolbar and mounts `AcpChatPanel`
- toolbar emits `newSession` and `openHistory`

- [ ] **Step 4: Run ChatPage tests to verify they fail**

Run: `cd extension && npx vitest run src/popup/pages/ChatPage.test.ts`
Expected: FAIL because `ChatPage` does not yet render the toolbar or emit those events.

### Task 2: Implement the rename and page restructuring

**Files:**
- Move/Modify: `extension/src/popup/components/KimiChatPanel.vue` -> `extension/src/popup/components/AcpChatPanel.vue`
- Modify: `extension/src/popup/pages/ChatPage.vue`
- Modify: `extension/src/popup/App.vue`
- Modify: `extension/src/popup/App.test.ts`

- [ ] **Step 1: Rename the chat panel component**

Rename the file and update component names/import sites to `AcpChatPanel`.

- [ ] **Step 2: Keep the chat panel contract stable**

Preserve props and events:
- `transcript`
- `busy`
- `draftMessage`
- `send`
- `stop`
- `update:draftMessage`

- [ ] **Step 3: Refactor ChatPage into a real page container**

Add:
- session toolbar header
- empty-session content wrapper
- `AcpChatPanel` mount path
- events for `newSession` and `openHistory`

- [ ] **Step 4: Wire App to the new ChatPage events**

Pass through:
- `resetKimiChatSession`
- placeholder handler for open history

- [ ] **Step 5: Keep unsupported handling intact**

Do not regress current unsupported page behavior.

### Task 3: Verify the refactor

**Files:**
- Test: `extension/src/popup/components/KimiChatPanel.test.ts`
- Test: `extension/src/popup/pages/ChatPage.test.ts`
- Test: `extension/src/popup/App.test.ts`

- [ ] **Step 1: Run renamed panel test**

Run: `cd extension && npx vitest run src/popup/components/KimiChatPanel.test.ts`
Expected: PASS

- [ ] **Step 2: Run ChatPage tests**

Run: `cd extension && npx vitest run src/popup/pages/ChatPage.test.ts`
Expected: PASS

- [ ] **Step 3: Run App composition tests**

Run: `cd extension && npx vitest run src/popup/App.test.ts`
Expected: PASS

- [ ] **Step 4: Run a focused popup regression batch**

Run: `cd extension && npx vitest run src/popup/components/KimiChatPanel.test.ts src/popup/pages/ChatPage.test.ts src/popup/App.test.ts src/popup/composables/use-popup-app.test.ts`
Expected: PASS
