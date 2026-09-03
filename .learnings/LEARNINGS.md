# Learnings

Record concise, reusable lessons here. Include the context, the durable rule, and the verified outcome; never include secrets or raw credentials.

## [LRN-20260901-006] support-analysis-shared-write-boundary

- **Context:** Ticket 人工审核接口与 Summary Quick Action 都要更新 intent、result、quality，但 Quick Action 的实际执行者是外部 ACP Skill，已有 SSH 签名 internal API 通道。
- **Rule:** Web PUT 仅服务 FE human review；ACP 通过受限 wrapper 调签名 internal API。两个 Controller 共用分析应用服务，服务必须核对 Ticket、精确 snapshot version 和 prepared-message evidence，再脱敏并事务 upsert。Summary 只允许写 actionRunId 绑定的临时 JSON，且 fetch/update 两步都完成才接受结果。
- **Verified outcome:** 定向测试覆盖 Web/Internal 分流、Zod、快照/证据拒绝、脱敏、原子更新、精确 ACP 权限和双门禁；Support-QA wrapper 语法及 analysis-update dry-run 通过。

## [LRN-20260901-005] prepared-thread-local-backfill-boundary

- **Context:** Historical Ticket threads already have `messages_json`, so generating their Prepared projection does not require Lark credentials or another external fetch.
- **Rule:** Scope the backfill by `baseId + tableId`, default to dry-run, derive only from local raw JSON, require `--apply` for writes, and update with the scanned `snapshot_version` as an optimistic concurrency guard.
- **Verified outcome:** Script tests prove redaction, current/stale selection, local PostgreSQL writes, and rejection of Lark credential arguments.

## [LRN-20260901-004] support-knowledge-approval-and-redaction-boundary

- **Context:** Ticket Answer needs controlled documents and resolved historical cases, but the thread-sync snapshot is raw source data and the existing Support-QA fetch gate proves Ticket evidence rather than knowledge approval.
- **Rule:** Store searchable knowledge separately as redacted chunks, require explicit human approval before indexing or retrieval, return `source_ref` with every hit, and keep the existing completed `fetch --json` gate mandatory for every Support-QA result.
- **Verified outcome:** PostgreSQL-store and Ticket AI Session tests prove revoked cases are excluded, email text is redacted, and Answer prompts receive approved citations only.
## [LRN-20260902-007] meegle-auth-entrypoint-and-pre-exchange-observability

- **Context:** A new user repeatedly saw Meegle `require_auth_code`; Server and database checks showed a valid identity binding but no exchange request or token row. The toolbar action labeled “授权 Meegle” only opened the Meegle root page, while unmatched root/workbench pages intentionally suppressed the floating sidebar that contained the real auth bridge.
- **Rule:** An action labeled as authorization must either invoke the auth bridge or explicitly say it only navigates to the prerequisite page. Diagnose Meegle auth by separating status, auth-code acquisition, exchange, and persistence; upload non-sensitive stage/error codes from background and content script so a missing Server exchange is distinguishable from an unclicked or failed browser step.
- **Verified outcome:** Route counts, safe page-config logs, toolbar and sidebar code, user clarification, and a read-only credential-presence query confirmed the deadlock without reading credentials or profile data. The `0.9.1` toolbar now invokes the auth bridge on Meegle pages and labels off-page navigation as “打开 Meegle”; 282 Extension tests, typecheck, and production build pass.

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

- **Context:** Sprint history needs stable grouping, while Meegle `start_time` and `finish_time` are current source dates rather than timestamps that can be reconstructed from workflow status or nodes.
- **Rule:** Persist the platform Sprint ID separately from its display name and use project plus Sprint ID as the analytical identity. Project `item_start_time` and `item_finish_time` directly from current source fields as `YYYY-MM-DD`; current empty or invalid values overwrite stale values with `null`. Never preserve an earlier value or infer from status, nodes, creation time, `updatedAt`, or Sprint membership. Keep precise `current_node_start_time`, membership intervals, and derived `item_cycle_tag` as separate concepts.
- **Verified outcome:** Canonical field, Store, Sprint-membership, API and FE tests cover direct replacement, reopen clearing, invalid dates and date-only display; rollout remains incremental-only and no historical clean was executed.

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

