---
status: draft
owner: TBD
last_reviewed: 2026-06-18
scope: Lifecycle map for current Octo technical objects across extension, server, adapters, and platforms
update_required_when:
  - page/action config contract changes
  - extension action dispatcher changes
  - identity/auth storage changes
  - Lark Base to Meegle workflow changes
  - Meegle metadata resolver or field mapping strategy changes
---

# Current System Technical Objects Lifecycle

本文档按技术对象整理当前 Octo 系统的生命周期。它用于回答三个问题：

1. 某个对象在哪一层创建，由谁消费？
2. 对象从页面到 server、adapter、平台的流转顺序是什么？
3. 出错时应该先定位 extension、server、adapter 还是 platform？

相关规则见 `../rules/system-boundaries-and-code-rules.md`，当前问题见 `../governance/current-issue-map-2026-06-09.md`。

## 1. Object Map

| Object | Owner | Main files | Current status |
| --- | --- | --- | --- |
| `ExtensionPageConfig` | Server catalog | `server/src/modules/public-config/public-config.controller.ts`, `extension/src/types/automation-actions.ts` | 已存在，但 extension fallback 和本地 action 分支仍会造成漂移 |
| `AutomationActionConfig` / `AutomationActionListItem` | Server catalog, extension UI consumes | `server/src/modules/public-config/public-config.controller.ts`, `extension/src/popup-shared/popup-controller.ts` | server 返回 executor，但 popup 执行仍主要按 `actionKey` 本地分支 |
| `PopupPageContext` | Extension | `extension/src/popup-shared/popup-controller.ts`, `extension/src/content-scripts/*`, `extension/src/platform-url.ts` | 页面上下文由 extension 采集，page/action 规则与 server 有重复 |
| `IdentityState` / `masterUserId` | Server identity store, extension cache | `extension/src/background/storage.ts`, `extension/src/popup/runtime.ts`, `server/src/adapters/postgres/resolved-user-store.ts` | 已支持 tab/global fallback，但 action trace 缺少统一身份阶段 |
| `MeegleAuthCredential` | Server auth store, extension auth bridge triggers | `extension/src/content-scripts/meegle.ts`, `extension/src/background/handlers/meegle-auth.ts`, `server/src/modules/meegle-auth/*` | 使用 auth-code bridge；不能把 cookie 发给 server |
| `LarkAuthCredential` | Server auth store, extension OAuth callback bridge | `extension/src/background/handlers/lark-auth.ts`, `extension/src/content-scripts/lark-auth-callback.ts`, `server/src/modules/lark-auth/*` | OAuth session/callback 已存在；live E2E 保护线不足 |
| `LarkBitableRecord` | Lark adapter / server workflow | `server/src/modules/lark-base/lark-base-workflow.service.ts`, `server/src/adapters/lark/lark-client.ts` | server 读取记录并构建 Meegle draft |
| `WorkitemMapping` | Server workflow config | `server/src/modules/lark-base/lark-base-workflow.service.ts`, `server/src/modules/lark-base/lark-base-workflow-config.ts` | 支持 env/config 映射；仍有 hardcoded fallback |
| `ExecutionDraft` | Server workflow | `server/src/validators/agent-output/execution-draft.ts`, `server/src/modules/lark-base/lark-base-workflow.service.ts` | Lark record 到 Meegle create 的中间对象 |
| `MeegleWorkitem` | Meegle platform, adapter wraps | `server/src/adapters/meegle/meegle-client.ts`, `server/src/application/services/meegle-workitem.service.ts` | create/update 已封装；字段可写性主要靠失败后重试 |
| `MeegleFieldMetadata` | Should be server metadata resolver | `server/src/adapters/meegle/meegle-client.ts` | adapter 有 `getFields`/`getWorkitemMeta`，但 workflow 未集中使用 |
| `LarkWriteback` | Server workflow / Lark adapter | `server/src/modules/lark-base/lark-base.service.ts`, `server/src/modules/lark-base/lark-base-workflow.service.ts` | Meegle link 回写到 Lark Base |
| `MeegleLarkPushAction` | Server workflow | `server/src/application/services/meegle-lark-push.service.ts` | 从 Meegle 读 Lark 字段，更新 Lark Base、发消息、回写 Meegle 状态 |
| `MeegleStoryBackBriefAction` | Server workflow | `server/src/application/services/meegle-story-prd-to-simplified.service.ts`, `server/src/modules/meegle-workitem/meegle-story-prd-to-simplified.controller.ts` | 从 Meegle Story Summary 生成 Tech Summary；使用 ACP one-shot、限流、超时和结构化错误 |
| `WorkflowPrompt` | Server PostgreSQL store | `server/src/adapters/postgres/workflow-prompt-store.ts`, `server/src/domain/workflow-prompts.ts` | 按稳定 `key` 存储 workflow prompt 和 `note`；Story 研发Review 使用 `meegle.story.prd_to_simplified` |
| `AcpKimiOneShotRuntime` | Server ACP proxy / adapter | `server/src/application/services/acp-kimi-proxy.service.ts`, `server/src/adapters/kimi-acp/kimi-acp-runtime.ts` | 一次性 ACP runtime；不进入 reusable session registry，prompt 后关闭 |
| `GitHubWorkitemAction` | Extension modal + server workflow | `server/src/modules/github-branch-create/*`, `server/src/controllers/github-reverse-lookup.ts`, `extension/src/popup-shared/*github*` | 依赖 Meegle workitem 字段和 GitHub adapter |
| `ActionRunTrace` | Should be cross-layer contract | docs issue/rules only | 规则已定义，代码尚未统一实现 |

