# Lark OAuth Callback Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Lark auth with a real OAuth callback flow: server callback owns token exchange and identity confirmation, the callback page gives the user a clear browser-side completion prompt, and the extension learns the result through runtime message plus storage-backed fallback.

**Architecture:** Treat the server callback as the only source of truth for `state` validation, token exchange, and post-OAuth identity resolution. Treat the callback page as a thin bridge page only: it renders success/failure UI and exposes a compact auth result that a localhost-only extension content script relays back to the background. The background writes the latest auth result into extension storage, updates popup state immediately via runtime messaging, and falls back to `/api/lark/auth/status` if the callback message is missed.

**Tech Stack:** Express, TypeScript, Zod, SQLite, WXT, Chrome extension APIs, Vitest

---

## Implementation Decisions

- Use `server callback + callback completion page + extension storage/message sync`.
- Do not continue the old `content script reads code from a Lark page URL` path. The OAuth `code` exists only on the server callback URL.
- Keep the callback page dumb. It should not exchange tokens itself or decide auth state.
- Persist OAuth `state` server-side so callback correlation survives background/service-worker restarts.
- Use extension `runtime message` as the fast path and `chrome.storage.local` as the durable UI sync channel.
- Popup refresh logic must still tolerate missed events by re-checking `/api/lark/auth/status`.

## File Structure

All file paths below are relative to the repository root.

### Create

- `server/src/adapters/lark/oauth-session-store.ts`
  - Interface for pending/completed OAuth session records keyed by `state`
- `server/src/adapters/sqlite/lark-oauth-session-store.ts`
  - SQLite-backed OAuth session store
- `server/src/adapters/lark/token-store.ts`
  - Interface for persisted Lark user tokens keyed by `masterUserId`
- `server/src/adapters/sqlite/lark-token-store.ts`
  - SQLite-backed Lark token store
- `server/src/modules/lark-auth/lark-auth.controller.test.ts`
  - Controller coverage for callback/status/exchange flow
- `extension/src/content-scripts/lark-auth-callback.ts`
  - Callback-page bridge that reads server-rendered auth result and notifies the background
- `extension/src/entrypoints/lark-auth-callback.content.ts`
  - WXT content-script entrypoint for `http://localhost:3000/api/lark/auth/callback*`
- `extension/tests/lark-auth-handler.test.ts`
  - Background Lark auth flow coverage, including callback event handling

### Modify

- `server/src/adapters/sqlite/database.ts`
  - Add schema and migration support for Lark OAuth sessions and persisted Lark tokens
- `server/src/modules/lark-auth/lark-auth.dto.ts`
  - Move Lark auth requests to `masterUserId`-centric inputs and add callback/status payload types
- `server/src/modules/lark-auth/lark-auth.service.ts`
  - Add session creation, callback completion, token persistence, identity resolution, and real status lookup
- `server/src/modules/lark-auth/lark-auth.controller.ts`
  - Add callback controller and structured status responses
- `server/src/index.ts`
  - Register `GET /api/lark/auth/callback` and wire Lark auth deps
- `server/src/application/services/identity-resolution.service.ts`
  - Allow callback flow to upsert/confirm the Lark-side identity without duplicating resolve logic
- `extension/src/types/lark.ts`
  - Replace the old `operatorLarkId`-centric request/response model with OAuth session and callback result types
- `extension/src/types/protocol.ts`
  - Add callback-detected runtime action
- `extension/src/background/storage.ts`
  - Store pending OAuth session info plus the last callback result for popup sync
- `extension/src/background/router.ts`
  - Handle callback-detected messages and fan out storage/runtime updates
- `extension/src/background/handlers/lark-auth.ts`
  - Open OAuth tab, track pending `state`, consume callback events, and stop trying to read `code` from Lark tabs
- `extension/src/popup/runtime.ts`
  - Send `masterUserId`, register storage listeners, and refresh auth state after callback completion
