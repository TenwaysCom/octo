# Learnings

Record concise, reusable lessons here. Include the context, the durable rule, and the verified outcome; never include secrets or raw credentials.

## [LRN-20260828-007] ai-session-message-control-scope

- **Context:** Ticket 与 Sprint AI Session 使用相同的消息视觉语言，但由两个页面入口渲染；复制动作只适用于助手正文，不适用于用户输入、状态或思考/工具诊断。
- **Rule:** 把通用消息控件做成 FE 共享组件，并按规范化 transcript 的语义 `kind` 与非空正文决定是否渲染；复制反馈应有图标、tooltip 和动态无障碍标签，不能依赖服务端或 Session 协议变化。
- **Verified outcome:** 两个 AI Session 入口复用同一 Copy 控件，FE 24 项测试与生产构建通过。

## [LRN-20260830-001] fe-kanban-popover-overflow-and-test-pattern

- **Context:** Kanban 卡片需要字段详情浮层，但 `.kanban-board__column` / `.kanban-swimlane` 带 `overflow: hidden/auto`，绝对定位浮层会被裁剪；FE 测试只有 `node --test`，无 DOM 渲染器。
- **Rule:** 卡片级浮层用 `position: fixed` + 触发元素 `getBoundingClientRect()` 定位来绕开祖先 overflow 裁剪，DOM 仍挂在触发容器内以保证 blur 关闭与焦点管理成立。FE 交互组件的新逻辑（如字段降级解析）抽成 `fe/src/lib/` 纯函数，用 node:test 覆盖；组件层靠构建与人工验证。卡片时间必须使用来源对象的业务时间：Meegle 优先 `itemStartTime`，再回退 `addToCycleTime`，不得用 `sourceUpdatedAt` 冒充生命周期时间。
- **Verified outcome:** 人员、描述、布局与 Meegle 时间优先级单测通过；FE 全量 116 个测试与 Vite production build 通过。浏览器实机交互仍待单独验证。

## [LRN-20260829-002] meegle-page-external-enrichment-boundary

- **Context:** Meegle workitem and Sprint first-load routes were coupling local snapshot reads to a slow Odoo DevOps full-environment branch snapshot.
- **Rule:** Keep list and history endpoints to their local data contracts. Trigger costly PR enrichment only from the explicit PR interaction, and cache/refresh it by the upstream provider's real snapshot unit (`eu`/`uk`/`us`), never by a downstream repo or PR when the source cannot filter that way.
- **Verified outcome:** Targeted Server tests cover the split workitem/Sprint routes and environment singleflight refresh; FE API tests cover the dedicated Sprint endpoint and 202 refresh response.

## [LRN-20260829-001] fe-css-variable-definition-and-badge-palette

- **Context:** FE `global.css` 的 badge/状态色是十几处重复的硬编码色对,且 `--octo-brand-soft` 被两处引用却从未在 `:root` 定义(静默失效)。
- **Rule:** 新增或调整 FE 状态色时,统一走 `:root` 的 `--octo-badge-{tone}-{text,bg}` 变量,不再新写硬编码色对;引用任何 CSS 变量前先确认它已在 `:root` 定义(可 grep `var(--x)` 与定义对照)。
- **Verified outcome:** 所有 badge 修饰类改用变量后 FE 91 测试与 Vite production build 通过；功能样式改动仅在 `fe/src/styles/global.css`，任务/学习记录另行维护。

## [LRN-20260828-005] sprint-ai-session-snapshot-boundary

- **Context:** Sprint Release Notes needs resumable AI Sessions, but Ticket sessions are structurally bound to a Lark Base record and browser-side Sprint filters cannot be trusted as generation input.
- **Rule:** Bind each reusable Sprint session to `operatorLarkId + projectKey + sprintId` in a dedicated local reference table. On creation, rebuild its context server-side from the Sprint snapshot and membership intervals, include only supported work-item types with `itemFinishTime`, and store a context hash. Reuse the ACP runtime and SSE transport, not the Ticket resource reference or its APIs.
- **Verified outcome:** Server service/controller tests cover completed-only context, Sprint-scoped listing and Web identity; FE API tests cover scoped requests and `actionRunId`; Server build and FE check pass without external calls.

