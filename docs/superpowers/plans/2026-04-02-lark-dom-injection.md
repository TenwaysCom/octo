# Lark DOM Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable DOM injection runtime for the extension, then use it to inject a `发送到 Meegle` action into Lark record detail pages with a dev-only probe mode.

**Architecture:** Extract probe scheduling, observer lifecycle, mount/remount, and debug overlay into a small injection core under `extension/src/injection/`. Then implement a Lark-specific adapter that detects record detail pages, finds the header anchor, and renders a detail-scoped action button plus a collapsible panel. Probe mode stays dev-only and opt-in so production builds never expose the overlay.

**Tech Stack:** TypeScript, WXT content scripts, Vue-free DOM rendering for injected UI, Vitest + jsdom

---

## File Map

### New files

- `extension/src/injection/types.ts`
  - Shared injection runtime types
- `extension/src/injection/core/observer.ts`
  - Shell/detail observer setup and teardown helpers
- `extension/src/injection/core/probe-controller.ts`
  - Probe refresh scheduler and page-state reducer
- `extension/src/injection/core/mount.ts`
  - Safe mount/remount/cleanup helpers for injected DOM
- `extension/src/injection/core/overlay.ts`
  - Dev-only probe overlay renderer
- `extension/src/injection/platforms/lark/adapter.ts`
  - Lark adapter contract implementation glue
- `extension/src/injection/platforms/lark/probe.ts`
  - Lark detail/context/anchor probe logic
- `extension/src/injection/platforms/lark/render.ts`
  - Lark injected button/panel DOM rendering
- `extension/src/injection/core/probe-controller.test.ts`
  - Runtime state/observer tests
- `extension/src/injection/platforms/lark/probe.test.ts`
  - Lark DOM probe tests
- `extension/src/injection/platforms/lark/render.test.ts`
  - Lark render and panel state tests

### Modified files

- `extension/src/content-scripts/lark.ts`
  - Replace ad hoc probe overlay logic with the new core + adapter entrypoint
- `extension/src/content-scripts/lark.test.ts`
  - Narrow to content-script bootstrap behavior once probe logic moves out
- `extension/src/entrypoints/lark.content.ts`
  - Keep loading `lark.ts`; no behavior change expected
- `extension/package.json`
  - Only if a dedicated dev probe env flag helper or test script is worth exposing

## Task 1: Lock the runtime contract before refactoring

**Files:**
- Create: `extension/src/injection/types.ts`
- Create: `extension/src/injection/core/probe-controller.test.ts`
- Test: `extension/src/injection/core/probe-controller.test.ts`

- [ ] **Step 1: Write the failing runtime contract tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createProbeController } from "./probe-controller";

