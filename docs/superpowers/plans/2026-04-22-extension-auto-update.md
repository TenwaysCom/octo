# Extension Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a self-hosted auto-update mechanism for the Tenways Octo browser extension, including silent version checking, visual update prompts (badge + popup banner), download, and installation guidance.

**Architecture:** The background script checks the server for new versions on startup, via alarms every 24h, and when the popup opens. New version state is persisted in `chrome.storage.local` and surfaced through the popup store. The popup renders an update banner when an update is available. Download uses Chrome's `downloads` API. Installation is manual due to Chrome security restrictions.

**Tech Stack:** TypeScript, WXT, Chrome Extension APIs (alarms, downloads, notifications), React, Zod, Vitest

**PRD Reference:** `docs/prd-auto-update.md`

---

### Task 1: Add update types and storage helpers

**Files:**
- Create: `extension/src/types/update.ts`
- Modify: `extension/src/background/storage.ts`

- [ ] **Step 1: Define `ExtensionVersionInfo`, `UpdateCheckResult`, and `UpdateState` types in `types/update.ts`**
- [ ] **Step 2: Add update-state storage helpers (`getUpdateState`, `saveUpdateState`, `clearIgnoredVersion`) in `background/storage.ts`**
- [ ] **Step 3: Add a targeted vitest test for storage helpers (`background/storage.test.ts`) and confirm it passes**

---

### Task 2: Build background update checker

**Files:**
- Create: `extension/src/background/update-checker.ts`
- Create: `extension/src/background/update-checker.test.ts`
- Modify: `extension/src/background/router.ts`

- [ ] **Step 1: Implement `checkForUpdate(config)` that fetches `/api/extension/version`, compares semver with manifest version, and returns `UpdateCheckResult`**
- [ ] **Step 2: Implement `setUpdateBadge()` and `clearUpdateBadge()` using `chrome.action.setBadgeText/Color`**
- [ ] **Step 3: Implement `showForceUpdateNotification(versionInfo)` using `chrome.notifications.create` (only when `forceUpdate === true`)**
- [ ] **Step 4: Implement `downloadUpdate(versionInfo)` using `chrome.downloads.download` with `saveAs: false`**
- [ ] **Step 5: Wire `itdog.update.check` and `itdog.update.download` actions into `background/router.ts`**
- [ ] **Step 6: Write tests for update-checker logic (version comparison, ignore logic, failure handling) and confirm they pass**

---

### Task 3: Register periodic checks in background entrypoint

**Files:**
- Modify: `extension/src/entrypoints/background.ts`
- Modify: `extension/wxt.config.ts`

- [ ] **Step 1: In `background.ts`, create an alarm on startup with `chrome.alarms.create('check-update', { periodInMinutes: 1440 })`**
- [ ] **Step 2: Add `chrome.alarms.onAlarm` listener that triggers `checkForUpdate` for the `'check-update'` alarm**
- [ ] **Step 3: Also trigger a check immediately on `chrome.runtime.onStartup` and `chrome.runtime.onInstalled`**
- [ ] **Step 4: Add `alarms` permission to `manifest.permissions` in `wxt.config.ts`**
- [ ] **Step 5: Add `notifications` permission to `manifest.permissions` in `wxt.config.ts` (optional but PRD requests it)**
- [ ] **Step 6: Build the extension (`pnpm --dir extension build`) and confirm no manifest/type errors**

---

### Task 4: Surface update state in popup store

**Files:**
- Modify: `extension/src/popup-shared/popup-controller.ts`
- Modify: `extension/src/popup-shared/popup-controller.test.ts`

- [ ] **Step 1: Add `update: UpdateState | null` to `PopupAppStore` and `PopupControllerState`**
- [ ] **Step 2: On `initialize()`, call the background `itdog.update.check` action and populate store `update` field**
- [ ] **Step 3: Add `ignoreUpdateVersion()`, `downloadUpdate()`, and `clearUpdateBadge()` controller methods exposed to the popup**
- [ ] **Step 4: Ensure badge is cleared when popup opens (call `chrome.action.setBadgeText({ text: '' })`)**
- [ ] **Step 5: Update controller tests to cover update state initialization and actions**

---

### Task 5: Build popup update banner component

**Files:**
- Create: `extension/src/popup-react/components/UpdateBanner.tsx`
- Create: `extension/src/popup-react/components/UpdateBanner.test.tsx`
- Modify: `extension/src/popup-react/PopupAppView.tsx`

- [ ] **Step 1: Build `UpdateBanner` React component showing current vs new version, release notes, "立即更新" button, and "忽略此版本" button**
- [ ] **Step 2: Style the banner with a distinct notification-bar look (use existing Tailwind classes, keep it simple)**
- [ ] **Step 3: Show a download-progress indicator when download is in progress**
- [ ] **Step 4: Show an installation-guidance modal after download completes (chrome://extensions steps)**
- [ ] **Step 5: Integrate `UpdateBanner` into `PopupAppView.tsx` at the top of `PopupShell`, conditionally rendered when `update` is present**
- [ ] **Step 6: Write component tests and confirm they pass**

---

### Task 6: Add server-side version endpoint

**Files:**
- Modify: `server/src/index.ts`
- Create: `server/src/modules/public-config/extension-version.controller.ts`

- [ ] **Step 1: Create `extension-version.controller.ts` with a `GET /api/extension/version` handler that returns version info from environment or a config file**
- [ ] **Step 2: Wire the route in `server/src/index.ts` before the server starts listening**
- [ ] **Step 3: Add environment variables to `server/.env.example`: `EXTENSION_LATEST_VERSION`, `EXTENSION_DOWNLOAD_URL`, `EXTENSION_RELEASE_NOTES`, `EXTENSION_FORCE_UPDATE`, `EXTENSION_MIN_VERSION`**
- [ ] **Step 4: Run `pnpm --dir server build` to verify server compiles cleanly**

---

### Task 7: End-to-end verification

**Files:**
- Test: `extension/src/background/update-checker.test.ts`
- Test: `extension/src/popup-react/components/UpdateBanner.test.tsx`
- Test: `extension/src/popup-shared/popup-controller.test.ts`

- [ ] **Step 1: Run `pnpm --dir extension test` and confirm all tests pass**
- [ ] **Step 2: Run `pnpm --dir extension typecheck` and confirm no type errors**
- [ ] **Step 3: Run `pnpm --dir extension build` and confirm build succeeds**
- [ ] **Step 4: Run `pnpm --dir server test` and confirm all tests pass**
- [ ] **Step 5: Run `pnpm --dir server build` and confirm build succeeds**