## [LRN-20260828-006] prompt-content-runtime-boundary

- **Context:** Sprint Release Notes needs a concise, editable AI instruction but does not need repository or tool access.
- **Rule:** Keep prompt-only behavior in `workflow_prompts`; do not turn a prompt or Skill-content request into a runtime workspace, file-path, or permission-profile dependency unless the workflow explicitly requires local tools or files.
- **Verified outcome:** New Sprint sessions render `meegle.sprint.release_notes` directly, while `read_only` ACP policy denies tool calls without a Sprint-specific workspace configuration.

## [LRN-20260826-001] lazy-child-resource-sync

- **Context:** Lark Ticket 是批量同步对象，但其 IM thread 是一对多、独立变化且 API 成本更高的子资源，主要只在 AI 分析时使用。
- **Rule:** 不要把高成本子资源读取挂到父对象批量 checkpoint。为子资源建立独立快照、完整性和 watermark；使用时执行 TTL/dirty/低频全量 ensure，终态只在完整成功后冻结，同一 AI Session 固定首次快照。
- **Verified outcome:** Ticket 批量同步仍只保存 message link；定向测试覆盖缓存命中、增量重叠、分页、终态一次同步、重开和 Kimi 续聊不重复请求。

## [LRN-20260818-001] dynamic-web-session-route-auth

- **Context:** A new parameterized `/api/web/*` route can be rejected by the legacy `master-user-id` middleware even when its controller correctly expects an opaque HttpOnly Web Session.
- **Rule:** Allow only the exact dynamic Web route prefixes that own session authentication, then require every allowed controller to validate the Web Session and workspace permission itself. Test both the allowed paths and an adjacent protected path; never exempt all `/api/web/*` routes implicitly.
- **Verified outcome:** The Meegle workitem detail PRD now makes the middleware boundary, controller fail-closed behavior, and route/auth contract tests explicit before implementation.

## [LRN-20260813-001] web-platform-sync-incremental-scope

- **Context:** Web「立即同步」错误地调用 bulk/full 服务；Meegle HTTP `filterWorkitems` 不能按源端更新时间过滤。
- **Rule:** Web source actions must read the matching checkpoint and reject a missing/unsafe watermark rather than silently falling back to full sync. Use the source-side incremental adapter (Meegle CLI/MQL, Lark Bitable filter, GitHub updated search), clean successful snapshots, then advance the same scope only after success. If a checkpoint covers a whole Meegle project, a type card must sync every configured type before advancing it.
- **Verified outcome:** Controller, service, and GitHub adapter tests cover success, missing-watermark rejection, failure recording, terminal PRs, and checkpoint advancement; Server test suite and TypeScript build pass.

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

## [LRN-20260812-001] web-sync-session-identity-boundary

- **Context:** Settings needs manual single-source snapshot synchronization without exposing browser identity or local target configuration.
- **Rule:** Keep the browser route behind the opaque Web session; resolve `masterUserId` only in a server helper, load targets from ignored `platform-sync.local.json`, and return only source labels/configured state. Do not broaden the existing public Web-session shape when an internal identity projection is needed.
- **Verified outcome:** The Settings sync page lists independently actionable configured scopes, including separate GitHub repository sources, and triggers only the chosen source.

## [LRN-20260812-002] ticket-ai-session-web-boundary

- **Context:** Ticket detail reuses Kimi ACP chat while exposing ticket-scoped session history in the Web UI.
- **Rule:** Bind sessions server-side to `(operator_lark_id, base_id, table_id, record_id)`. Authenticate Web routes through `octo_web_session`, source ticket context from snapshots, and never accept or return a master user ID, browser cookie, or ACP credential. Update typed test fakes when expanding ownership-store interfaces.
- **Verified outcome:** Ticket session list, creation, reload, and follow-up flows are covered by service/controller tests without exposing an identity field to the client.

## [LRN-20260812-003] ticket-ai-transcript-turn-boundary