## [LRN-20260831-001] meegle-priority-payload-coverage-boundary

- **Context:** Meegle 快照已有独立 `priority` 投影，但同步详情未稳定请求该字段，且 Story/Tech Task 与 Production Bug 把它放在不同的嵌套响应路径；因此 1,203 条历史 payload 中只有 10 条可恢复 Priority。
- **Rule:** 从持久化 payload 清洗枚举投影时，只使用明确保存的字段和值，不把缺失解释为默认值。Meegle 同步若要保证投影覆盖，列表选择、枚举 label 解析、详情覆盖时的 fallback 和数据库写入必须作为一个完整链路验证。
- **Verified outcome:** 事务仅从两个已验证嵌套路径回填 10 条标准 P0/P1/P2，其余 1,193 条保持 `NULL`；后续 MQL 同步显式选择 Priority 并在 detail 缺值时保留 label，33 个定向用例和 Server build 通过。

## [LRN-20260831-002] meegle-type-scoped-detail-field-capture

- **Context:** Meegle 中同一语义的 Tech Team 在 Tech Task 与 Production Bug 上使用不同的动态 field key，Story 则没有该字段；历史 payload 的 Team 覆盖也不足。
- **Rule:** 类型专属自定义字段必须按 work item type key/API alias 集中映射，并由单条、全量和增量详情请求复用；不存在该字段的类型不得猜测或请求其他类型的 key。把字段捕获到 payload 不等于新增数据库或 API 投影。
- **Verified outcome:** batch-get 对 Tech Task 请求 `field_7c2f56`、对 Production Bug 请求 `field_26ef68`，Story 保持不变；29 个定向用例和 Server build 通过。

## [LRN-20260831-003] meegle-mql-field-capability-is-not-projection-readiness

- **Context:** Sprint、Version、System、Bugs 与 `start_time`/`finish_time` 都能被 MQL 显式 SELECT，但现有 adapter 只解析基础字段、Priority、负责人和更新时间，cleaner 则读取 batch-get 的 `work_item_fields` 结构。
- **Rule:** “MQL 能返回字段”不能直接等同于“可删除 batch-get”。替换前必须验证每类关系值结构、时间精度、adapter 投影，以及 workflow node 等 MQL 未提供完整详情的数据依赖。
- **Verified outcome:** 三类限 1 条只读抽样均接受这些字段；MQL 起止时间为日粒度 `string_value`，Production Bug System 返回嵌套 `cascade_key_label_value`，现有 batch-get 仍有明确职责。

## [LRN-20260831-004] semantic-field-multi-view-presentation

- **Context:** Meegle `system` 已存在于 Server DTO、Sprint membership 投影和 FE parser，但普通紧凑行会在窄屏隐藏，Sprint 详情的独立视图配置也未声明该字段。
- **Rule:** 已投影语义字段要跨多个 FE 工作项视图可见时，需要逐一核对列注册、取值函数、单元格、筛选/排序/分组和响应式隐藏规则；API 已有字段不代表每个页面已经展示。
- **Verified outcome:** 普通列表在窄屏保留 System，Sprint 详情提供 System 列、筛选、排序和两级分组；26/26 个 FE 测试文件及 production build 通过。

## [LRN-20260831-005] route-scoped-session-view-state

- **Context:** Sprint 详情组件以 route hash 为 key 挂载，离开页面就会丢失本地过滤和视图 state；不同 Sprint 的可选值又不能安全共用同一份过滤条件。
- **Rule:** 会话内详情页偏好应由不会随详情路由卸载的 App 层持有，以稳定 route ref 分区；详情页卸载时回传，只恢复白名单过滤字段和归一化后的分组、排序、显示列。菜单开关等瞬时 UI state 不应混入配置。
- **Verified outcome:** Sprint A/B 各自保留过滤和视图配置，未知字段与非法值被丢弃；26/26 个 FE 测试文件和 production build 通过。

## [LRN-20260831-006] meegle-current-node-duration-boundary