describe("createProbeController", () => {
  it("emits detail-ready when detail, context, and anchor are all present", () => {
    const render = vi.fn();
    const controller = createProbeController({
      adapter: {
        probeShell: () => ({ shellRoot: document.body, overlayRoot: document.body }),
        probeDetail: () => ({ isOpen: true, detailRoot: document.body }),
        probeContext: () => ({ title: "Burger" }),
        probeAnchor: () => ({ element: document.body, label: "detail-header", confidence: 1 }),
        render,
      },
    });

    controller.refresh();

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        pageState: expect.objectContaining({ kind: "detail-ready" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension exec vitest run extension/src/injection/core/probe-controller.test.ts`

Expected: FAIL with module/function not found

- [ ] **Step 3: Write minimal shared types and controller skeleton**

```ts
export type InjectionPageState =
  | { kind: "idle" }
  | { kind: "detail-loading" }
  | { kind: "detail-ready"; context: unknown; anchor: AnchorCandidate }
  | { kind: "unsupported"; reason: string };

export function createProbeController(...) {
  return {
    refresh() { ... },
    destroy() { ... },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension exec vitest run extension/src/injection/core/probe-controller.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/injection/types.ts \
  extension/src/injection/core/probe-controller.ts \
  extension/src/injection/core/probe-controller.test.ts
git commit -m "add the injection runtime contract"
```

## Task 2: Add reusable observer and mount helpers

**Files:**
- Create: `extension/src/injection/core/observer.ts`
- Create: `extension/src/injection/core/mount.ts`
- Modify: `extension/src/injection/core/probe-controller.ts`
- Test: `extension/src/injection/core/probe-controller.test.ts`

- [ ] **Step 1: Write the failing observer lifecycle tests**

```ts
it("switches the detail observer when the detail root changes", () => {
  const observeShell = vi.fn();
  const observeDetail = vi.fn();

  const controller = createProbeController({
    ...deps,
    observerFactory: { observeShell, observeDetail },
  });

  controller.refresh();
  controller.refresh();

  expect(observeDetail).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension exec vitest run extension/src/injection/core/probe-controller.test.ts`

Expected: FAIL because observer switching/remount behavior is missing

- [ ] **Step 3: Implement observer and mount helpers**

```ts
export function createScopedObserver(target: Element, onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(target, { childList: true, subtree: true, attributes: true });
  return () => observer.disconnect();
}

export function ensureMountedNode(id: string, anchor: Element): HTMLElement {
  ...
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension exec vitest run extension/src/injection/core/probe-controller.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/injection/core/observer.ts \
  extension/src/injection/core/mount.ts \
  extension/src/injection/core/probe-controller.ts \
  extension/src/injection/core/probe-controller.test.ts
git commit -m "add reusable observer and mount helpers"
```

## Task 3: Convert the temporary overlay into dev-only probe mode

**Files:**
- Create: `extension/src/injection/core/overlay.ts`
- Modify: `extension/src/injection/core/probe-controller.ts`
- Modify: `extension/src/content-scripts/lark.test.ts`
- Modify: `extension/src/content-scripts/lark.ts`
- Test: `extension/src/content-scripts/lark.test.ts`

- [ ] **Step 1: Write the failing probe mode tests**

```ts
it("does not render the probe overlay unless dev probe mode is enabled", async () => {
  vi.stubEnv("DEV", "false");
  await import("./lark.ts");
  expect(document.querySelector("[data-tenways-lark-probe-overlay]")).toBeNull();
});

it("renders the overlay in dev when the probe flag is enabled", async () => {
  vi.stubEnv("DEV", "true");
  vi.stubEnv("WXT_PUBLIC_INJECTION_PROBE", "true");
  await import("./lark.ts");
  expect(document.querySelector("[data-tenways-lark-probe-overlay]")).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension exec vitest run extension/src/content-scripts/lark.test.ts`

Expected: FAIL because overlay still renders unconditionally

- [ ] **Step 3: Implement dev-only probe mode**

```ts
export function isProbeModeEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.WXT_PUBLIC_INJECTION_PROBE === "true";
}
```

- [ ] **Step 4: Run targeted tests**

Run: `pnpm --dir extension exec vitest run extension/src/content-scripts/lark.test.ts extension/src/injection/core/probe-controller.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/injection/core/overlay.ts \
  extension/src/content-scripts/lark.ts \
  extension/src/content-scripts/lark.test.ts \
  extension/src/injection/core/probe-controller.ts
git commit -m "gate the injection probe mode to dev only"
```

## Task 4: Implement the Lark detail probe adapter

**Files:**
- Create: `extension/src/injection/platforms/lark/probe.ts`
- Create: `extension/src/injection/platforms/lark/probe.test.ts`
- Create: `extension/src/injection/platforms/lark/adapter.ts`
- Modify: `extension/src/content-scripts/lark.ts`
- Test: `extension/src/injection/platforms/lark/probe.test.ts`

- [ ] **Step 1: Write the failing Lark probe tests**

```ts
describe("probeLarkDetail", () => {
  it("returns detail-ready only when a detail panel has a title and field rows", () => {
    document.body.innerHTML = `
      <aside class="record-detail-panel">
        <div class="detail-header"><h2>Burger 出库对接2</h2></div>
        <section class="field-list">
          <div class="field-row"><label>Status</label><div>Testing</div></div>
          <div class="field-row"><label>Priority</label><div>P0</div></div>
        </section>
      </aside>
    `;

    expect(probeLarkDetail().isOpen).toBe(true);
    expect(probeLarkContext(document.querySelector("aside")!)).toMatchObject({
      title: "Burger 出库对接2",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension exec vitest run extension/src/injection/platforms/lark/probe.test.ts`

Expected: FAIL because the new adapter files do not exist

- [ ] **Step 3: Implement the Lark probe helpers and adapter**

```ts
export function probeLarkDetail(): ProbeDetailResult { ... }
export function probeLarkContext(detailRoot: Element): LarkRecordContext | null { ... }
export function probeLarkAnchor(detailRoot: Element): AnchorCandidate | null { ... }
```

- [ ] **Step 4: Run targeted tests**

Run: `pnpm --dir extension exec vitest run extension/src/injection/platforms/lark/probe.test.ts extension/src/content-scripts/lark.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/injection/platforms/lark/probe.ts \
  extension/src/injection/platforms/lark/probe.test.ts \
  extension/src/injection/platforms/lark/adapter.ts \
  extension/src/content-scripts/lark.ts
git commit -m "add the lark detail probe adapter"
```

## Task 5: Render the Lark detail action button and collapsible panel

**Files:**
- Create: `extension/src/injection/platforms/lark/render.ts`
- Create: `extension/src/injection/platforms/lark/render.test.ts`
- Modify: `extension/src/injection/platforms/lark/adapter.ts`
- Modify: `extension/src/injection/core/mount.ts`
- Test: `extension/src/injection/platforms/lark/render.test.ts`

- [ ] **Step 1: Write the failing render tests**

```ts
it("renders a send-to-meegle button in the header anchor", () => {
  const anchor = document.createElement("div");
  renderLarkInjection({
    pageState: { kind: "detail-ready", context, anchor: { element: anchor, label: "detail-header", confidence: 1 } },
    context,
    anchor: { element: anchor, label: "detail-header", confidence: 1 },
  });

  expect(anchor.textContent).toContain("发送到 Meegle");
});

it("expands the collapsible panel after clicking the button", async () => {
  ...
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension exec vitest run extension/src/injection/platforms/lark/render.test.ts`

Expected: FAIL because the render module does not exist

- [ ] **Step 3: Implement minimal injected UI rendering**

```ts
export function renderLarkInjection(...) {
  // mount header button
  // mount panel host below header
  // keep local UI state: collapsed | draft-loading | draft-ready | submitting | success | error
}
```

- [ ] **Step 4: Run targeted tests**

Run: `pnpm --dir extension exec vitest run extension/src/injection/platforms/lark/render.test.ts extension/src/injection/platforms/lark/probe.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/injection/platforms/lark/render.ts \
  extension/src/injection/platforms/lark/render.test.ts \
  extension/src/injection/platforms/lark/adapter.ts \
  extension/src/injection/core/mount.ts
git commit -m "render the lark detail injection ui"
```

## Task 6: Wire the panel actions to the server draft/apply flow

**Files:**
- Modify: `extension/src/injection/platforms/lark/render.ts`
- Modify: `extension/src/background/router.ts`
- Modify: `extension/src/types/protocol.ts`
- Modify: `extension/src/types/lark.ts`
- Create: `extension/src/injection/platforms/lark/render.test.ts` (extend)
- Test: `extension/src/injection/platforms/lark/render.test.ts`

- [ ] **Step 1: Write the failing action tests**

```ts
it("requests a draft when the action button is clicked", async () => {
  const requestDraft = vi.fn().mockResolvedValue({
    draft: { title: "Burger 出库对接2" },
    missingFields: [],
    canApply: true,
  });

  renderLarkInjection({ ..., deps: { requestDraft } });
  await userClick("发送到 Meegle");

  expect(requestDraft).toHaveBeenCalledWith(
    expect.objectContaining({ recordId: "rec_xxx" }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension exec vitest run extension/src/injection/platforms/lark/render.test.ts`

Expected: FAIL because draft/apply integration is missing

- [ ] **Step 3: Implement runtime message or fetch bridge for draft/apply**

```ts
type LarkDomDraftRequest = { ... };
type LarkDomApplyRequest = { ... };
```

Prefer to keep the content script thin:

- content script gathers context
- background forwards requests to the server
- render layer only updates UI state from the result

- [ ] **Step 4: Run targeted tests**

Run: `pnpm --dir extension exec vitest run extension/src/injection/platforms/lark/render.test.ts extension/src/background/router.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/injection/platforms/lark/render.ts \
  extension/src/background/router.ts \
  extension/src/types/protocol.ts \
  extension/src/types/lark.ts \
  extension/src/injection/platforms/lark/render.test.ts
git commit -m "wire the lark injection panel to draft and apply endpoints"
```

## Task 7: Run full verification and clean up the temporary experiment

**Files:**
- Modify: `extension/src/content-scripts/lark.ts`
- Modify: `extension/src/content-scripts/lark.test.ts`
- Test: `extension/src/content-scripts/lark.test.ts`

- [ ] **Step 1: Remove any leftover ad hoc probe code from `lark.ts`**

Make `lark.ts` a thin bootstrap:

```ts
import { createLarkInjectionAdapter } from "../injection/platforms/lark/adapter";
import { createProbeController } from "../injection/core/probe-controller";
```

- [ ] **Step 2: Run targeted tests**

Run: `pnpm --dir extension exec vitest run extension/src/content-scripts/lark.test.ts`

Expected: PASS

- [ ] **Step 3: Run the full extension test suite**

Run: `pnpm --dir extension test`

Expected: PASS

- [ ] **Step 4: Run build verification**

Run: `pnpm --dir extension build`

Expected: PASS with no probe overlay enabled in the production bundle behavior

- [ ] **Step 5: Manual dev verification**

Run: `make ext-dev-profile`

Check:

- Lark page without probe flag shows no debug overlay
- Lark page with probe flag shows overlay
- Opening a record detail reaches `detail-ready`
- Title right-side button appears once
- Clicking it expands the panel
- Draft/apply success and error states both render correctly

- [ ] **Step 6: Commit**

```bash
git add extension/src/content-scripts/lark.ts \
  extension/src/content-scripts/lark.test.ts \
  extension/src/injection \
  extension/src/background/router.ts \
  extension/src/types/protocol.ts \
  extension/src/types/lark.ts
git commit -m "finish the lark detail injection flow"
```

## Notes

- Keep the injected UI as plain DOM or a very small self-contained renderer first. Do not pull popup Vue components directly into the content script unless there is a clear payoff.
- Do not broaden scope into list-row injection during this plan.
- Do not ship probe mode in production. Treat that as a hard gate.
- If the server draft/apply endpoints do not exist yet, stub them behind the background router first, then add server work in a follow-up plan instead of blocking the injection runtime refactor.