- **Context:** Real Kimi ACP streams can omit `messageId`, which previously caused a later reply to join the previous assistant block and rendered hundreds of individual thought-status rows.
- **Rule:** Merge text, thoughts, and tool updates into the current assistant turn; when `messageId` is absent, a user message starts a new assistant turn. Render thoughts and tools as collapsed details, not one status row per stream chunk.
- **Verified outcome:** A live Ticket session created and continued through Chrome persisted one session, reloaded as two user/assistant turns, and displayed each turn's merged thought detail.

## [LRN-20260812-004] ticket-ai-session-permission-snapshot

- **Context:** Support-QA Ticket shortcuts need Kimi ACP tool access, while generic AI Sessions must retain the existing deny-by-default behavior.
- **Rule:** Keep logical Skill/Profile/Policy bindings in `AUTOMATION_ACTIONS`, keep only deployment workspace roots in normal Server environment variables, persist the action and policy snapshot with the Session, and return only ACP `allow_once` after a strict per-call match. Never treat an `allow_always` option or a prompt instruction as the security boundary.
- **Verified outcome:** Focused policy, proxy, Ticket Session, and ownership-store tests pass; server TypeScript build passes.

## [LRN-20260812-005] lark-ticket-shared-url-local-ownership

- **Context:** Incremental Lark Ticket snapshots may omit `shared_url`, so persisting it in the platform snapshot could erase an existing detail link.
- **Rule:** Store the retained Ticket detail link in `lark_base_ticket_octo.shared_url`, join it when reading Tickets, and only update it when the source explicitly supplies a non-empty link. Backfill old snapshot values with a `COALESCE` upsert so an already retained local link wins.
- **Verified outcome:** The platform-sync store test proves a later snapshot without `shared_url` retains the previously stored link; server TypeScript build passes.

## [LRN-20260812-006] lark-ticket-shared-url-on-demand-hydration

- **Context:** The Ticket detail page can open before an incremental snapshot contains `shared_url`.
- **Rule:** Render the snapshot first, then request the ticket-scoped Web endpoint only when the link is absent. Resolve the opaque Web session server-side, use its Lark domain and user credential for `batch_get(with_shared_url)`, and persist only `_octo.shared_url` before returning the URL. Keep default Postgres stores lazy so unauthenticated controller branches require no database.
- **Verified outcome:** Service, controller, route, persistence, and FE API tests pass; both server and FE production builds pass.

## [LRN-20260812-007] ticket-ai-quick-action-ui-contract

- **Context:** Ticket detail needs visible Support-QA shortcuts above the AI Session composer without moving prompt, skill, or permission decisions into the browser.
- **Rule:** Render the three stable action keys as compact UI controls, and start a new Session with the selected `actionKey` plus a minimal user intent. The existing Server action catalog remains the authority for prompt, skill profile, and execution policy.
- **Verified outcome:** FE API coverage asserts the quick-action request body; FE tests and production build pass.

## [LRN-20260812-008] web-workspace-role-access

- **Context:** Workspace navigation visibility must not become the only control for synchronized platform data or manual synchronization.
- **Rule:** Resolve the role from the opaque Web session on the server, derive feature permissions once, return only those permissions in the Web Profile, and enforce the same permissions on the corresponding Web endpoints. `admin`, `devops`, and `pm` grant lists and sync; `dev` grants lists only.
- **Verified outcome:** Role-policy and controller tests cover allow/deny cases; full server and FE tests plus both production builds pass.

## [LRN-20260813-001] meegle-checkpoint-type-scope

- **Context:** A project contains User Story, Tech Task, and Production Bug items with independent source-update timelines.
- **Rule:** Key every Meegle incremental checkpoint and run audit by `projectKey/workItemTypeKey`; a Web or CLI run must send one type and its matching source-time field mapping. When splitting full runs, filter stale marking to the same type so another type cannot be marked stale.
- **Verified outcome:** Controller, CLI scope, checkpoint initialization, and type-scoped stale tests pass; server TypeScript build passes.

## [LRN-20260813-002] meegle-web-sync-runtime-dependency

