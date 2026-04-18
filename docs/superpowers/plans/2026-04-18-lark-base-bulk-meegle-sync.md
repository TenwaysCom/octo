# Lark Base Bulk Meegle Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new action to the plugin sidebar `自动化` page for the target Lark Base URL that first previews eligible records in a confirmation modal, then executes bulk Meegle creation after user confirmation.

**Architecture:** Keep record discovery and batch orchestration separate from the existing single-record workflow. The popup automation page parses `viewId` from the current tab URL, requests a preview, shows a modal with record id/title/priority, and only after confirmation sends an execution action. The server uses a new `bitable/v1` listing method plus a preview/execution bulk service that reuses `executeLarkBaseWorkflow` per record.

**Tech Stack:** TypeScript, Express, Vue popup UI, Vitest, existing Lark/Meegle adapters

---

## File Map

### Server

- Modify: `server/src/adapters/lark/lark-client.ts`
- Modify: `server/src/modules/lark-base/lark-base-workflow.dto.ts`
- Create: `server/src/modules/lark-base/lark-base-bulk-workflow.controller.ts`
- Create: `server/src/modules/lark-base/lark-base-bulk-workflow.service.ts`
- Create: `server/src/modules/lark-base/lark-base-bulk-workflow.controller.test.ts`
- Create: `server/src/modules/lark-base/lark-base-bulk-workflow.service.test.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/index.test.ts`

### Extension

- Modify: `extension/src/types/lark.ts`
- Modify: `extension/src/types/protocol.ts`
- Modify: `extension/src/injection/platforms/lark/bootstrap.ts`
- Modify: `extension/src/background/router.ts`
- Modify: `extension/src/background/router.test.ts`
- Modify: `extension/src/content-scripts/lark.test.ts`
- Modify: `extension/src/popup/composables/use-popup-app.ts`
- Modify: `extension/src/popup/composables/use-popup-app.test.ts`
- Modify: `extension/src/popup/pages/AutomationPage.vue`
- Modify: `extension/src/popup/App.vue`
- Modify: `extension/src/popup/App.test.ts`
- Create: `extension/src/popup/components/LarkBulkCreateModal.vue`

## Task 1: Add failing tests for `bitable/v1` record listing

**Files:**
- Modify: `server/src/adapters/lark/lark-client.ts`
- Create: `server/src/adapters/lark/lark-client.bitable-v1.test.ts`

- [ ] **Step 1: Write the failing adapter test**

```ts
it("lists records from bitable/v1 with view_id", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      code: 0,
      data: {
        items: [{ record_id: "rec_1", fields: { "Issue Description": "A" } }],
        has_more: false,
      },
    }),
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir server test -- lark-client.bitable-v1.test.ts`
Expected: FAIL because the client has no `bitable/v1` list method yet

- [ ] **Step 3: Implement minimal `bitable/v1` list method**

```ts
async listBitableV1RecordsByView(baseId: string, tableId: string, viewId: string, pageToken?: string) {
  return this.request(...);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir server test -- lark-client.bitable-v1.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/adapters/lark/lark-client.ts \
  server/src/adapters/lark/lark-client.bitable-v1.test.ts
git commit -m "add bitable v1 record listing for view sync"
```

## Task 2: Add failing tests for preview and bulk workflow service

**Files:**
- Create: `server/src/modules/lark-base/lark-base-bulk-workflow.service.ts`
- Create: `server/src/modules/lark-base/lark-base-bulk-workflow.service.test.ts`
- Modify: `server/src/modules/lark-base/lark-base-workflow.dto.ts`

- [ ] **Step 1: Write the failing bulk service tests**

```ts
it("builds preview rows with record id, title, and priority for eligible records", async () => {
  // records: one with meegle链接, one without
  // expect preview to return only the eligible record
});

it("skips records with existing meegle链接 and creates workitems for the rest", async () => {
  // expect executeLarkBaseWorkflow to run only for previewed records
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir server test -- lark-base-bulk-workflow.service.test.ts`
Expected: FAIL because the bulk service and DTO do not exist

- [ ] **Step 3: Implement the bulk service and request DTO**

```ts
export const previewLarkBaseBulkWorkflowSchema = z.object({
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  viewId: z.string().min(1),
  masterUserId: z.string().min(1),
});

export const createLarkBaseBulkWorkflowSchema = z.object({
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  viewId: z.string().min(1),
  masterUserId: z.string().min(1),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir server test -- lark-base-bulk-workflow.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/lark-base/lark-base-workflow.dto.ts \
  server/src/modules/lark-base/lark-base-bulk-workflow.service.ts \
  server/src/modules/lark-base/lark-base-bulk-workflow.service.test.ts
git commit -m "add bulk lark base sync service"
```

## Task 3: Expose preview and bulk workflow controllers and routes

**Files:**
- Create: `server/src/modules/lark-base/lark-base-bulk-workflow.controller.ts`
- Create: `server/src/modules/lark-base/lark-base-bulk-workflow.controller.test.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/index.test.ts`

- [ ] **Step 1: Write the failing controller and route tests**

```ts
it("registers preview and bulk lark-base routes", () => {
  expect(collectRoutes()).toContain("POST /api/lark-base/bulk-preview-meegle-workitems");
  expect(collectRoutes()).toContain("POST /api/lark-base/bulk-create-meegle-workitems");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir server test -- index.test.ts lark-base-bulk-workflow.controller.test.ts`
Expected: FAIL because the route is not registered

- [ ] **Step 3: Implement controller and register route**

