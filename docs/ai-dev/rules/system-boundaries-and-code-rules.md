---
status: draft
owner: TBD
last_reviewed: 2026-06-18
scope: Coding rules for Octo extension/server/platform boundaries, action execution, diagnostics, Meegle metadata, and tests
update_required_when:
  - action executor contract changes
  - extension/server responsibilities change
  - Meegle field metadata strategy changes
  - test entrypoints or live E2E strategy changes
---

# System Boundaries And Code Rules

本文档把当前 Octo 的系统规则写成后续代码规范。目标不是一次性重构所有历史代码，而是先建立新增和修改代码必须遵守的边界。

本文件只约束跨层边界。端内代码规范见：

- `extension-code-rules.md`
- `server-code-rules.md`

## 1. Core Rules

1. Server 是业务动作和 workflow 的权威来源。
2. Extension 是薄客户端，只负责页面上下文、授权触发、UI 和动作派发。
3. Platform adapter 只负责外部 API 的技术封装和平台错误归一化。
4. Meegle/Lark 的动态字段、权限、状态限制必须进入 metadata 或 adapter 层，不能散落在 workflow 和 popup 中。
5. 新增或重构跨层 action 时，必须可以用 `actionRunId` 串起 extension、server、adapter 和 platform 日志。
6. 测试必须明确是 unit、mock integration 还是 live e2e，不能用 mock integration 冒充真实授权 E2E。

## 2. Layer Boundary Rules

### Extension

Extension 可以做：

- 判断当前浏览器页面的基础 platform。
- 采集当前 URL、record id、workitem id、selected rows 等页面上下文。
- 渲染 server 返回的 sidebar/popup/action。
- 触发 Lark/Meegle 授权桥接。
- 把用户点击的 action 和页面上下文发给 server。
- 显示 server 返回的成功、失败、授权缺失或平台限制信息。

Extension 不应做：

- 编排跨 Lark/Meegle/GitHub 的业务 workflow。
- 在 popup 中硬编码 backend route 作为业务动作来源。
- 在 workflow 逻辑中硬编码 Meegle `field_*`。
- 自己决定复杂业务 mapping，例如 Lark Bug 到 Meegle Product Bug 的完整字段映射。
- server config 不可达时默认启用完整业务注入。

### Server

Server 可以做：

- 定义 `/api/config/page` 的 page/action catalog。
- 处理 action executor 请求。
- 解析 identity、权限和授权状态。
- 编排 Lark/Meegle/GitHub workflow。
- 持久化 token、mapping、任务状态和诊断信息。
- 统一返回 `{ ok, data, error }` 风格响应。

Server 不应做：

- 依赖 extension 内部 UI 状态才能完成业务判断。
- 在多个 workflow service 中重复写同一套 page/action mapping。
- 把平台原始错误吞掉，只返回普通 `Error.message`。
- 绕过 adapter 直接拼第三方 API 请求。

### Platform Adapter

Adapter 可以做：

- 封装 Lark/Meegle/GitHub API 请求。
- 处理 token、header、分页、重试和平台响应格式。
- 将平台错误转换为稳定 error code。
- 保留 `rawStatusCode` 和安全截断后的 `rawResponseSummary`。

Adapter 不应做：

- 决定 PM 业务 workflow 的下一步。
- 决定 popup 展示。
- 直接引用 extension 类型。
- 把平台字段动态解析结果散落返回给上层，让每个 workflow 自己猜。

## 3. Action Config And Executor Contract

`/api/config/page` 应是页面动作的唯一 catalog。新增 backend action 时，默认只需要改 server config、server controller/service 和对应测试。

Action config 至少要表达：

| Field | Meaning |
| --- | --- |
| `key` | 稳定 action key |
| `title` | UI 展示文案 |
| `style` | UI 类型，如 primary/secondary |
| `executor.type` | `frontend` 或 `backend_api` |
| `executor.operation` | 业务操作名，用于日志和诊断 |
| `executor.method` | backend API method |
| `executor.route` | backend API route |
| `placements` | 允许展示 action 的 surface，例如 `popup`、`sidebar`、`page_dom` |
| `requiredContext` | 需要的页面上下文字段 |
| `authRequired` | 是否需要 Lark/Meegle 授权 |

Extension popup 的执行规则：