- **Context:** Meegle auth status succeeded while every Web-triggered Meegle incremental sync returned HTTP 502 with the generic `SYNC_FAILED` response.
- **Rule:** Diagnose the checkpoint `last_error` before asking users to reauthorize. Web incremental Meegle sync uses `MeegleShellClient`, so the Server runtime must have a working `meegle` executable on `PATH`; `spawn meegle ENOENT` is a runtime dependency failure, not a user credential failure.
- **Verified outcome:** The failed User Story and Tech Task checkpoints both recorded `spawn meegle ENOENT`, while adjacent Meegle auth checks completed successfully.


## [LRN-20260814-001] lark-ticket-ai-octo-writeback

- **Context:** Support-QA agents previously wrote AI analysis and eval fields straight to Lark Base, making local ownership and retry semantics unclear.
- **Rule:** Store allow-listed Ticket AI fields only in `lark_base_ticket_octo.ticket_ai`; historical backfills read `lark_base_ticket_syncs.fields_json` without touching Lark. Agent updates must use Octo's internal API, which uses the reusable `internal-signed-request-auth` component and fail-closes unless the direct source IP is in the configured CIDR list and the body hash/timestamp/request id is signed by an active SSH key bound to an active Octo user. The caller sends no user ID or key ID: derive the signing public-key `SHA256:` fingerprint from SSHSIG, look it up in `user_ssh_public_keys`, then verify with that stored public key. Lark Ticket sync remains read-only and never writes AI fields to Base. Empty historic Base values are not backfilled.
- **Verified outcome:** Historical preview scanned 1,698 snapshots, wrote 303 meaningful local Ticket AI records, and the post-write preview found 0 remaining candidates. The signed API tests, full Server test suite, build, and `ssh-keygen -Y sign/verify` smoke check pass.

## [LRN-20260814-002] user-ssh-public-key-self-service-boundary

- **Context:** Ticket AI internal SSHSIG authentication needed a usable way for the authenticated owner to register a signing public key without reviving client-supplied user or key identifiers.
- **Rule:** Expose only a Web-session-scoped key list and create endpoint. Derive the owner from the opaque session, normalize and fingerprint the one-line public key server-side, and enforce a global fingerprint uniqueness constraint with an insert-time race fallback. An optional user-visible `label` may identify the key source, but never participates in authentication. Never accept, store, return, or log private material, the internal `id`, or another user's identity. Keep `id` as a server-generated row primary key only; it has no authentication or caller-visible meaning, and migrate the legacy `key_id` column in place.
- **Verified outcome:** Store, service, controller, internal fingerprint, API-auth exemption, and FE API tests cover session ownership, malformed input, typed duplicate rejection, browser-cookie requests, and the legacy primary-key rename; 516 server tests plus FE tests and both builds pass.

## [LRN-20260817-001] lark-list-record-reuse

- **Context:** Lark incremental sync already received complete candidate records from List but then serially called Get for every record, causing 40 redundant reads and a proxy timeout.
- **Rule:** When a paginated Lark response has the same canonical `record_id`, accessible `fields`, and required automatic timestamps as Get, write and clean that record directly. Keep optional resources such as `shared_url` in their explicit Batch Get/on-demand path; do not retain an N+1 read to obtain data it does not guarantee.
- **Verified outcome:** Official contracts, SDK 1.63.1 types, existing full-sync behavior, and a redacted three-record live comparison agree; all three samples had the same 68 fields and timestamps, while neither List nor the current Get returned a shared URL.

## [LRN-20260817-002] github-pr-odoo-web-session-boundary

- **Context:** A plugin user could have ready Lark and Meegle platform authorization while the GitHub PR Odoo.sh badge endpoint returned `401 UNAUTHENTICATED`.
- **Rule:** Diagnose `/api/web/github-pr-odoo-devops-build` through its opaque `octo_web_session` cookie. The endpoint does not use the extension's `master-user-id` identity and does not check a per-user Odoo.sh role; upstream GitHub and Odoo DevOps access use Server-wide credentials after the Web session succeeds.
- **Verified outcome:** PR 1163 requests repeatedly returned immediate `401 UNAUTHENTICATED`; an authenticated request later returned `200`, proving the upstream services were configured and reachable.