## 2. Layered Object Matrix

这里按 error envelope 的 `layer` 维度整理技术对象。这个矩阵用于排障和代码放置：先判断对象属于哪一层的权威状态，再决定应该改 extension、server、adapter 还是平台 metadata。

| Layer | Technical objects | Layer responsibility | Should not own |
| --- | --- | --- | --- |
| `extension` | `PopupPageContext`, popup state, visible action button, auth trigger state, content-script identity probe, tab-scoped cached `masterUserId` | 采集页面上下文、渲染 UI、触发授权、派发 action、展示结果 | 业务 workflow、平台字段规则、跨平台 mapping、真实 token 持久化 |
| `server` | `ExtensionPageConfig`, `AutomationActionConfig`, `ResolvedUser`, `ExecutionDraft`, `WorkitemMapping`, `WorkflowPrompt`, workflow request/result, `ActionRunTrace`, semantic field mapping, ACP one-shot limiter | action catalog、身份解析、授权检查、业务编排、workflow prompt、错误归一化、测试契约、一次性 ACP 任务控制 | 浏览器 DOM 细节、平台原始字段 shape、直接依赖 extension UI 状态 |
| `adapter` | `MeegleClient` request/response, `LarkClient` request/response, `GitHubClient` request/response, token refresh wrapper, normalized platform error | 第三方 API 封装、请求/响应归一化、平台错误转换、安全日志摘要 | PM 业务决策、popup 行为、跨平台 workflow 编排 |
| `platform` | Lark Base record, Lark message/thread/reaction, Meegle workitem, Meegle field metadata, Meegle auth code, GitHub PR/repo/branch | 外部真实状态、权限限制、字段限制、状态机限制、平台返回错误 | Octo 内部业务语义和错误契约 |

## 3. Cross-Layer Ownership Rules

技术对象不要只看“在哪个文件出现”，要看它的 canonical owner、projection 和允许流转。

