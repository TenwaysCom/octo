# Learnings

Record concise, reusable lessons here. Include the context, the durable rule, and the verified outcome; never include secrets or raw credentials.

## [LRN-20260810-001] external-read-proxy-boundary

- **Context:** Octo proxies Odoo DevOps branch status with a server-held external credential.
- **Rule:** Authenticate callers with Octo's opaque Web Session, accept only allowlisted request parameters, and keep external credentials in deployment configuration. Never accept an external Cookie from a request or expose it in responses/logs.
- **Verified outcome:** The branch proxy validates `eu|uk|us`, returns only normalized branch status fields, and caches each environment snapshot independently.

## [LRN-20260810-002] shared-api-redis-cache

- **Context:** The Odoo DevOps branch endpoint was the first Redis-cached API, but Redis will serve future API responses too.
- **Rule:** Create one shared Redis cache at the server HTTP/API layer from `REDIS_URL`; feature services own only a versioned key namespace and TTL.
- **Verified outcome:** The Odoo DevOps service uses the shared cache with a per-environment key and a 600-second TTL.

## [LRN-20260810-003] linked-pr-odoo-build-projection

- **Context:** Meegle linked PR snapshots need Odoo.sh build feedback without exposing the Odoo DevOps credential to the browser.
- **Rule:** Select one Odoo.sh environment before matching: Meegle uses its `system` (`Odoo`/`Odoo EU` → EU, `Odoo UK` → UK, `Odoo US` → US), while GitHub uses its repository name (`Tenways` → EU, `tenways-ukk` → UK, `odoo_tenways` → US). Then match only `GitHub PR headRef === Odoo.sh branch`; unknown or ambiguous mappings show no dot. A failed environment lookup must not fail either list.
- **Verified outcome:** Exact matches return build results in both Meegle linked-PR and GitHub PR lists; UK workitems and `tenways-ukk` PRs request/display only UK, while a similarly named branch, an unknown mapping, or an unavailable environment does not produce a false status or fail the list.

## [LRN-20260810-004] github-pr-build-badge-boundary

- **Context:** A GitHub PR page needs two passive Odoo.sh build badges without exposing an external credential or duplicating the repo-to-environment mapping in the extension.
- **Rule:** The content script supplies only `owner`, `repo`, and `pullNumber`; the background uses the existing opaque Octo Web session through a credentialed browser request; the server retrieves the current GitHub head ref, selects the single mapped environment, and reuses the cached Odoo DevOps snapshot. Allow credentialed extension requests only from configured exact `chrome-extension://` origins.
- **Verified outcome:** The server returns only one mapped build result, and the extension renders an idempotent badge beside GitHub's state label and above the merge panel when it is available.

## [LRN-20260810-005] github-pr-build-badge-no-match

- **Context:** A mapped GitHub PR can have no matching Odoo.sh branch/build yet.
- **Rule:** Render that state as an explicit gray `no build` badge, rather than reusing a warning or failure color; reserve red/yellow/green for Odoo.sh build results.
- **Verified outcome:** The no-match badge uses gray `#8c959f` while failed, warning, and success retain their existing colors.

## [LRN-20260810-006] github-pr-build-badge-navigation

- **Context:** A visible Odoo.sh build badge should provide a direct path to the project build list.
- **Rule:** Make the entire badge a new-tab link and always use `rel="noopener noreferrer"` for the external destination.
- **Verified outcome:** Both badge locations point to the configured Odoo.sh Builds page without altering status rendering.

## [LRN-20260811-001] platform-sync-source-and-octo-boundary

- **Context:** Lark Base, Meegle and GitHub PR synchronization now needs local cleaning without allowing Octo-owned data to be overwritten by the next source pull.
- **Rule:** Keep each `*_syncs` table as the platform snapshot plus its dedicated cleaning fields. `*_octo` tables are reserved for data the Octo server owns, such as local state, AI output and manual notes; never copy platform fields into them.
- **Verified outcome:** All three cleaners live in `PlatformSyncService`, `cleanAfterSync` runs them after successful source writes, and historical cleanup writes only the corresponding `*_syncs` table.

## [LRN-20260811-002] lark-ticket-cleaning-semantic-fields

- **Context:** Lark Base ticket cleaning needs business fields that are not fixed database columns.
- **Rule:** Keep the raw `fields_json` in the source snapshot, parse it for cleaning, and write semantic cleaned fields back to dedicated columns in the same sync table. Preserve missing fields as absent; use the record creation time before any field fallback, and derive a Lark message link from the detail text only when its dedicated field is unavailable.
- **Verified outcome:** The Lark sync row contains ticket number, issue type, responsible people, creation time, detail description, Meegle link, and Lark message link while retaining its original payload.