## [LRN-20260818-001] extension-environment-config-coherence

- **Context:** The extension can display `ENV_NAME=test` and use the test `SERVER_URL` while retaining a separately persisted production `LARK_OAUTH_CALLBACK_URL`.
- **Rule:** Treat environment-scoped public configuration as one coherent snapshot. Do not persist callback/app/scope values without environment or server-origin provenance, and fail closed before OAuth when the callback origin does not match the selected server origin.
- **Verified outcome:** The extension now invalidates cross-environment public config, refreshes and records the selected Server origin after save, and blocks OAuth on a mismatched callback. All 280 Extension tests, typecheck, and the production build pass.

## [LRN-20260824-001] acp-permission-real-wire-contract

- **Context:** Ticket quick actions had the correct `shell` or `write+shell` Session snapshot but Kimi ACP 0.22 permission requests omitted `rawInput` and used current tool titles, so the old matcher denied them.
- **Rule:** Treat the observed ACP permission payload as a versioned security contract. Parse only exact known command text and diff path shapes, preserve legacy `rawInput` compatibility, match current and legacy tool names, and keep a real-shape fixture in policy tests. A prompt, policy enum, or synthetic `rawInput` test alone does not prove runtime permission compatibility.
- **Verified outcome:** Focused action-catalog, Session, proxy, and permission tests pass for Kimi `Shell` and file diff requests, including fail-closed mismatch and `/tmp/support-qa/` path traversal/symlink cases; Server build passes.

## [LRN-20260825-001] lark-ticket-list-and-batch-boundary

- **Context:** Lark Ticket List already returns the complete record fields and automatic timestamps needed by full/incremental sync; treating it only as an ID enumerator introduced a redundant Batch Get pass.
- **Rule:** Directly consume List records for enumerated or source-filtered full/incremental flows, with `automatic_fields=true` and fail-closed timestamp validation. Use `batch_get` only when the workflow starts from explicit record IDs or needs Batch Get-specific fields. Batch PostgreSQL snapshot UPSERT, cleaning reads, and cleaning updates independently of the platform read strategy.
- **Verified outcome:** 59 focused tests and Server build pass. Full/incremental tests assert no Batch Get call; single/selected sync still covers 100-ID batching and incomplete-result failure. The corrected List-direct path has not yet been run against real authorization.

## [LRN-20260826-001] platform-sync-scope-exclusion

- **Context:** Web, CLI, and a scheduled Worker can all start sync work for the same checkpoint scope; UPSERT makes replay safe but does not prevent duplicated platform reads or an older run overwriting a newer watermark.
- **Rule:** Every sync entrypoint must acquire the same PostgreSQL `(platform, scope_key)` lease before touching the source. Renew the lease with an unforgeable token, guard checkpoint advancement with a version CAS, and treat a scheduled collision as coalesced rather than consuming retry attempts. If a lease is lost, keep successful snapshot UPSERTs but do not advance the checkpoint. User-facing status must derive “currently running” from a non-expired lease, not merely the newest run row: a newer skipped collision must not hide its active owner, and an orphaned stale run must not disable the UI forever.
- **Verified outcome:** Store and coordinator tests prove expired-owner fencing, cross-mode exclusion, checkpoint CAS, collision coalescing, active-run status priority, run audit, and lease cleanup; 78 focused tests and Server build pass.

## [LRN-20260826-002] pm2-worker-entrypoint-lifecycle

- **Context:** A dedicated ESM Worker ran normally through direct `node` execution but entered a clean-exit restart loop under PM2 fork mode.
- **Rule:** Do not identify a PM2-managed ESM entrypoint from `process.argv[1]` alone because it may point to `ProcessContainerFork.js`; also accept PM2's explicit `pm_exec_path` and compare paths through `pathToFileURL`. Every timer or wait that owns a long-running process lifecycle must stay referenced; only auxiliary timers may call `unref()`.
- **Verified outcome:** Direct-Node and PM2-path tests plus enabled/disabled lifecycle tests pass. The real Worker stayed online with restart count zero across multiple polls and completed schedules for all three platforms.