| Object | Canonical owner | Layer projection | Allowed transitions | Forbidden usage |
| --- | --- | --- | --- | --- |
| `ExtensionPageConfig` | `server` | `extension` stores and renders it | server catalog -> extension state -> sidebar/action UI | extension 自己维护完整 page/action 规则 |
| `AutomationActionConfig` | `server` | `extension` renders visible button and dispatches executor | server action config -> popup button -> frontend/backend executor | popup 为每个 backend action 硬编码 route 分支 |
| `PopupPageContext` | `extension` | `server` receives sanitized context in action request | tab URL/DOM context -> action request context | server 依赖 extension 内部 UI 状态 |
| `ResolvedUser` / `masterUserId` | `server` | `extension` caches selected identity | identity resolve -> cached masterUserId -> action header/body | extension 自行判断真实账号绑定关系 |
| `MeegleAuthCredential` | `server` | `extension` only triggers auth code acquisition | page auth_code -> server exchange -> token store -> workflow refresh | extension 把 raw cookie/token 发给 server 或持久化真实 token |
| `LarkAuthCredential` | `server` | `extension` tracks OAuth progress/result | OAuth session -> callback -> token store -> workflow refresh | extension 直接持有长期 Lark token 作为 workflow credential |
| `LarkBitableRecord` | `platform` | `adapter` normalizes, `server` interprets | Lark API -> adapter record -> workflow field extraction | extension 直接承担 Lark record 到 Meegle 的业务映射 |
| `WorkitemMapping` | `server` | config/env may provide mapping source | Lark issue type -> server mapping -> `ExecutionDraft` target | adapter 或 extension 决定 workitem type/template |
| `ExecutionDraft` | `server` | adapter consumes converted payload | Lark record -> draft -> Meegle apply -> workitem create | draft 长期承载平台动态 `field_*` 作为业务语义 |
| `MeegleWorkitem` | `platform` | `adapter` normalizes, `server` reads/writes by workflow | Meegle API -> adapter workitem -> workflow decision/update | extension 直接读写 Meegle workitem 业务字段 |
| `MeegleFieldMetadata` | `platform` | `adapter` fetches, `server` resolver turns into semantic field map | platform metadata -> adapter raw response -> server resolver -> validated payload | workflow/popup 散落硬编码 `field_*` |
| `LarkWriteback` | `server` workflow | `adapter` sends Lark update request | workflow result -> Lark adapter update -> platform record state | Meegle adapter 或 extension 直接决定 Lark Base 回写规则 |
| `MeegleLarkPushAction` | `server` | `extension` triggers, adapters execute platform calls | Meegle page action -> server workflow -> Lark/Meegle adapters -> result flags | popup 自行编排 Lark update/message/reaction |
| `MeegleStoryBackBriefAction` | `server` | `extension` triggers, Meegle/Kimi adapters execute platform and ACP calls | Meegle Story page action -> server workflow -> Meegle read -> ACP one-shot -> Meegle Tech Summary update -> result | popup 自行读取 Meegle fields 或调用 ACP |
| `AcpKimiOneShotRuntime` | `server` | ACP adapter subprocess/runtime | workflow limiter -> ACP runtime initialize -> session/new -> prompt -> close runtime | 写入 reusable session registry 或 ownership store |
| `GitHubWorkitemAction` | `server` for workflow, `extension` for modal UX | platform data via Meegle/GitHub adapters | page context -> modal -> server preview/create/lookup -> result | extension 直接解析 Meegle fields 或决定 repo mapping |
| `ActionRunTrace` | `server` contract, initiated by `extension` | all layers append logs with same id | action click -> actionRunId -> server/adapter/platform result -> popup display | 某层吞掉错误，只返回普通 message |

## 4. Split-File Policy

当前先把所有对象放在同一份 lifecycle 文档中，避免过早拆散上下文。只有满足以下条件时，才把对象拆成独立 lifecycle 文件：

1. 生命周期跨三层以上。
2. 失败会影响真实平台数据或用户授权。
3. 后续会进入实际重构或迁移。
4. 需要单独测试矩阵、seed data、回滚策略或 owner review。

优先拆分候选：

| Candidate file | Object | Split when |
| --- | --- | --- |
| `action-run-trace.md` | `ActionRunTrace` | 开始实现 `actionRunId`、error envelope、跨层日志 |
| `identity-and-auth.md` | `IdentityState`, `MeegleAuthCredential`, `LarkAuthCredential` | 改授权状态、token store、identity fallback 或 live E2E |
| `meegle-field-metadata.md` | `MeegleFieldMetadata` | 开始实现 metadata resolver 或替换硬编码 `field_*` |
| `lark-base-to-meegle-workitem.md` | `LarkBitableRecord`, `WorkitemMapping`, `ExecutionDraft`, `MeegleWorkitem`, `LarkWriteback` | 改 Lark Base 创建 Meegle 或批量创建流程 |
| `meegle-to-lark-push.md` | `MeegleLarkPushAction` | 改 update-lark-and-push |

暂时不拆：

