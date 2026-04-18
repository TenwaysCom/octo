# Lark Base Bulk Meegle Sync Design

## Goal

On the plugin sidebar `自动化` page for the Lark Base URL:

- `baseId=XO0cbnxMIaralRsbBEolboEFgZc`
- `tableId=tblUfu71xwdul3NH`
- `viewId=vewMs17Tqk`

add a plugin-side action that manually triggers bulk creation of Meegle tickets for the records currently returned by that view.

This design explicitly uses the legacy `bitable/v1` records API for record listing because direct verification showed it respects `view_id`, while the newer `base/v3` records API returns `query_context.record_scope = "view_filtered_records"` but still yields unfiltered records for this view.

## What Changes

### Extension

Add a new action to the existing popup automation page for the target Lark Base page:

- new action: `批量创建 MEEGLE TICKET`

This is not an injected in-page header button. It is rendered in the extension sidebar popup, inside `AutomationPage`, alongside the existing Lark automation actions.

The bulk action is only shown when the current page URL matches the target base, table, and view. This keeps the first release narrow and prevents accidental bulk execution on unrelated Base pages.

The action no longer triggers the batch immediately. It first opens a confirmation modal that previews the records that would be created in this run. Only after explicit user confirmation does the extension start the batch request.

The popup sends background requests for:

1. preview
2. execute

The background router forwards those requests to new server endpoints and returns preview and result payloads to the popup.

### Server

Add a bulk sync endpoint that:

1. authenticates to Lark with the existing per-user Lark token flow
2. lists records from `bitable/v1` with `view_id=vewMs17Tqk`
3. skips records that already contain a non-empty `meegle链接`
4. reuses the existing single-record Lark Base to Meegle workflow for each remaining record
5. returns a batch summary with created, skipped, and failed records

The existing mapping config and Meegle apply flow stay unchanged. The new batch layer only orchestrates record discovery and repetition.

## Why `bitable/v1`

We verified two behaviors against the same view:

- `GET /open-apis/bitable/v1/apps/.../tables/.../records?view_id=vewMs17Tqk`
  returned the filtered records expected from the view
- `GET /open-apis/base/v3/bases/.../tables/.../records?view_id=vewMs17Tqk`
  returned metadata claiming `view_filtered_records`, but the actual record list matched the unfiltered table order

For this feature, correctness of record selection matters more than API version uniformity. The batch listing step should therefore use `bitable/v1` until `base/v3` is proven reliable for `view_id`.

## Scope Boundaries

### In Scope

- a popup automation action for the specific target page
- a background message and server endpoint for manual bulk sync
- `bitable/v1` record listing with `view_id`
- skipping records that already have `meegle链接`
- batch result summary surfaced back to the user

### Out of Scope

- scheduled sync
- generic bulk sync for arbitrary bases or views
- editing view filters from the plugin
- rewriting the single-record Lark Base workflow
- parallelized bulk execution

## User Flow

1. User opens the target Lark Base view page.
2. User opens the plugin sidebar and switches to `自动化`.
3. The popup parses `baseId`, `tableId`, and `viewId` from the current tab URL.
4. The popup renders `批量创建 MEEGLE TICKET`.
5. User clicks the action.
6. The popup requests a preview from the server.
7. The server lists records from `bitable/v1` using the `view_id` parsed from the incoming URL.
8. The server filters out records that already contain `meegle链接`.
9. The popup opens a modal showing the records that would be created in this run.
10. The modal displays each candidate record's `record_id`, title, and priority.
11. User confirms the action.
12. The modal switches to a loading state while the batch is running.
13. The server runs the existing single-record workflow for each previewed record.
14. The server returns a result summary.
15. The modal switches to a final result state showing created, skipped, and failed outcomes.

## Extension Design

### Page Context

Current Lark page detection already extracts:

- `baseId`
- `tableId`
- `recordId`

The bulk action needs `viewId` added to page context parsing so the extension can distinguish the target view from other views in the same table.

The source of truth is the incoming page URL. The popup already knows the active tab URL, and the bulk flow should parse `viewId` from that URL and pass it through preview and execution requests.

### Popup Automation UI

The current popup automation page renders Lark actions from `larkActions`. That is the correct place for the new action.

The first release should add the new automation action only when all of these match:

- `pageType === "lark"`
- `baseId === "XO0cbnxMIaralRsbBEolboEFgZc"`
- `tableId === "tblUfu71xwdul3NH"`
- `viewId === "vewMs17Tqk"`