## [LRN-20260811-003] platform-list-projection-contract

- **Context:** GitHub PR snapshot metadata was already stored but absent from the web list.
- **Rule:** Adding a snapshot field to a platform list requires the complete projection path: store return type, server Zod response schema, FE response parser, and table rendering. Do not rely on an unvalidated passthrough field.
- **Verified outcome:** Author, reviewers, and labels pass strict server and FE validation before rendering in the GitHub PR table.

## [LRN-20260811-004] lark-ticket-semantic-column-migration

- **Context:** A Lark Ticket list needs a new source-derived semantic field, priority.
- **Rule:** For each new cleaned Ticket field, update extraction aliases, the snapshot interface and mapper, table creation, the idempotent `ALTER TABLE` path, and list rendering together. This preserves both new deployments and existing databases.
- **Verified outcome:** `优先级` and `Priority` are cleaned into `lark_base_ticket_syncs.priority` and displayed in the Ticket list.

## [LRN-20260811-005] platform-sync-checkpoint-initialization

- **Context:** Existing platform snapshots predate source-side incremental synchronization and cannot safely share a single global timestamp.
- **Rule:** Keep one checkpoint per external scope and initialize it from `source_updated_at` plus a stable external-id tie-breaker. If any historical snapshot lacks a source timestamp, retain only `last_success_at` and require one full sync before an incremental watermark is trusted.
- **Verified outcome:** `platform_sync_checkpoints` is initialized idempotently from GitHub repository, Lark Base table, and Meegle project snapshots without overwriting existing checkpoints.

## [LRN-20260811-006] github-incremental-checkpoint-advance

- **Context:** GitHub PR sync needs to pull changed open and terminal PRs without advancing a cursor after a partial page.
- **Rule:** Query from `watermark_updated_at - 5 minutes`, derive the next cursor from `updated_at + zero-padded pull number`, and advance only after every listed detail is stored and optional cleanup finishes. If a result reaches the configured page cap, fail before any write or checkpoint advancement.
- **Verified outcome:** The GitHub incremental CLI reads a repository checkpoint, includes merged and closed PRs, records failures on the checkpoint, and advances only complete runs.

## [LRN-20260811-005] github-id-profile-filter-boundary

- **Context:** The GitHub PR list needs a per-user Mine filter while user identity is stored server-side.
- **Rule:** Return the non-secret `users.github_id` only in the authenticated Web Profile, then filter existing PR snapshot author and reviewer fields in the FE. Match GitHub logins case-insensitively and normalize an optional leading `@`.
- **Verified outcome:** Settings shows the associated GitHub ID, and Mine matches either author or reviewer without adding another identity endpoint.

## [LRN-20260811-006] integrations-page-single-hierarchy

- **Context:** The Integrations settings page had a one-item secondary navigation and repeated Settings/Integrations headings.
- **Rule:** A settings surface with one active section should use one page-level title and a direct content grid; reserve secondary navigation for multiple independently navigable sections.
- **Verified outcome:** The page has one Integrations heading, a responsive three-card layout, and no unused settings-panel markup or styles.

## [LRN-20260811-007] lark-ticket-urgency-source-field

- **Context:** The Lark Ticket list needs its urgency value from the current Base field, rather than a similarly named legacy field.
- **Rule:** Keep the displayed label and cleaning source aligned to the exact Lark field name `紧急度`; do not silently fall back to `优先级` when both fields can coexist and diverge. Existing persistence names may remain until a dedicated schema migration is warranted.
- **Verified outcome:** The sync-cleaning test supplies `优先级=P0` and `紧急度=P1`, and persists `P1` for the Ticket list.

## [LRN-20260811-008] github-pr-merger-cleaning

- **Context:** GitHub PR authors, reviewers, and merger are distinct source roles and must not be inferred from each other.
- **Rule:** Clean merger only from GitHub REST `merged_by.login` into a dedicated nullable snapshot column; leave it empty for unmerged PRs and expose it through the validated list contract.
- **Verified outcome:** The service, PostgreSQL store, API parser, and PR list preserve and display `mergedBy` independently from author and requested reviewers.

## [LRN-20260811-014] github-pr-user-chip

- **Context:** GitHub PR role columns contain public GitHub logins but no avatar URL in the list contract.
- **Rule:** Render author, merger, and requested reviewers with one small user chip that links to the public GitHub profile and loads the documented profile image endpoint lazily; keep the API contract limited to the login.
- **Verified outcome:** All three PR role columns share the same avatar-and-login presentation, while multiple reviewers remain individually identifiable.