| Object | Reason |
| --- | --- |
| `PopupPageContext` | 主要是 extension projection，单独拆会和 page/action 文档重复 |
| `AutomationActionConfig` | 先跟 `ActionRunTrace` 和 page config 放在一起看更清楚 |
| `LarkWriteback` | 当前更适合作为 Lark Base -> Meegle workflow 的一个状态 |
| `GitHubWorkitemAction` | 当前依赖 Meegle metadata 问题，等 metadata resolver 成形后再决定是否拆 |

## 5. Page Config Lifecycle

### Object

`ExtensionPageConfig`

```ts
{
  platform;
  pageType;
  matchedRuleId;
  sidebar;
  automationActions;
}
```

### Lifecycle

```text
browser tab URL
  -> extension popup/content script captures current URL
  -> extension calls server /api/config/page?url=...
  -> server parses URL host/path/query
  -> server returns platform/pageType/matchedRuleId/sidebar/actions
  -> extension stores pageConfig in popup state
  -> popup/content renders sidebar and actions
```

### States

| State | Meaning | Owner |
| --- | --- | --- |
| `unknown` | popup opened but current tab/config not resolved | extension |
| `resolved` | server returned `ExtensionPageConfig` | server -> extension |
| `unsupported` | server cannot match supported page | server |
| `fallback` | server config fetch failed and extension generated local fallback | extension |
| `stale` | URL changed but popup/content still holds old config | extension |

### Current risks

- Server has canonical page/action rules, but extension still has local platform detection and fallback.
- Server returns `matchedRuleId`, but downstream action execution does not consistently use it for diagnostics.
- Fallback currently risks enabling UI when server would have rejected the page.

### Code rules

- New page/action rule starts in server catalog.
- Extension fallback must be conservative.
- Shared URL fixtures should prove server and extension agree on pageType and actions.

## 6. Automation Action Lifecycle

### Object

`AutomationActionConfig` on server becomes `AutomationActionListItem` in extension.

### Lifecycle

```text
server action definition
  -> included in pageConfig.automationActions
  -> popup maps action to visible button
  -> user clicks action
  -> extension dispatches by executor
  -> frontend executor opens local UI, or backend_api executor calls server route
  -> server workflow runs
  -> result returns to popup
```

### States

| State | Meaning |
| --- | --- |
| `cataloged` | server defines action key/title/executor |
| `visible` | popup renders the action for current page |
| `blocked` | required auth/context missing |
| `running` | user clicked and action is executing |
| `succeeded` | action returned success result |
| `failed` | action returned normalized error |

### Current risks

- Popup currently preserves only display fields when producing `PopupFeatureAction`.
- `runFeatureAction(actionKey)` still keeps several frontend action branches while backend API actions are moving toward executor-driven dispatch.
- Server `executor.operation` is not yet the true execution contract.

### Code rules

- Popup should preserve executor and dispatch by executor, not by backend action key.
- Backend action should not require adding a new popup branch.
- New or refactored cross-layer action runs should generate `actionRunId`.

## 7. Identity And Auth Lifecycle

### Objects

- `masterUserId`
- `operatorLarkId`
- `meegleUserKey`
- Lark user token
- Meegle user token
- tab-scoped resolved identity

### Lifecycle

```text
popup initializes
  -> loads cached settings and resolved identity
  -> asks content script for Lark/Meegle page identity when available
  -> calls /api/identity/resolve
  -> stores masterUserId globally and per tab
  -> checks Lark auth status
  -> checks Meegle auth status
  -> action requests include masterUserId
```

### Meegle auth lifecycle

```text
user on Meegle page
  -> extension content script calls Meegle BFF auth_code API using page session
  -> background sends auth_code to server /api/meegle/auth/exchange
  -> server exchanges auth_code for token
  -> server stores token by masterUserId + meegleUserKey + baseUrl
  -> workflows refresh credential before Meegle API call
```

### Lark auth lifecycle

```text
popup starts Lark OAuth
  -> extension/background saves pending OAuth state
  -> server creates/callbacks OAuth session
  -> callback page exposes result to content script
  -> extension stores masterUserId and refreshes auth state
  -> server stores/refreshes Lark token for workflow calls
```

### Failure points

| Failure | Likely owner |
| --- | --- |
| No page identity can be read | extension/content script |
| Cannot resolve `masterUserId` | server identity |
| Missing Meegle binding | server identity store |
| Auth code unavailable | extension Meegle page bridge or platform |
| Token expired/refresh failed | server auth service or platform |
| Action called without `masterUserId` | extension dispatcher |