## [LRN-20260827-001] database-backed-route-initialization

- **Context:** Registering the internal ACP Ticket context route eagerly constructed `PostgresPlatformSyncStore` before the Server startup path established its optional SSH database tunnel.
- **Rule:** Route/controller construction must not instantiate database-backed services when their database can require asynchronous startup. Keep service creation lazy until the first authorized request, and cover module initialization independently from request execution.
- **Verified outcome:** The controller no longer reaches `getSharedDatabase()` during route registration; controller/index tests and a real `pnpm --dir server start` reached the listening state.

## [LRN-20260827-002] strict-mode-read-request-deduplication

- **Context:** React StrictMode deliberately reruns mount Effects in the local FE, making each platform list request—and therefore each page in a Lark pagination chain—hit Server twice.
- **Rule:** Keep StrictMode enabled; coalesce identical concurrent read requests in the API client and release the in-flight entry after either completion or failure. Apply the same boundary to shared bootstrap reads such as Web profile.
- **Verified outcome:** API tests prove concurrent profile and Lark list callers share one Promise; FE test/build pass.

## [LRN-20260827-003] explicit-platform-list-pager

- **Context:** A FE that inferred “has next page” from a full 500-row response kept incrementing `offset` when an independently deployed Server ignored offset and repeatedly returned the first page.
- **Rule:** Return an explicit pager from the Server using the same filtered query for `total`; the list/board UI must load only the initial page and request `nextOffset` only after an explicit user action. During staged deployment, a missing pager must fail safe as a completed single page rather than infer another offset.
- **Verified outcome:** Store, service, controller, and FE API tests cover total/count filtering, a valid next offset, one-page loading, and old responses without pager; both builds pass.

## [LRN-20260827-004] platform-list-control-parity

- **Context:** GitHub PR displayed the shared Filter control but had no GitHub filter mapping, Group by configuration, or Label sidebar, so the common toolbar implied capabilities the page did not implement.
- **Rule:** Adding a shared platform-list control to another platform requires the complete vertical slice: normalized/restorable FE state, table and card projections, grouping behavior, tag fields, validated query DTOs, and the same filtered store query for rows and `total`. Do not expose a common icon with a no-op platform branch.
- **Verified outcome:** GitHub PR now supports status/time Filter, list/board Group by, repository/Label/Reviewer sidebar filtering, restored view state, and filtered pagination; FE checks, 22 focused Server tests, and the Server build pass.

## [LRN-20260827-005] denormalized-link-snapshot-projection

- **Context:** GitHub PR snapshots retain extracted Meegle IDs, while only the popup—not the list—needs the separately synchronized Meegle details.
- **Rule:** Keep denormalized IDs in the list projection. At the preview boundary, read one PR and resolve all its IDs in one local snapshot query; preserve unresolved raw IDs and cache successful preview results in the FE session. Do not preload every work item or query one ID at a time.
- **Verified outcome:** Store, service, controller, route, auth, and FE API tests cover on-demand batch lookup, list omission, resolved fields, unresolved IDs, and PR descriptions; 55 focused Server tests, FE checks, and both builds pass.

## [LRN-20260827-006] additive-response-staged-deployment

- **Context:** The FE was hot-updated before the running Server and rejected otherwise valid GitHub PR rows because newly added association arrays were absent.
- **Rule:** For additive response fields that have a safe empty meaning, validate malformed supplied values strictly but normalize an absent field to that empty value at the FE API boundary. This keeps independently restarted FE and Server processes compatible without weakening the new contract once fields are present.
- **Verified outcome:** A regression fixture without `meegleIds` or `meegleWorkitems` parses to empty arrays; all FE tests and the production build pass.

## [LRN-20260827-007] sync-status-summary-boundary

- **Context:** The Sync status page loaded each entire platform list merely to derive a source card's latest successful sync timestamp.
- **Rule:** A status page must read one server-owned status summary, not browser-side snapshot lists. The source-status projection returns the latest snapshot `synced_at` per configured scope, while the browser renders it directly; run history cannot stand in for snapshot state because historical snapshots may predate run tracking.
- **Verified outcome:** The Web source endpoint exposes `lastSyncedAt` from the platform snapshot tables; `#sync` no longer imports or requests platform lists. Status/controller tests and FE checks pass.