- `extension/src/popup/composables/use-popup-app.ts`
  - Show “auth in progress / auth complete / auth failed” transitions and auto-refresh after callback completion
- `extension/src/popup/runtime.test.ts`
  - Cover callback-driven refresh behavior
- `extension/src/popup/composables/use-popup-app.test.ts`
  - Cover popup auto-refresh after auth completion

## Task 1: Lock the Lark OAuth contract around `masterUserId` and callback state

**Files:**
- Modify: `server/src/modules/lark-auth/lark-auth.dto.ts`
- Modify: `extension/src/types/lark.ts`
- Modify: `extension/src/types/protocol.ts`
- Modify: `extension/src/popup/runtime.ts`
- Create: `server/src/modules/lark-auth/lark-auth.controller.test.ts`
- Test: `server/src/modules/lark-auth/lark-auth.controller.test.ts`
- Test: `extension/src/popup/runtime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add controller assertions for the target request/response shape:

```ts
await expect(
  getAuthStatusController({
    masterUserId: "usr_lark_001",
    baseUrl: "https://open.larksuite.com",
  }),
).resolves.toEqual({
  ok: true,
  data: expect.objectContaining({
    status: "require_auth",
    masterUserId: "usr_lark_001",
  }),
});
```

Add a popup runtime test that locks the new runtime payload:

```ts
expect(sendRuntimeMessage).toHaveBeenCalledWith({
  action: "itdog.lark.auth.ensure",
  payload: expect.objectContaining({
    masterUserId: "usr_resolved",
    baseUrl: "https://open.larksuite.com",
  }),
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir server test -- --run src/modules/lark-auth/lark-auth.controller.test.ts`
Expected: FAIL because the DTO/controller still expect `operatorLarkId`

Run: `pnpm --dir extension test -- --run src/popup/runtime.test.ts`
Expected: FAIL because the runtime still sends a placeholder `ou_user`

- [ ] **Step 3: Write the minimal contract changes**

Change the Lark request model to center on:

```ts
export interface LarkAuthEnsureRequest {
  requestId?: string;
  masterUserId?: string;
  baseUrl?: string;
  pageOrigin?: string;
}
```

Add a dedicated callback relay action:

```ts
"itdog.lark.auth.callback.detected"
```

And define a callback result shape the background can store:

```ts
type LarkOauthCallbackResult = {
  state: string;
  status: "ready" | "failed";
  masterUserId?: string;
  reason?: string;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir server test -- --run src/modules/lark-auth/lark-auth.controller.test.ts`
Expected: PASS

Run: `pnpm --dir extension test -- --run src/popup/runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/lark-auth/lark-auth.dto.ts server/src/modules/lark-auth/lark-auth.controller.test.ts extension/src/types/lark.ts extension/src/types/protocol.ts extension/src/popup/runtime.ts extension/src/popup/runtime.test.ts
git commit -m "align lark auth contract with callback flow"
```

## Task 2: Add durable server-side stores for OAuth sessions and Lark tokens

**Files:**
- Create: `server/src/adapters/lark/oauth-session-store.ts`
- Create: `server/src/adapters/sqlite/lark-oauth-session-store.ts`
- Create: `server/src/adapters/lark/token-store.ts`
- Create: `server/src/adapters/sqlite/lark-token-store.ts`
- Modify: `server/src/adapters/sqlite/database.ts`
- Modify: `server/src/modules/lark-auth/lark-auth.service.ts`
- Test: `server/src/modules/lark-auth/lark-auth.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend `lark-auth.service.test.ts` with two persistence-focused cases:

```ts
it("creates a pending oauth session keyed by state", async () => {
  const session = await startLarkOauthSession({
    state: "state_123",
    baseUrl: "https://open.larksuite.com",
    masterUserId: "usr_123",
  });

  expect(session.status).toBe("pending");
});
```

```ts
it("returns ready when a stored Lark token exists for masterUserId", async () => {
  await tokenStore.save({
    masterUserId: "usr_123",
    larkUserId: "ou_123",
    accessToken: "token_123",
    accessTokenExpiresAt: "2099-04-01T12:00:00.000Z",
  });

  await expect(
    checkLarkAuthStatus({
      masterUserId: "usr_123",
      baseUrl: "https://open.larksuite.com",
    }),
  ).resolves.toMatchObject({ status: "ready" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir server test -- --run src/modules/lark-auth/lark-auth.service.test.ts`
Expected: FAIL because no Lark session/token stores exist yet

- [ ] **Step 3: Write the minimal implementation**

Add two SQLite-backed stores:

```ts
export interface StoredLarkOauthSession {
  state: string;
  masterUserId?: string;
  baseUrl: string;
  status: "pending" | "completed" | "failed";
  authCode?: string;
  completedMasterUserId?: string;
  errorCode?: string;
  expiresAt: string;
}
```

```ts
export interface StoredLarkToken {
  masterUserId: string;
  larkUserId: string;
  baseUrl: string;
  accessToken: string;
  accessTokenExpiresAt?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  credentialStatus?: "active" | "expired";
}
```

Update `database.ts` to create:

- `lark_oauth_sessions`
- `lark_tokens`

Do not reuse the current `user_tokens` table in this milestone; it is still Meegle-shaped (`plugin_token` is required). Keep this plan focused on getting Lark auth correct first.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir server test -- --run src/modules/lark-auth/lark-auth.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/adapters/sqlite/database.ts server/src/adapters/lark server/src/adapters/sqlite/lark-oauth-session-store.ts server/src/adapters/sqlite/lark-token-store.ts server/src/modules/lark-auth/lark-auth.service.ts server/src/modules/lark-auth/lark-auth.service.test.ts
git commit -m "persist lark oauth sessions and tokens"
```

## Task 3: Implement the server callback route and completion page

**Files:**
- Modify: `server/src/modules/lark-auth/lark-auth.service.ts`
- Modify: `server/src/modules/lark-auth/lark-auth.controller.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/application/services/identity-resolution.service.ts`
- Test: `server/src/modules/lark-auth/lark-auth.controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a controller test for the callback happy path:

```ts
await expect(
  handleLarkAuthCallbackController({
    query: { code: "code_123", state: "state_123" },
  }),
).resolves.toMatchObject({
  statusCode: 200,
  contentType: "text/html",
  body: expect.stringContaining("Lark 授权完成"),
});
```

And one failure case:

```ts
expect(body).toContain("state 校验失败");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir server test -- --run src/modules/lark-auth/lark-auth.controller.test.ts`
Expected: FAIL because no callback controller exists

- [ ] **Step 3: Write the minimal implementation**

The callback controller should:

1. Load the pending OAuth session by `state`
2. Reject missing/expired/unknown state
3. Exchange `code` for Lark user token
4. Fetch the authoritative Lark user identity
5. Upsert the resolved user to active status
6. Persist the Lark token
7. Mark the OAuth session completed
8. Return a small HTML page with visible success/failure copy and machine-readable data attributes

Minimal HTML contract:

```html
<body
  data-lark-auth-state="state_123"
  data-lark-auth-status="ready"
  data-lark-auth-master-user-id="usr_123"
>
  <main>授权完成，现在可以回到插件继续。</main>
</body>
```

The HTML page is not the source of truth. It is only a bridge page plus user-facing confirmation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir server test -- --run src/modules/lark-auth/lark-auth.controller.test.ts src/modules/lark-auth/lark-auth.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/lark-auth/lark-auth.controller.ts server/src/modules/lark-auth/lark-auth.controller.test.ts server/src/modules/lark-auth/lark-auth.service.ts server/src/application/services/identity-resolution.service.ts server/src/index.ts
git commit -m "add lark oauth callback completion flow"
```

## Task 4: Replace the old background flow with callback-aware OAuth tracking

**Files:**
- Modify: `extension/src/background/handlers/lark-auth.ts`
- Modify: `extension/src/background/router.ts`
- Modify: `extension/src/background/storage.ts`
- Create: `extension/tests/lark-auth-handler.test.ts`
- Test: `extension/tests/lark-auth-handler.test.ts`

- [ ] **Step 1: Write the failing tests**

Add one background-flow test for the OAuth launch path:

```ts
it("opens the lark oauth tab and stores the pending state", async () => {
  await ensureLarkAuth(
    {
      requestId: "req_1",
      masterUserId: "usr_1",
      baseUrl: "https://open.larksuite.com",
    },
    deps,
  );

  expect(openLarkOAuthTab).toHaveBeenCalled();
  expect(savePendingLarkOauthState).toHaveBeenCalledWith(
    expect.objectContaining({ state: expect.stringMatching(/^state_/) }),
  );
});
```

Add one callback-relay test:

```ts
it("stores callback completion and returns ready after callback message", async () => {
  await handleLarkAuthCallbackDetected({
    state: "state_123",
    status: "ready",
    masterUserId: "usr_123",
  });

  expect(saveLastLarkAuthResult).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir extension test -- --run tests/lark-auth-handler.test.ts`
Expected: FAIL because the background still tries to request `authCode` from content scripts

- [ ] **Step 3: Write the minimal implementation**

In `lark-auth.ts`:

- remove `requestAuthCodeFromContentScript`
- start by checking stored token status or server `/status`
- when auth is required, generate `state`, save pending session metadata, open OAuth tab, and return an in-progress result

In `storage.ts`, add:

```ts
pendingLarkOauthState?: string;
pendingLarkOauthStartedAt?: string;
lastLarkAuthResult?: LarkOauthCallbackResult;
```

In `router.ts`, add a handler for:

```ts
action: "itdog.lark.auth.callback.detected"
```

That handler should persist the callback result and notify open popup views through the existing runtime channel or storage listener.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir extension test -- --run tests/lark-auth-handler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/background/handlers/lark-auth.ts extension/src/background/router.ts extension/src/background/storage.ts extension/tests/lark-auth-handler.test.ts
git commit -m "track lark oauth state in the extension background"
```

## Task 5: Add the callback-page bridge and popup auto-refresh

**Files:**
- Create: `extension/src/content-scripts/lark-auth-callback.ts`
- Create: `extension/src/entrypoints/lark-auth-callback.content.ts`
- Modify: `extension/src/popup/runtime.ts`
- Modify: `extension/src/popup/composables/use-popup-app.ts`
- Modify: `extension/src/popup/runtime.test.ts`
- Modify: `extension/src/popup/composables/use-popup-app.test.ts`
- Test: `extension/src/popup/runtime.test.ts`
- Test: `extension/src/popup/composables/use-popup-app.test.ts`

- [ ] **Step 1: Write the failing tests**

In `runtime.test.ts`, add a storage-listener case:

```ts
it("refreshes lark auth when the callback result arrives in storage", async () => {
  // fire chrome.storage.onChanged with lastLarkAuthResult
  expect(runLarkAuthRequest).toHaveBeenCalledTimes(1);
});
```

In `use-popup-app.test.ts`, add a UI-flow case:

```ts
it("logs success and updates lark auth after callback completion", async () => {
  // initialize popup, simulate stored callback result, expect success log + ready state
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir extension test -- --run src/popup/runtime.test.ts src/popup/composables/use-popup-app.test.ts`
Expected: FAIL because no callback bridge or storage-driven refresh exists

- [ ] **Step 3: Write the minimal implementation**

The callback content script should:

1. Read the server-rendered `data-lark-auth-*` attributes
2. Send a runtime message to the background
3. Optionally update the page copy to “插件已收到授权结果，可以关闭此页”

Minimal bridge:

```ts
chrome.runtime.sendMessage({
  action: "itdog.lark.auth.callback.detected",
  payload: {
    state,
    status,
    masterUserId,
    reason,
  },
});
```

Popup behavior:

- register `chrome.storage.onChanged`
- when `lastLarkAuthResult.status === "ready"`, re-run `/api/lark/auth/status`
- if the callback result includes a newer `masterUserId`, persist it locally
- append a human-readable log line instead of silently flipping state

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir extension test -- --run src/popup/runtime.test.ts src/popup/composables/use-popup-app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/content-scripts/lark-auth-callback.ts extension/src/entrypoints/lark-auth-callback.content.ts extension/src/popup/runtime.ts extension/src/popup/runtime.test.ts extension/src/popup/composables/use-popup-app.ts extension/src/popup/composables/use-popup-app.test.ts
git commit -m "bridge lark oauth callback results back into the popup"
```

## Task 6: End-to-end verification and doc sync

**Files:**
- Modify: `docs/tenways-octo/18-user-identity-design.md`
- Modify: `docs/tenways-octo/README.md`

- [ ] **Step 1: Run focused automated checks**

Run: `pnpm --dir server test -- --run src/modules/lark-auth/lark-auth.service.test.ts src/modules/lark-auth/lark-auth.controller.test.ts`
Expected: PASS

Run: `pnpm --dir extension test -- --run tests/lark-auth-handler.test.ts src/popup/runtime.test.ts src/popup/composables/use-popup-app.test.ts`
Expected: PASS

- [ ] **Step 2: Run typechecks/builds**

Run: `pnpm --dir extension typecheck`
Expected: PASS

Run: `pnpm --dir extension build`
Expected: PASS

Run: `npm --prefix server test`
Expected: PASS

- [ ] **Step 3: Manual dogfood checklist**

- [ ] Start server on `http://localhost:3000`
- [ ] Open popup and click `授权 Lark`
- [ ] Confirm a new OAuth tab opens with a generated `state`
- [ ] Approve Lark auth
- [ ] Verify the callback page shows success text
- [ ] Verify the popup flips to `Lark 已授权` without reopening the popup
- [ ] Reopen the popup and verify status still comes back `ready`
- [ ] Restart the extension service worker and verify `/api/lark/auth/status` still reports `ready`
- [ ] Repeat with a forced callback failure and verify the popup shows a readable error log

- [ ] **Step 4: Update docs only after behavior is verified**

Record the final mechanism in `18-user-identity-design.md` as:

- server callback is authoritative
- callback page is user feedback plus extension bridge
- runtime message is the fast path
- storage/status refresh is the fallback

- [ ] **Step 5: Commit**

```bash
git add docs/tenways-octo/18-user-identity-design.md docs/tenways-octo/README.md
git commit -m "document the completed lark oauth callback flow"
```

## Risks To Watch

- The extension service worker can restart mid-flow. That is why the server must persist OAuth session state and the popup must tolerate missed events.
- The callback page can render before the extension content script runs. Keep the relay payload in stable DOM attributes, not in transient inline JS state only.
- The background may receive the callback result before the popup is open. Storage must stay the durable sync channel.
- Current docs describe a unified `user_tokens` target model, but current SQLite schema is still Meegle-specific. This plan intentionally avoids a broad token-table refactor so the Lark auth milestone stays bounded.

## Definition Of Done

- Clicking `授权 Lark` opens the OAuth page instead of returning a dead-end warning.
- Server callback validates `state`, exchanges the code, confirms the Lark identity, and persists the token.
- The callback page shows human-readable success/failure copy.
- The extension learns the callback result through runtime message and persists it into storage.
- Popup state moves to `ready` without scraping `code` from any Lark page URL.
- A missed callback event can still be recovered by reopening the popup and hitting `/api/lark/auth/status`.