### Code rules

- Extension may trigger auth, but token exchange and persistence stay on server.
- Never send raw browser cookies to server.
- Action errors must distinguish identity missing, auth missing, token expired, and platform rejected.

## 8. Lark Base To Meegle Workitem Lifecycle

### Objects

- `LarkBitableRecord`
- `WorkitemMapping`
- `ExecutionDraft`
- `MeegleApplyInput`
- `MeegleWorkitem`
- `LarkWriteback`

### Lifecycle

```text
Lark Base record page or bulk view
  -> extension triggers create/bulk-create workflow
  -> server validates request: baseId/tableId/recordId/masterUserId
  -> server builds authenticated Lark client
  -> server reads LarkBitableRecord
  -> server extracts Issue 类型
  -> server resolves WorkitemMapping
  -> server builds ExecutionDraft
  -> executeMeegleApply resolves user and Meegle token
  -> createWorkitemFromDraft calls Meegle create API
  -> created Meegle id becomes Meegle URL
  -> server writes Meegle link back to Lark Base
  -> server returns primary workitem and all workitems
```

### States

| State | Meaning |
| --- | --- |
| `record_loaded` | Lark record was fetched |
| `mapping_resolved` | Issue 类型 matched one or more Meegle mappings |
| `draft_built` | `ExecutionDraft` created |
| `apply_ready` | identity and Meegle token ready |
| `workitem_created` | Meegle created workitem |
| `writeback_done` | Lark record updated with Meegle link |
| `failed` | failure returned with workflow error code |

### Current risks

- `WorkitemMapping` supports config, but defaults and some fields remain hardcoded.
- `ExecutionDraft.fieldValuePairs` can contain direct Meegle field keys.
- `createWorkitemFromDraft` handles create-time field restriction by retrying after platform error.
- Lark writeback failure happens after Meegle creation, so partial success needs explicit diagnostic handling.

### Code rules

- New Lark field to Meegle field mapping should go through config or metadata resolver.
- `ExecutionDraft` should move toward semantic field keys before Meegle payload creation.
- When this workflow is refactored, workitem creation and Lark writeback should log the same `actionRunId` and idempotency key.
- Partial success must be visible: workitem created but Lark writeback failed is not the same as create failed.

## 9. Meegle Workitem Lifecycle

### Object

`MeegleWorkitem`

### Lifecycle

```text
ExecutionDraft
  -> fieldValuePairs converted to Meegle field_value_pairs
  -> Meegle createWorkitem
  -> adapter receives id or full object
  -> if id only, adapter fetches full workitem details
  -> workflow receives workitemId and fields
  -> later updateWorkitem/comment/detail operations use projectKey + workitemTypeKey + workitemId
```

### States

| State | Meaning |
| --- | --- |
| `drafted` | server has target project/type/template and fields |
| `creating` | create API request sent |
| `created_id_only` | platform returned only workitem id |
| `created_loaded` | full workitem details fetched |
| `updating` | field update API request sent |
| `updated` | platform accepted update |
| `rejected` | platform rejected field/auth/state |

### Current risks

- Meegle field writability is discovered at runtime.
- Same business field may map to different `field_key` across story/product bug/tech task.
- Some code paths read fields from flat object, others from nested `fields` / `field_value_pairs`.

### Code rules

- Workflows should not hardcode `field_*`.
- Adapter should normalize field access shape.
- Metadata resolver should validate create/update payload before platform request.

## 10. Meegle Story Back-Brief Lifecycle

### Objects

- `MeegleStoryBackBriefAction`
- `AcpKimiOneShotRuntime`
- Story semantic fields: `storySummary`, `techSummary`

### Lifecycle

```text
Meegle Story detail page
  -> server page config returns story-prd-to-simplified action
  -> extension dispatches backend_api executor with actionRunId and page context
  -> server validates request and resolves masterUserId
  -> server refreshes Meegle credential
  -> server fetches story workitem details
  -> workflow reads storySummary semantic field
  -> workflow acquires Story ACP concurrency slot
  -> ACP proxy creates one-shot Kimi runtime
  -> ACP runtime initialize -> session/new -> prompt
  -> workflow collects agent_message_chunk text
  -> ACP proxy closes runtime in finally
  -> workflow writes collected text to techSummary semantic field
  -> server returns result or structured error
```