1. 渲染按钮时保留完整 executor，不只保留 `key/title/style`。
2. 渲染 popup/sidebar/page DOM 前必须检查 action-level `placements`，不能只依赖本地 DOM 探测或 page-level sidebar 开关。
3. `frontend` executor 只映射到少量本地能力，例如打开 modal、启动 chat、触发授权。
4. `backend_api` executor 统一走 backend dispatcher，按 server 返回的 `method/route/operation` 调用。
5. 新增或重构 backend dispatcher 时，负责附带 `actionRunId`、页面 context、extension version 和 active account context。
6. popup 不为每个 backend action 增加新的硬编码分支。

例外必须写清楚原因：如果某 action 必须在 extension 本地完成，应使用 `frontend` executor，并在 server catalog 中明确 operation。

## 4. Error And Logging Rules

跨层 action 失败时，error envelope 应包含：

```ts
type OctoActionError = {
  layer: "extension" | "server" | "adapter" | "platform";
  module: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
  actionRunId: string;
  rawStatusCode?: number;
  rawResponseSummary?: string;
};
```

推荐阶段名：

| Stage | Owner |
| --- | --- |
| `extension.page.detect` | content script / popup |
| `extension.config.loaded` | popup/background |
| `extension.action.clicked` | popup |
| `background.action.dispatch` | extension background |
| `server.action.received` | server controller |
| `server.identity.resolved` | identity service |
| `server.auth.checked` | auth service |
| `server.workflow.started` | application service |
| `adapter.meegle.request` | Meegle adapter |
| `adapter.meegle.response` | Meegle adapter |
| `adapter.acp.queue` | ACP-backed workflow limiter |
| `adapter.acp.initialize` | ACP adapter runtime startup |
| `adapter.acp.prompt` | ACP adapter prompt execution |
| `adapter.acp.process` | ACP adapter subprocess lifecycle |
| `adapter.lark.request` | Lark adapter |
| `adapter.lark.response` | Lark adapter |
| `server.workflow.completed` | application service |
| `extension.action.result` | popup/background |

Logging rules：

- Server 使用本地 `logger.ts`，不使用 `console.log`。
- Extension 使用 `extension/src/logger.ts`。
- 新增或重构跨层 action 的日志必须带 `actionRunId`、`operation`、`layer`、`stage`。
- 平台响应只能记录安全摘要，不记录 raw token、cookie 或完整敏感 payload。
- Platform auth failure、field not writable、field missing、state transition blocked 必须有不同 error code。

## 5. Meegle Metadata Rules

Meegle 的字段不是稳定代码常量，不能把 `field_*` 当成业务字段名散落使用。

新增或修改 Meegle 写入逻辑时遵守：

1. Workflow 使用 semantic field key，例如 `larkRecordLink`、`larkMessageLink`、`updateStatus`。
2. metadata resolver 负责把 semantic field key 解析为实际 `field_key`。
3. resolver 输入至少包含 `projectKey` 和 `workitemTypeKey`。
4. resolver 记录字段类型、option values、required、create writable、update writable。
5. create/update 前先做 payload validation。
6. 平台失败后的剥字段重试只能作为兼容兜底，不能作为主要字段治理策略。

推荐 error code：

| Error code | Meaning |
| --- | --- |
| `MEEGLE_FIELD_NOT_FOUND` | 当前 workitem type 找不到 semantic field |
| `MEEGLE_FIELD_NOT_WRITABLE_CREATE` | 字段不能在 create 阶段写入 |
| `MEEGLE_FIELD_NOT_WRITABLE_UPDATE` | 字段不能在 update 阶段写入 |
| `MEEGLE_OPTION_NOT_FOUND` | 枚举或状态选项不存在 |
| `MEEGLE_STATE_TRANSITION_BLOCKED` | 当前状态不允许目标变更 |
| `MEEGLE_AUTH_REQUIRED` | 缺少或过期 Meegle 授权 |
| `MEEGLE_PLATFORM_REJECTED` | 平台拒绝但暂未归类 |

当前已纳入 fallback config 的 Story 语义字段：

| Semantic key | Meaning |
| --- | --- |
| `storySummary` | Meegle Story 研发Review输入 |
| `techSummary` | Meegle Story 研发Review覆盖写回 |

Meegle Story 研发Review workflow 还应遵守：