### Confirmation Modal

The popup bulk flow needs a modal with three states:

1. preview
2. loading
3. result

#### Preview State

The preview modal shows the records that are eligible for creation in this run. For each record, show:

- `record_id`
- title
- priority

Assumption for this first version:

- the preview only lists records that are about to be created
- records already skipped because `meegle链接` exists are not mixed into the main preview list

The preview modal should also show a compact count summary:

- total records returned by the view
- records eligible for creation
- records skipped before execution

#### Loading State

After the user confirms, the same modal stays open and switches into a loading state. This avoids the ambiguity of background-only execution and gives a clear sense that the batch is still in progress.

#### Result State

When the batch completes, the modal shows:

- total previewed records
- created count
- skipped count
- failed count

For failed records, show a compact list with:

- `record_id`
- title
- error message

### Background Protocol

Add new actions:

- `itdog.lark_base.bulk_preview_workitems`
- `itdog.lark_base.bulk_create_workitems`

Payload should include:

- `pageType`
- `url`
- `baseId`
- `tableId`
- `viewId`
- `operatorLarkId`
- `masterUserId`

The preview payload should include:

- `ok`
- `total`
- `eligible`
- `skipped`
- `records[]`

Each preview record should include:

- `recordId`
- `title`
- `priority`

The execution result payload should include:

- `ok`
- `total`
- `created`
- `skipped`
- `failed`
- `createdRecords[]`
- `skippedRecords[]`
- `failedRecords[]`

## Server Design

### Lark Client

Add a dedicated `bitable/v1` list-records-by-view method to the Lark adapter rather than overloading the current `base/v3` list method. This makes the version choice explicit and avoids accidental reuse in the wrong places.

The new method should:

- call `GET /open-apis/bitable/v1/apps/:baseId/tables/:tableId/records`
- accept `viewId`, pagination cursor, and page size
- normalize the response into the same `LarkBitableRecord` shape used elsewhere

### Bulk Sync Service

Add a bulk preview step and a bulk execution service on top of the existing single-record workflow service.

Responsibilities:

1. validate target base, table, and view
2. use the `viewId` parsed from the incoming URL
3. list all records from the target view using `bitable/v1`
4. detect whether `meegle链接` is already populated
5. build preview rows with `record_id`, title, and priority
6. call `executeLarkBaseWorkflow` for records that still need syncing
7. aggregate results into a stable summary

The bulk service should not duplicate title extraction, issue-type mapping, field mapping, or Meegle apply logic. It should delegate those to the existing single-record workflow.

### Execution Strategy

Use serial execution in the first release.

Reasoning:

- Meegle create already has idempotency logic, but batch retries are still easier to reason about serially
- serial execution lowers risk of rate limits across Lark and Meegle
- serial execution produces deterministic logs and easier failure diagnosis

If performance becomes a real problem later, limited concurrency can be added as a follow-up.

## Error Handling

### Extension

Handle:

- background routing failures
- server HTTP failures
- partial batch failures

The UI should show summary-oriented feedback instead of raw JSON. The modal should remain the single source of truth for preview, loading, and final result states.

### Server

Return structured batch results even when some records fail.

Only fail the whole batch request when:

- request validation fails
- Lark auth is unavailable
- the target view record listing fails completely

For per-record workflow failures, keep processing and include each failed record in the response.

## Testing Strategy

### Extension Tests

- page context parser extracts `viewId`
- popup automation action only renders on the target base/table/view
- preview modal shows record id, title, and priority
- modal transitions preview -> loading -> result
- background router forwards the new bulk action to the correct server endpoint
- popup shows summary feedback after success/failure

### Server Tests

- `bitable/v1` record listing adapter maps records correctly
- bulk service paginates through the full view
- bulk service skips records with existing `meegle链接`
- preview builder returns the expected `record_id`, title, and priority
- bulk service delegates eligible records to `executeLarkBaseWorkflow`
- batch summary counts are correct for mixed created/skipped/failed results

## Risks

- `bitable/v1` and `base/v3` response shapes differ, so adapter normalization must be explicit
- the current targeting is intentionally hard-coded; if the business later wants more views, config needs to move out of code
- serial execution is safer but may feel slow on large batches

## Approval Snapshot

Chosen approach: use `bitable/v1` for the batch records API and keep the feature manual, page-scoped, and plugin-triggered.