### States

| State | Meaning |
| --- | --- |
| `action_visible` | page config matched Meegle Story detail page |
| `request_validated` | DTO accepted URL or project/type/id input |
| `identity_resolved` | master user has Meegle and Lark identities |
| `credential_ready` | Meegle credential refresh succeeded |
| `story_loaded` | Meegle Story details fetched |
| `summary_ready` | `storySummary` was found and non-empty |
| `acp_slot_acquired` | Story ACP concurrency limiter accepted the run |
| `acp_running` | one-shot ACP runtime is initialized and prompting |
| `acp_closed` | one-shot runtime closed after prompt or failure |
| `tech_summary_updated` | Meegle accepted `techSummary` overwrite |
| `failed` | workflow returned typed error and did not continue unsafe steps |

### Failure contract

| Error code | Stage | Must not do |
| --- | --- | --- |
| `ACP_CONCURRENCY_LIMITED` | `adapter.acp.queue` | start ACP or update Meegle |
| `ACP_ANALYSIS_TIMEOUT` | `adapter.acp.prompt` | update Meegle |
| `ACP_INITIALIZE_TIMEOUT` | `adapter.acp.initialize` | update Meegle |
| `ACP_PROCESS_EXITED` | `adapter.acp.process` | update Meegle |
| `ACP_EMPTY_RESULT` | `server.workflow.completed` | update Meegle |

### Code rules

- Story back-brief uses ACP one-shot, not reusable chat sessions.
- One-shot sessions must not be written to `KimiSessionRegistry` or `AcpKimiSessionOwnershipStore`.
- `chatOneShot()` may emit `session.created` and `done` for diagnostics, but the emitted session id is not resumable.
- Concurrency is server-owned and configured by `STORY_PRD_TO_SIMPLIFIED_ACP_CONCURRENCY_LIMIT` with default `3`.
- Prompt timeout is server-owned and configured by `STORY_PRD_TO_SIMPLIFIED_ACP_TIMEOUT_MS` with default `110000`.
- Only successful, non-empty ACP output can be written to `techSummary`.

## 11. Meegle Field Metadata Lifecycle

### Object

`MeegleFieldMetadata`

This is the missing object that should become a first-class lifecycle object.

### Desired lifecycle

```text
projectKey + workitemTypeKey
  -> resolver loads getFields(projectKey)
  -> resolver loads getWorkitemMeta(projectKey, workitemTypeKey)
  -> resolver builds semantic field map
  -> resolver records create/update writability and option values
  -> workflow asks resolver for semantic field
  -> resolver returns actual field_key or typed error
  -> adapter sends validated payload
```

### Desired states

| State | Meaning |
| --- | --- |
| `unknown` | metadata not loaded |
| `loaded` | raw platform metadata available |
| `resolved` | semantic field mapped to actual `field_key` |
| `validated_for_create` | field allowed in create payload |
| `validated_for_update` | field allowed in update payload |
| `stale` | platform metadata may have changed |
| `rejected` | field missing, not writable, option missing, or platform rule blocked |

### Current status

- Adapter already exposes metadata APIs.
- Workflow services do not centrally use metadata before create/update.
- Field IDs are still hardcoded in Lark push, Lark Base workflow, GitHub lookup/branch creation paths.

### Code rules

- Add metadata fixtures for production bug and story before changing field-heavy flows.
- Introduce semantic names such as `larkRecordLink`, `larkMessageLink`, `larkUpdateMessage`, `larkUpdateStatus`, `system`, `plannedVersion`, `plannedSprint`.
- Treat fallback hardcoded `field_*` as migration config, not business logic.

## 12. Meegle To Lark Push Lifecycle

### Object

`MeegleLarkPushAction`

### Lifecycle

```text
Meegle workitem detail page
  -> server page config returns update/push or bug-ticket action
  -> extension action triggers server endpoint
  -> server resolves masterUserId to Meegle user key
  -> server refreshes Meegle credential
  -> server fetches Meegle workitem details
  -> server extracts Lark record link / message link / update message / update status
  -> if already updated, stop
  -> update Lark Base status when record link exists
  -> send Lark message and reaction when message link exists
  -> update Meegle status field to updated
  -> return action result
```

### States