- **Context:** FE 需要从已持久化的 `current_node_start_time` 与 `add_to_cycle_time` 中选择依据，展示工作项的 `current_working_time`；Sprint 历史投影又可能携带工作项当前快照的节点时间。
- **Rule:** 当前节点工作时长只能从 `current_node_start_time` 开始，未完成时截止当前时间；只有完成时间仍是精确 datetime 时才可作为终点，日粒度 `item_finish_time` 必须留空显示，不能伪造时分秒。不得回退到 Cycle/Sprint 加入时间或更新时间。已关闭的 Sprint membership 没有历史节点开始事实时应留空，不能用当前工作项快照污染历史。
- **Verified outcome:** 普通列表与 Sprint 详情默认显示派生时长并每分钟刷新；测试覆盖活动项、精确旧完成值、日粒度完成值、缺失、非法、倒序、无 Cycle fallback 和已移出 Sprint，FE 全量 test/build 通过。

## [LRN-20260831-007] lark-thread-root-id-boundary

- **Context:** A Lark Ticket link provides a `threadid`, while the single-message endpoint requires a message ID. Treating them as interchangeable caused HTTP 400 and marked reply-only snapshots complete.
- **Rule:** Fetch a thread with `thread_id`, derive the root message ID from a reply's `root_id`, then fetch the root message by that ID. A historical snapshot containing replies but no stored corresponding root must be selected for a forced full repair before it can be treated as complete.
- **Verified outcome:** Thread-context and backfill tests cover root-ID lookup, reject `thread_id` as the message request ID, and reselect reply-only snapshots; Server TypeScript build passes.

## [LRN-20260901-001] local-candidate-remote-write-snapshot-refresh

- **Context:** Meegle 工作项列表需要从 System 对应仓库快速选择 PR，同时关联关系仍由 GitHub 标题/描述标记的同步快照投影。
- **Rule:** 候选列表读取本地 open/draft 快照并由 Server 映射仓库；选择后必须重新读取远端最新 PR、幂等追加精确 `m-<workItemId>` 标记，并用 GitHub 返回值立即 UPSERT 本地快照。远端写入后的本地失败要作为可重试的 partial success 明示。
- **Verified outcome:** Service/controller/adapter/store 测试覆盖仓库约束、draft 摘要、标题只追加一次、结构化错误和即时快照刷新；8 个定向 Server 文件 76/76、FE 27/27 与两端 build 通过。

## [LRN-20260901-002] meegle-role-members-current-relation-boundary

- **Context:** Meegle 工作项 payload 的 `work_item_attribute.role_members` 同时包含角色定义、稳定人员 key、显示名和 email；许多角色没有成员，旧快照也可能完全缺失这段证据。
- **Rule:** 把当前角色成员清洗为以 workitem ref、role key 和 member key 标识的关系投影，保留角色/成员源顺序并区分“字段缺失”和“明确为空”。负责人 `current_status_operator` 继续独立；列表读取不解析 payload、不拼接姓名作为查询键，也不复制未使用的 email。`Subscribed` 之类“与我相关”过滤必须由 Server 会话解析稳定人员 key，并作为独立 AND 条件与手选人员组及其他过滤组合，不能把当前用户追加进组内 OR 数组。
- **Verified outcome:** 关系表、member-leading 索引、事务清洗、memberKey API 筛选和 FE 普通列表/看板/Sprint 展示已落地；本地回填写入 2,515 条关系，空字段、重复和孤儿均为 0，二次回填为 0 变更。后续 `Subscribed` 快速过滤在不暴露会话 Meegle key 的前提下完成独立 AND 查询，Store/controller/session 共 44 个聚焦测试、FE 全量测试和两端 build 通过。

## [LRN-20260901-003] ticket-reply-requires-session-and-root-proof

- **Context:** Support-QA Answer 的文本本身不是发送授权；历史 thread 同步保存的是 reply 消息，Lark 回复 API 需要 root message ID。
- **Rule:** 发送前必须校验当前用户、Ticket 复合键、Answer action session 归属和固定 thread 上下文；从 reply 的 `root_id` 派生发送目标，并以 Ticket/Session/draft hash 去重。不能把模型输出或 `thread_id` 直接当作发送授权。
- **Verified outcome:** 新服务仅在该校验后调用 Lark `replyToMessage(..., reply_in_thread=true)`；脱敏/证据单测、Server build、FE test/build 通过，未进行真实发送。