```ts
app.post(
  "/api/lark-base/bulk-preview-meegle-workitems",
  handleController(previewLarkBaseBulkWorkflowController),
);
app.post(
  "/api/lark-base/bulk-create-meegle-workitems",
  handleController(createLarkBaseBulkWorkflowController),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir server test -- index.test.ts lark-base-bulk-workflow.controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/lark-base/lark-base-bulk-workflow.controller.ts \
  server/src/modules/lark-base/lark-base-bulk-workflow.controller.test.ts \
  server/src/index.ts \
  server/src/index.test.ts
git commit -m "expose bulk lark base sync endpoint"
```

## Task 4: Add failing extension tests for `viewId` detection and preview/execute protocol actions

**Files:**
- Modify: `extension/src/types/lark.ts`
- Modify: `extension/src/types/protocol.ts`
- Modify: `extension/src/injection/platforms/lark/bootstrap.ts`
- Modify: `extension/src/content-scripts/lark.test.ts`
- Modify: `extension/src/background/router.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("detects viewId from the current lark base url", () => {
  expect(getTestingApi()?.detectLarkPageContext()).toMatchObject({
    viewId: "vewMs17Tqk",
  });
});

it("forwards lark_base.bulk_preview_workitems to the server endpoint", async () => {
  // expect fetch to receive /api/lark-base/bulk-preview-meegle-workitems
});

it("forwards lark_base.bulk_create_workitems to the server endpoint", async () => {
  // expect fetch to receive /api/lark-base/bulk-create-meegle-workitems
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension test -- lark.test.ts router.test.ts`
Expected: FAIL because `viewId` and the new action do not exist

- [ ] **Step 3: Implement `viewId` parsing and protocol types**

```ts
type LarkPageContext = {
  viewId?: string;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension test -- lark.test.ts router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/types/lark.ts \
  extension/src/types/protocol.ts \
  extension/src/injection/platforms/lark/bootstrap.ts \
  extension/src/content-scripts/lark.test.ts \
  extension/src/background/router.test.ts
git commit -m "teach the extension about lark base view sync"
```

## Task 5: Add failing popup tests for the automation action and confirmation modal

**Files:**
- Modify: `extension/src/popup/composables/use-popup-app.ts`
- Modify: `extension/src/popup/composables/use-popup-app.test.ts`
- Modify: `extension/src/popup/pages/AutomationPage.vue`
- Modify: `extension/src/popup/App.vue`
- Modify: `extension/src/popup/App.test.ts`
- Create: `extension/src/popup/components/LarkBulkCreateModal.vue`

- [ ] **Step 1: Write the failing popup tests**

```ts
it("renders the bulk action only on the configured base/table/view", async () => {
  expect(wrapper.text()).toContain("批量创建 MEEGLE TICKET");
});

it("opens a preview modal with record id, title, and priority", async () => {
  expect(wrapper.text()).toContain("记录 ID");
  expect(wrapper.text()).toContain("Priority");
});

it("switches the modal into loading after confirmation", async () => {
  expect(wrapper.text()).toContain("创建中");
});

it("shows final batch results after execution", async () => {
  expect(wrapper.text()).toContain("created");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension test -- use-popup-app.test.ts App.test.ts`
Expected: FAIL because the popup automation page does not yet expose the bulk action or modal

- [ ] **Step 3: Implement the popup automation action and modal**

```ts
const showBulkAction =
  state.pageType === "lark" &&
  currentLarkPageContext?.baseId === TARGET_BASE_ID &&
  currentLarkPageContext?.tableId === TARGET_TABLE_ID &&
  currentLarkPageContext?.viewId === TARGET_VIEW_ID;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension test -- use-popup-app.test.ts App.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/popup/composables/use-popup-app.ts \
  extension/src/popup/composables/use-popup-app.test.ts \
  extension/src/popup/pages/AutomationPage.vue \
  extension/src/popup/App.vue \
  extension/src/popup/App.test.ts \
  extension/src/popup/components/LarkBulkCreateModal.vue
git commit -m "add bulk meegle sync to the popup automation page"
```

## Task 6: Wire preview and execute background routes to the new server APIs

**Files:**
- Modify: `extension/src/background/router.ts`
- Modify: `extension/src/background/router.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
expect(fetch).toHaveBeenCalledWith(
  expect.stringContaining("/api/lark-base/bulk-preview-meegle-workitems"),
  expect.anything(),
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension test -- router.test.ts`
Expected: FAIL because the action is not routed

- [ ] **Step 3: Implement the route forwarding**

```ts
if (message.action === "itdog.lark_base.bulk_preview_workitems") {
  // forward preview to server
}

if (message.action === "itdog.lark_base.bulk_create_workitems") {
  // forward to server
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension test -- router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/background/router.ts \
  extension/src/background/router.test.ts
git commit -m "forward bulk lark base sync requests from the extension"
```

## Task 7: Run integrated verification

**Files:**
- Modify: `docs/superpowers/plans/2026-04-18-lark-base-bulk-meegle-sync.md`

- [ ] **Step 1: Keep the implementation plan aligned with the shipped routes and popup flow**

Update the plan checklist with any final file-path or command corrections discovered during implementation so the document still matches the delivered code.

- [ ] **Step 2: Run targeted server tests**

Run: `pnpm --dir server test -- lark-client.bitable-v1.test.ts lark-base-bulk-workflow.service.test.ts lark-base-bulk-workflow.controller.test.ts index.test.ts`
Expected: PASS

- [ ] **Step 3: Run targeted extension tests**

Run: `pnpm --dir extension test -- lark.test.ts router.test.ts use-popup-app.test.ts App.test.ts`
Expected: PASS

- [ ] **Step 4: Run builds**

Run: `pnpm --dir server build`
Expected: PASS

Run: `pnpm --dir extension build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-04-18-lark-base-bulk-meegle-sync.md
git commit -m "refresh the bulk lark base sync implementation plan"
```