## [LRN-20260811-008] lark-source-time-watermark-boundary

- **Context:** Historical Lark Base snapshots were written before API `updated_time` was retained, so their incremental checkpoint could not be safely initialized.
- **Rule:** Backfill only null `source_updated_at` values from the exact raw field `状态记录时间`; initialize only an empty checkpoint watermark. New Lark records must use the API record's `updated_time`, normalized to ISO UTC, and must never fall back to local `synced_at` or the historical field.
- **Verified outcome:** The Lark history command previewed and updated 1,671 valid snapshots, then initialized the matching checkpoint with the latest timestamp and record-id tie-breaker.

## [LRN-20260811-009] meegle-updated-at-source-boundary

- **Context:** Meegle snapshot source time was inferred from a generic fields map, making the source version contract unclear.
- **Rule:** Parse the work item root `updated_at` into an explicit normalized `updatedAt` adapter field, and persist only that value to `source_updated_at`. When a response omits it, retain null rather than substituting a local sync time or another business field.
- **Verified outcome:** The historical Meegle scope has 394 snapshots with a numeric `updated_at` and five without one; only the former have a valid source timestamp.

## [LRN-20260811-010] meegle-production-bug-update-time

- **Context:** Meegle Production Bug uses a distinct source-time shape from ordinary work items.
- **Rule:** For type `6932e40429d1cd8aac635c82`, resolve `source_updated_at` from `fields.work_item_attribute.update_time`; all other types use root `updated_at`. Do not substitute a local sync timestamp when either source field is absent.
- **Verified outcome:** All five historical Production Bug snapshots contained valid `update_time` values and can initialize the previously blocked Meegle checkpoint.

## [LRN-20260811-010] manual-cache-reset-truthfulness

- **Context:** A user-triggered cache reset has a different correctness bar from best-effort cache-aside reads and writes.
- **Rule:** Make cache deletion return success/failure to the owner service; a reset endpoint must report failure when Redis cannot confirm deletion, while no-cache mode may safely treat deletion as successful.
- **Verified outcome:** GitHub PR DevOps reset deletes only the mapped environment key and immediately refreshes the displayed branch status.

## [LRN-20260811-011] github-pr-list-cache-reset-scope

- **Context:** The Octo FE GitHub PR list needs one explicit DevOps reset action covering all configured systems.
- **Rule:** Put the button in the GitHub PR list header; submit only its action run ID and have the server delete the fixed EU, UK, and US cache keys together.
- **Verified outcome:** The header action resets all three caches through the existing Web session and reloads the list.

## [LRN-20260811-012] lark-incremental-source-filter

- **Context:** Lark incremental sync previously paged through the whole Base table and only filtered after reading every record.
- **Rule:** Use the configured Bitable last-modified-time field to build the source `filter`, request automatic fields, then retain a five-minute local timestamp overlap check before advancing the checkpoint. The configured field must observe every synced business field.
- **Verified outcome:** Adapter and service tests assert the filter and `automatic_fields=true`; server test suite and TypeScript build pass.

## [LRN-20260811-013] meegle-incremental-two-stage-watermark

- **Context:** Meegle MQL uses a type-specific `field_key`, while real `+batch-get` responses omit `updated_at` for normal work items.
- **Rule:** Configure MQL with the metadata `field_key` (for example `updated_at`), not its display name. Use the selected MQL `updated_at` as the normal-type source time; Production Bug alone must use `work_item_attribute.update_time` from its detail. Missing either required source timestamp must fail without advancing the checkpoint.
- **Verified outcome:** Live `Tech Task` metadata and `+batch-get` confirmed this shape; the incremental retry synced and cleaned one record and advanced the `4c3fv6` checkpoint. Adapter and service tests cover MQL filtering, the fallback, Production Bug detail time, missing config, and the 5,000-row safety cap.

## [LRN-20260811-015] platform-sync-scope-and-cleaning-failure-isolation

- **Context:** A failing Lark/Meegle incremental scope previously threw out of the CLI loop, while a failed snapshot-cleaning write stopped later objects from being cleaned.
- **Rule:** Process each incremental scope independently, record its checkpoint failure, and continue later scopes before returning a nonzero overall result. Clean snapshots one at a time, log safe reference-level failures, finish all remaining objects, then fail that scope so its checkpoint is not advanced.
- **Verified outcome:** Script tests prove a failed incremental scope does not prevent the next scope from syncing; service tests prove Meegle, GitHub, and Lark all continue cleaning the second object after the first fails.