## [LRN-20260901-004] eval-sample-freezes-mutable-ai-output

- **Context:** Ticket 的当前 `ticket_ai` 与 SupportTicketAnalysis projection 都会随重跑或人工审核而变化，直接把它们当作 Eval 数据会丢失原始 AI 输出。
- **Rule:** Eval/Badcase 样本必须在创建时以 Ticket 复合键和完整 thread snapshot version 冻结 allow-listed AI 输出；人工标准答案与失败标签另存。相同 Ticket/snapshot 的创建需幂等，历史样本不被后续 Ticket AI 更新覆盖。
- **Verified outcome:** Server service 拒绝缺失或不完整的线程快照，PostgreSQL 样本表对 Ticket/snapshot 建唯一约束；聚焦 Server 测试、FE 全量测试和两端 build 通过。

## [LRN-20260901-005] ticket-ai-pipeline-does-not-infer-session-completion

- **Context:** Ticket AI 的问题总结、回答问题和生成文档是不同的 AI Session；只有部分结论会进入本地 `ticket_ai`，不能因存在分析结果就把后续阶段显示为完成。
- **Rule:** AI 输出列表按意图识别、问题总结、Ticket 答案总结、文档生成四阶段读取明确字段；旧分析/知识字段可做兼容映射，但无持久化回答或文档字段时必须显示未生成。列表只导航到详情页启动既有 Session，不复制流式 workflow。
- **Verified outcome:** Pipeline 单测覆盖兼容映射及答案空态，新增字段进入 allow-list 和分组详情；两端 build 通过。

## [LRN-20260901-006] web-session-routes-must-be-explicitly-exempt-from-header-auth

- **Context:** Eval 样本列表由浏览器 Web Session 鉴权，但其路径不在通用 API header-auth 的豁免集合中，导致已登录页面仍收到 `UNAUTHORIZED: Missing master-user-id header`。
- **Rule:** 新增 Web Session 路由时，必须同时检查 `createApiAuthMiddleware` 的路径豁免；对含参数的资源路由应豁免精确根路径和资源前缀。不能要求浏览器伪造或携带 `master-user-id`，身份只从服务端 session 解析。
- **Verified outcome:** Eval 列表根路径和样本编辑前缀均加入豁免，middleware/controller/route 定向测试 13/13 和两端 build 通过。

## [LRN-20260902-001] acp-permission-must-carry-command-before-approval

- **Context:** Kimi 0.39.1 在 Support-QA Summary 的 Bash 审批请求中先发送通用工具标题，未携带 rawInput 或完整命令；命令参数只在审批被响应后才以 tool-call update 发送。
- **Rule:** 对模型 Shell 的受控白名单不能根据工具名、后到的参数或会话文件做推断放行。通用 ACP 客户端应声明标准 `terminal` / `fs` 能力，让命令和路径在执行前以结构化请求进入同一策略；旧 Kimi 若仍绕过 terminal 并发送无载荷审批，只能安全拒绝，不能为每个业务建立专用 ACP 或默认授权 Bash。
- **Verified outcome:** 标准 terminal/fs 客户端与策略确认旧 Kimi 的 Bash 请求无法安全判定；最终以同一 ACP 会话中的结构化 `execute` MCP 替代业务 Shell，同时保留 fs 读写与自然语言响应，三条真实 Ticket 写回通过。

## [LRN-20260902-002] acp-operational-effects-use-structured-execute