## [LRN-20260827-008] sync-status-manual-refresh

- **Context:** A 10-second status poll kept producing background network traffic after the Sync page had been reduced to one status API.
- **Rule:** For operator-driven sync pages, use initial load, explicit refresh, and a post-action refresh; do not continuously poll unless live progress is a stated product requirement.
- **Verified outcome:** `#sync` has no interval timer and exposes a disabled-while-loading refresh button; FE checks pass.

## [LRN-20260827-009] server-filter-empty-state-control

- **Context:** Moving Quick Filters to the Server made a zero-result response replace the list data, and the prior UI hid the very toolbar required to clear that filter.
- **Rule:** Keep filter controls mounted whenever a list request is ready, including an empty server-filtered result; distinguish “no synced data” from “no matching data” in the empty state.
- **Verified outcome:** Lark and Meegle Quick Filter state remains available after an empty response; FE checks pass.

## [LRN-20260827-007] sprint-projection-fact-boundary

- **Context:** A Sprint history UI needed description, dates, capacity, and progress, while the existing Meegle workitem snapshot only retained the related Sprint name and workitem fields.
- **Rule:** Keep Sprint facts and workitem-derived analytics separate. Sync the Sprint object itself before showing platform status, description, dates, or empty future Sprints; derive scope and label counts only from related workitems. Exclude Sprint objects from the ordinary workitem list and retain ended Sprints for history.
- **Verified outcome:** Real metadata and batch detail reads confirmed description plus schedule start/end. Server projects Sprint snapshots separately while FE merges them with workitem statistics; 561 Server tests, 67 FE tests, and both builds pass.

## [LRN-20260827-008] sprint-calendar-lifecycle-boundary

- **Context:** Meegle Sprint status labels and workitem completion can disagree with whether a dated Sprint is past, current, or upcoming.
- **Rule:** Derive Sprint calendar lifecycle only from normalized start/end dates with inclusive boundary days. Do not infer Current from platform status or workitem progress when the date interval is incomplete; show an explicit unknown state, and default expansion only to a date-derived Current Sprint.
- **Verified outcome:** Pure FE tests cover past, both inclusive Current boundaries, upcoming, incomplete/reversed dates, and Current default selection; all 72 FE tests and the production build pass.

## [LRN-20260827-009] meegle-sprint-stable-relation-boundary

- **Context:** Sprint history needed reliable grouping and lifecycle timestamps, but Sprint names are mutable and operation records are not required for the accepted historical approximation.
- **Rule:** Persist the platform Sprint ID separately from its display name and use project plus Sprint ID as the analytical identity. Historical cleaning is a replaceable projection from persisted PostgreSQL facts and must overwrite stale lifecycle values, including with `null`; incremental sync is a phase-aware merge that preserves the earliest known start, clears finish on reopen, and clears both timestamps on New. Missing persisted evidence must not trigger operation-record, all-nodes, or other API backfills. Keep `item_cycle_tag` derived instead of storing it.
- **Verified outcome:** Relation extraction, PG-only lifecycle projection, phase-aware incremental transitions, stable-ID FE grouping, 576 Server tests, 73 FE tests, and both builds pass; the target PostgreSQL historical clean remains a separate unexecuted step.

## [LRN-20260827-010] meegle-sprint-membership-interval-boundary

- **Context:** A single current Sprint projection could calculate current add/start/finish values, but an A to B change overwrote A and made Carryover or historical charts impossible to reproduce.
- **Rule:** Model each continuous Sprint membership as an immutable interval. Incremental sync must close the current interval before opening a new one, update only the open interval for same-Sprint status changes, clamp a new interval's lifecycle times to its observed `added_at`, and write the interval plus compatibility snapshot in one PostgreSQL transaction. A lazily inferred existing interval stays `historical_inferred`; later observations must not upgrade its source.
- **Verified outcome:** Pure transition and pg-mem store tests cover first observation, inferred current state, A to B, explicit removal, completion, reopen, New, and same-Sprint re-entry; Server full tests and TypeScript build pass without adding platform requests.