| State | Meaning |
| --- | --- |
| `action_visible` | page config matched Meegle workitem page |
| `credential_ready` | Meegle token ready |
| `workitem_loaded` | Meegle details fetched |
| `fields_extracted` | Lark link/message/status fields read |
| `already_updated` | Meegle status says no-op |
| `lark_updated` | Lark Base status changed |
| `message_sent` | Lark message posted |
| `reaction_added` | Lark reaction added |
| `meegle_status_updated` | Meegle status field written |
| `failed` | one step failed or required fields missing |

### Current risks

- Uses hardcoded Meegle field IDs for Lark links and update status.
- Missing fields return a plain workflow error string, not a typed platform/metadata error.
- Updating Lark and then failing Meegle status update creates partial success.

### Code rules

- Field extraction must use metadata resolver or centralized semantic mapping.
- Return flags should stay explicit: `larkBaseUpdated`, `messageSent`, `reactionAdded`, `meegleStatusUpdated`.
- When this workflow is refactored, partial success should include stage and actionRunId.

## 13. GitHub Workitem Action Lifecycle

### Objects

- GitHub PR URL context
- Meegle workitem lookup result
- GitHub branch preview/create request

### Lifecycle

```text
GitHub PR page or Meegle workitem page
  -> server page config returns GitHub action or Meegle branch action
  -> extension opens local modal/controller
  -> server resolves masterUserId and Meegle auth when Meegle data is needed
  -> server fetches Meegle workitem details or reverse-looks-up by PR
  -> server resolves Meegle fields such as system/version/sprint
  -> server maps system to GitHub repo
  -> server previews or creates branch
  -> extension shows result
```

### Current risks

- GitHub actions also hardcode Meegle field IDs for system/version/sprint.
- The action starts as `frontend` executor but depends on server-side Meegle/GitHub orchestration.
- Field metadata limitations are shared with Meegle workflows but not yet centralized.

### Code rules

- Treat GitHub actions as frontend modal plus server workflow, not extension business logic.
- Meegle field resolution should share the same metadata resolver as Lark workflows.

## 14. Action Run Trace Lifecycle

### Object

`ActionRunTrace`

This object is currently a rule-level requirement, not fully implemented.

### Desired lifecycle

```text
user clicks action
  -> extension creates actionRunId
  -> popup logs extension.action.clicked
  -> background logs background.action.dispatch
  -> server logs server.action.received
  -> identity/auth/workflow/adapter logs use same actionRunId
  -> platform error is normalized
  -> server response returns actionRunId and layer/module/stage/errorCode
  -> popup displays or exports diagnostic result
```

### Desired states

| State | Meaning |
| --- | --- |
| `started` | action clicked |
| `context_attached` | page and identity context attached |
| `server_received` | backend accepted request |
| `auth_checked` | required auth passed or failed |
| `workflow_running` | business workflow active |
| `adapter_request_sent` | platform request sent |
| `platform_response_received` | platform response received |
| `completed` | action succeeded |
| `failed` | action failed with normalized error |

### Code rules

- For new or refactored cross-layer actions, `actionRunId` should be generated once per user action.
- Every server workflow should accept/pass it, even if optional during migration.
- Error response should identify one responsibility layer, not only a generic message.

## 15. Recommended Fix Order

| Order | Object | Why |
| --- | --- | --- |
| 1 | `ActionRunTrace` | Without trace, later failures remain hard to locate |
| 2 | `AutomationActionConfig` executor | Makes server catalog the real action source |
| 3 | `ExtensionPageConfig` fallback and fixtures | Reduces extension/server page mapping drift |
| 4 | `MeegleFieldMetadata` resolver | Solves dynamic field IDs and writable rules |
| 5 | `ExecutionDraft` semantic fields | Removes field IDs from workflow layer |
| 6 | Live E2E auth smoke | Confirms real Lark/Meegle authorization path |

## 16. Review Checklist

When changing one of these objects:

1. Identify the owner layer before editing.
2. Confirm the object has a lifecycle state in this document.
3. Add or update tests at the same lifecycle boundary.
4. If adding or refactoring a cross-layer flow across extension/server/adapter/platform, include `actionRunId`.
5. If writing Meegle fields, resolve semantic field to `field_key` centrally.
6. If partial success is possible, return typed stage and result flags.