- **Context:** Kimi ACP 的 Bash 审批不稳定地缺少命令载荷，但 Support-QA 仍需要调用现有 fetch/update 脚本，且 Quick Action 必须保留自然语言结果。
- **Rule:** 文件读写交给 ACP fs callback 做 root、敏感路径与 symlink 校验；业务命令统一走一个结构化 `execute` MCP，由 Server manifest 和 action context 同时约束 root、script、subcommand 与 argv，使用 `shell: false` 执行。不要默认授权 Bash，也不要为每个业务建立新的 ACP 通道。
- **Verified outcome:** 三条真实 Ticket 完成 fetch、workspace JSON 写入、signed analysis-update 和 FE 投影回读；AI 输出与 Eval 视图均在登录态页面可见，Eval 创建不再返回 `UNAUTHORIZED`。

## [LRN-20260902-003] normalized-ai-write-must-refresh-list-projection

- **Context:** Support analysis 已写入规范化 intent/result/quality 表，但 AI 输出列表只读取 `lark_base_ticket_octo.ticket_ai`，造成 Session 成功而列表仍显示“AI 未输出”。
- **Rule:** 同一个 Server analysis-update 在通过 snapshot/evidence 校验后，必须同步更新规范化分析模型和 allow-listed `ticket_ai` 读投影；不能要求 FE 联表或从 Session 文本推断完成状态。
- **Verified outcome:** 2070、2007、2111 在 AI 输出视图显示意图类型、问题总结和明确阶段状态，并可直接冻结为 Eval 样本。

## [LRN-20260902-004] rejected-ai-output-is-a-draft-not-a-success

- **Context:** Kimi 已生成完整回答，但 Ticket 证据 fetch 或 `analysis-update` 门禁失败；旧流程既拒绝正式结果，也不把新 Session 绑定回 Ticket，导致正文刷新后丢失。
- **Rule:** 失败门禁必须保留 actionRun、Session 归属、错误码和模型正文，并明确标记 `unverified`；禁止写正式 intent/result/quality 和 `ticket_ai`，禁止直接发送。重试未验证 Quick Action 必须新建受控运行，不能作为普通 follow-up 绕过门禁。
- **Verified outcome:** PostgreSQL ownership store、Session service、FE 未验证状态及重新执行链通过 19 个聚焦测试，FE 135 tests、两端 build 与本地 migration 通过。

## [LRN-20260902-005] opaque-bash-exception-must-be-explicit-and-removable

- **Context:** 用户明确要求先解决 Kimi ACP 0.38 缺少 command 的 Bash 审批失败，即使这时无法验证脚本目录。
- **Rule:** 临时兼容只能按明确 action、skill profile、skill 和 execution policy 收口，使用独立 policy version 并记录 `temporary_unverified_bash`；必须公开说明它不是目录沙箱，不能扩散到其他 action，并保留结构化 execute 作为收紧路径。
- **Verified outcome:** 三个 Lark Ticket Support-QA action 可获单次 Bash 批准，非 Support-QA action 继续拒绝；权限与 ACP runtime 定向测试通过。

## [LRN-20260902-006] session-ownership-must-be-durable-at-creation

- **Context:** ACP Session 创建和 prompt 执行是两个不同阶段；Server 重启或流中断可能发生在两者之间。
- **Rule:** 依赖 Session 可恢复性的外部上下文关联必须在 `session.created` 事件到达时立即开始持久化，不能等模型完成、证据门禁或 `chat()` 返回。失败结果状态可后写，但 Ticket 归属是创建阶段的不变量。
- **Verified outcome:** 中断回归测试证明 attach 先于后续 prompt failure；实际孤立 Session 已按唯一 session id 恢复并从数据库回读 Ticket 2106、thread 与 actionRun。
## [LRN-20260903-001] meegle-mql-datetime-literal-boundary

- **Context:** Meegle 的 `updated_at` 返回值和 Octo checkpoint 可以规范化为秒级 `YYYY-MM-DD HH:mm:ss`，但 MQL datetime 查询字面量不接受相同的空格分隔表示。
- **Rule:** 将“源值/持久化时间规范化”和“MQL 查询字面量序列化”作为两个独立协议处理。MQL datetime 必须使用带 `T` 的受支持格式；修改 formatter 时必须保留真实只读 MQL 验证，不能只更新 mock 中的期望字符串。
- **Verified outcome:** 运行审计显示提交 `9925646` 将查询阈值从 ISO 改为空格格式后，四类 Meegle 增量 scope 立即从成功变为 `ErrMoqlInvalidArgument` Code 2001；独立 MQL formatter 恢复 ISO 后，40 个定向测试、Server build、真实只读 MQL 与 staging 手工同步通过。