## [LRN-20260828-001] acp-permission-event-correlation

- **Context:** Kimi ACP 0.38 exposes exact Bash arguments on `tool_call.rawInput` for direct starts, but its streamed-argument path first lazy-creates a tool call without raw input and supplies parsed arguments on a canonical `tool_call_update.rawInput`; the later permission request exposes only a truncated human-readable action summary.
- **Rule:** Authorize from structured tool-call evidence found on either the direct create or canonical upgrade, correlated by `sessionId + toolCallId` and consumed once. Never reconstruct a command from a truncated display string; reject ambiguous, cross-ID, or conflicting evidence. For evidence-required workflows, independently require the expected tool call to reach a successful terminal state before emitting success.
- **Verified outcome:** Runtime fixtures reproduce the 0.38 lazy-create/upgrade/permission order and prove exact fetch approval plus single-use, cross-ID, and mismatch denial; the Ticket workflow recognizes the canonical upgrade but rejects a failed or missing fetch without emitting `done`.

## [LRN-20260830-001] platform-list-linear-row-boundary

- **Context:** The synchronized Lark Ticket, Meegle Workitem, and GitHub Pull Request pages needed to replace tables without becoming card grids.
- **Rule:** Keep one compact horizontal row per item: leading type/priority/status, identifier and title on the left; related PRs, labels, people and date on the right. Preserve filtering, grouping, pagination, sorting and route behavior outside the renderer. When a related collection is longer than the inline limit, show `+N` and keep every value in a keyboard-accessible popover.
- **Verified outcome:** Shared row builders cover all three platform list types; focused row tests and the full FE test/build checks pass. Logged-in browser visual verification remains separate.

## [LRN-20260828-002] path-scoped-read-only-shell-tools

- **Context:** Kimi ACP could not use its native terminal-backed Grep/Glob capability and fell back to Bash `ls` and `grep` while following the Support-QA retrieval workflow.
- **Rule:** Permit read-only shell fallbacks by command grammar and resolved policy path, not by executable name alone. Parse quotes without evaluating them, allow only non-recursive display/search options and a single allowed target, and reject shell control, substitution, escaping, and unquoted expansion syntax before authorization.
- **Verified outcome:** Policy tests approve the observed Support-QA directory listing and quoted ticket-index search, while denying `/etc`, recursive grep, pipes, and command substitution.

## [LRN-20260828-003] meegle-current-owner-projection

- **Context:** Octo 的 Meegle `assignee` 曾读取当前流程节点的第一个 owner，但 Meegle 的真实“Current owner”是独立的 multi-user 系统字段 `current_status_operator`。
- **Rule:** 负责人投影必须在 MQL 和 batch detail 中显式读取 `current_status_operator`，分别兼容 `user_value_list` 与人员数组形态，按源顺序去重保留所有姓名；显式空值是权威结果，不得回退到节点 owner 或类型角色。
- **Verified outcome:** 49 个定向用例和 Server build 通过；全量回填后 1,209 条活动快照中 159 条保留 Current owner，其中 25 条正确保留多人值。

## [LRN-20260828-004] sprint-history-membership-read-boundary

- **Context:** 工作项从 Sprint A 切到 B 后，当前快照只保留 B；如果 Sprint 页面继续按当前 `sprint_id` 分组，A 的未完成工作项、Scope 和结转信息都会消失。
- **Rule:** Sprint 历史、详情和图表必须读取 Server 按连续归属区间展开的工作项投影。当前快照只服务普通列表和兼容接口；结转目标由 Server 根据观察来源、稳定 Sprint ID、日期范围和 A 的完成时间派生，FE 不从当前 Sprint 或状态反推历史。缺少持久化区间的当前关系只能作为 `historical_inferred` fallback，不能显示确定结转。
- **Verified outcome:** Store/API/FE 测试覆盖原 Sprint 保留、A → B 未完成结转、已完成或推定关系不误标、提前移出 Scope，以及 Related PR 附着；定向 Server 34/34、FE check 和 Server build 通过。