1. Extension 只触发 server-owned backend action and displays returned status.
2. Server workflow reads `storySummary`, runs ACP analysis, then overwrites `techSummary`.
3. ACP execution is one-shot: create runtime, run one prompt, close runtime.
4. One-shot ACP sessions are not reusable chat sessions and must not be written to reusable session ownership state.
5. Concurrency and timeout failures return typed server responses and must happen before Meegle writeback.
6. Prompt template lives in PostgreSQL `workflow_prompts` under key `meegle.story.prd_to_simplified`, with `note` describing the prompt owner/usage.

允许硬编码 `field_*` 的位置：

- metadata fixture。
- metadata resolver 的 fallback config。
- 明确标注为临时迁移兼容层的 adapter/config 文件。

不允许硬编码 `field_*` 的位置：

- popup/controller。
- application workflow service。
- page/action config。
- E2E 测试的业务断言。

## 6. Page And Mapping Rules

Page/action 规则必须收敛到 server catalog：

1. Server 判断目标 URL 对应的 platform、pageType、matchedRuleId 和 actions。
2. Server action config 决定 action 可以出现在哪些 `placements`。
3. Extension content script 只能按 server 返回的 `placements` 注入 sidebar 或 page DOM 按钮。
2. Extension 可以保留基础 platform detection，但只能用于加载 server config 和展示保守 fallback。
3. Server 不可达时，extension 不应默认启用完整业务 sidebar/action。
4. URL 样例、pageType、expected actions 应沉淀为 contract fixture。
5. Server page-config tests 和 extension popup/content tests 应使用同一组 fixture 或保持同名 snapshot。

新增 page rule 时至少覆盖：

- 支持的 host。
- pageType。
- required context。
- matchedRuleId。
- actions。
- server 不可达时的 fallback 行为。

## 7. Testing Rules

测试分三层命名：

| Layer | Tool | Purpose |
| --- | --- | --- |
| Unit | Vitest | 单模块逻辑、DTO、mapper、dispatcher、resolver |
| Mock integration | Vitest | 多服务编排，但 Lark/Meegle/GitHub 全 mock |
| Live E2E | Playwright | 真实 browser extension、server、目标页面、授权和 seed data |

规则：

- `pnpm --dir extension test` 应只跑 Vitest 入口能发现的测试。
- `pnpm --dir extension test:e2e` 应只加载 Playwright 风格测试，使用 `@playwright/test`。
- mock integration 文件名或目录必须明确包含 `integration` 或 `mock`，不要命名成 live e2e。
- live e2e 必须声明依赖：server URL、extension build/profile、Lark/Meegle 授权状态、seed data。
- 新测试遵守项目规则：Vitest globals 已启用，不主动 import `describe/it/expect`；不要引入动态 `await import()` 测试模式。

Live E2E smoke 最小覆盖：

1. 打开目标 Lark 或 Meegle 页面。
2. Extension 获取 `/api/config/page`。
3. Popup/sidebar 渲染 matched action。
4. 新增或重构 action 后能产生 `actionRunId`。
5. 失败时能定位到 extension、server、adapter 或 platform 某一层。

## 8. Route And Terminology Rules

公开 route 命名使用当前外部名称，例如 `lark-bug`、`lark-user-story`、`meegle-product-bug`、`meegle-user-story`。

legacy route 只允许两种状态：

1. 明确保留 compatibility alias，并有 server route、docs 和 tests 一致证明。
2. 明确删除，并有 migration note、docs 和 tests 一致证明。

不允许出现：

- `AGENTS.md` 说保留，但 server/tests 说删除。
- docs 说新 route，extension 仍硬编码旧 route。
- route 别名只存在于测试或注释中。

修改 route 时必须同步：

- server route registration。
- server route tests。
- extension API caller。
- `AGENTS.md` 或 `docs/ai-dev` 中的兼容说明。

## 9. PR Review Checklist

提交涉及 extension/server/platform 边界的 PR 时，至少检查：

1. 这次业务逻辑是否放在 server，而不是 extension？
2. 新 action 是否由 server catalog 驱动？
3. popup 是否按 executor contract 执行？
4. 新增或重构跨层 action 的失败响应是否包含 `layer/module/stage/errorCode/actionRunId`？
5. Meegle 字段是否通过 metadata resolver 或集中 mapping？
6. 测试是否区分 unit、mock integration、live e2e？
7. route 和 terminology 是否与 docs/tests/AGENTS 一致？
8. 是否没有新增 `console.log`？