## 2026-09-03 — Offline ticket intent analysis via `kimi acp`

- `kimi acp` (kimi-code CLI 0.39.x) speaks ACP over stdio: `initialize` → `session/new` (per-ticket session, avoids cross-ticket context contamination) → `session/prompt`; agent text arrives as `session/update` notifications with `agent_message_chunk` updates.
- `lark_ticket_thread_syncs.prepared_messages_json` (redactionVersion v2) is exactly what the online quick-action flow feeds the model — reuse it verbatim for offline parity; `support-ticket-analysis.ts` `validateSupportEvidence` requires evidence IDs from that snapshot.
- Server `SUPPORT_INTENT_TYPES` uses `service_request` (not `feature_request`) — the DB/enum, not the prompt draft, is the source of truth for output validation.

## 2026-09-03 — Shadow summary worker implementation notes

- `upsertLarkBaseTicketAi` rewrites the whole `ticket_ai` JSON (`{fields, updatedAt}`), so any other top-level key stored there is wiped by the next online analysis update. Coexisting per-ticket AI state needs its own column (we added `lark_base_ticket_octo.shadow_ai`).
- Adding a required column to the Kysely schema means every `insertInto` for that table must set it — check scripts too (`backfill-lark-ticket-ai.ts`), not just the store.
- In this shell `pnpm` is not on PATH; use `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"` + `corepack pnpm`.
- `octo-kimi-execute-mcp.test.ts` flaked once under full-suite parallel load (bash spawn returned empty stdout); passes on rerun. Not caused by code changes — verify flakiness by re-running before investigating.

## [LRN-20260903-002] shared-semantic-badges-and-user-rendering

- **Context:** 普通 Meegle 列表已有按状态语义着色的 badge，但 Sprint 详情仍显示纯文本；负责人和相关人也绕过了统一 `User` 展示。
- **Rule:** 同一平台语义在多个 FE 视图中展示时，共享 tone/分类纯函数，页面只负责选择 badge 外观；人员姓名统一通过 `User` 组件渲染，角色分组、溢出和历史/当前边界继续留在各自关系组件中。
- **Verified outcome:** Sprint 的状态、项目、Version、System、优先级使用一致 badge，负责人和当前相关人使用 `User`；FE 31/31 测试文件和 production build 通过。

## [LRN-20260903-003] async-groups-must-exist-before-default-collapse-is-committed

- **Context:** Meegle 列表的默认折叠 effect 会在异步数据尚未返回、分组数组为空时记录当前配置；数据到达后配置 key 没变化，因此不会再折叠真实分组。
- **Rule:** 依赖异步派生集合的“一次性默认状态”只能在集合非空后标记为已初始化；恢复出的显式空数组仍表示用户选择全部展开，必须与“尚未初始化”区分。
- **Verified outcome:** `/#meegle-workitems` 缺省按类型分组，并在真实类型组出现后统一折叠；已恢复状态不被覆盖，FE 31/31 测试文件和 production build 通过。

## [LRN-20260903-004] filter-identity-and-sprint-statistics-must-share-an-explicit-aggregation-key

- **Context:** Meegle 工作项筛选协议按 Sprint 名称传值，而 Sprint 快照与成员历史按 `projectKey + sprintId` 标识；同名 Sprint 可能来自多个项目或多个稳定 ID。
- **Rule:** 在名称型筛选中合并 Sprint 统计时，先按稳定 ID 构建每个 Sprint 摘要，再显式按筛选协议的名称聚合 Scope/状态统计并重新计算百分比。当前列表命中数和完整 Sprint 历史 Scope 必须分开展示，不能把分页内计数冒充完整 Scope。
- **Verified outcome:** Sprint 标签按名称自然倒序，同名 Sprint 统计可复核地求和，右侧“当前列表 N 项”与“完成 X/Y”并列但语义独立；FE 31/31 测试文件和 production build 通过。
