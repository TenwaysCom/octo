---
status: draft
owner: TBD
last_reviewed: 2026-06-09
scope: Current Octo codebase issue map for server-extension behavior, E2E verification, and Meegle platform governance
update_required_when:
  - page/action config contract changes
  - extension E2E strategy changes
  - Meegle field metadata or workflow update strategy changes
  - AGENTS.md route and compatibility-route policy changes
---

# Octo Current Issue Map - 2026-06-09

本文档记录当前代码层面的主要问题，按修复优先级排序。目标不是一次性重构，而是先把系统行为、测试入口、平台规则和业务 mapping 变成可验证、可审查、可迁移的工程资产。

后续代码规范和分层规则见 `../rules/system-boundaries-and-code-rules.md`。本问题图负责记录“现在有什么问题”，规则文档负责约束“以后代码应该怎么写”。

## Priority Summary

| Priority | Problem | Why now | First target |
| --- | --- | --- | --- |
| P0 | 缺少 extension / server / platform 分层边界和诊断契约 | 测试失败后无法快速判断责任模块，修复容易变成跨层猜测 | 建立 action run trace、error layer、module boundary contract |
| P0 | Extension E2E 入口不可用，真实授权链路不可验证 | 没有可靠保护线时，后续统一 mapping 和行为容易误判 | 明确 `unit / mock integration / live e2e` 分层 |
| P0 | Server-driven page/action config 没有真正驱动 action 执行 | 当前仍需同时改 server 和 extension，行为源不唯一 | 让 popup 按 server `executor` 契约执行 |
| P1 | Meegle 平台字段规则不清，字段 ID 动态且限制多 | 数据更新失败多发生在运行时，缺少预检和字段元数据层 | 建 Meegle field metadata resolver |
| P1 | Page detection 和业务 mapping 多处重复 | 插件端、服务端、测试可能各自理解页面和动作 | 收敛共享 contract 和 fixture |
| P2 | legacy route 已移除，但仍需防止旧命名回流 | 旧 `/api/a1/*`、`/api/a2/*` 和 A1/A2 术语容易被误恢复 | 保持 AGENTS/docs/tests 对“已移除”一致 |
| P2 | 测试代码风格与项目规则不一致 | 增加维护成本，但不是当前功能阻断 | 后续清理测试导入和动态 import |

## P0-0. Missing Cross-Layer Boundary And Diagnostic Contract

### Problem

当前 extension、server、platform adapter 和真实平台之间缺少明确的分层边界与诊断契约。出现问题时，日志和错误不能稳定回答：

1. 是 extension 没采到页面上下文，还是 server page config 错了？
2. 是 popup 没按 action executor 调用，还是 server workflow 编排错了？
3. 是 adapter 请求格式错了，还是 Meegle/Lark 平台规则或权限限制？
4. 是授权缺失，还是字段不可写、状态不可迁移、动态字段 ID 不匹配？

### Evidence

- Extension popup 当前按本地 `actionKey` 分支执行 action，server 返回的 executor 没有成为真正执行契约。
- Server workflow、Meegle adapter、平台返回错误目前没有统一 `layer/module/stage/actionRunId` envelope。
- Meegle 字段限制主要通过运行时错误暴露，例如 `field [...] is illegal` 后再重试。
- Extension E2E 入口不可用，真实平台授权链路没有稳定 smoke test。

### Impact

- 测试失败后无法快速定位是 extension、server、adapter 还是 platform 的问题。
- 修复时容易跨层修改，导致业务规则继续散落。
- 平台限制和授权问题容易被包装成普通 workflow failed，排障成本高。

### Recommended Direction

建立统一分层诊断机制：

1. 新增或重构跨层 action 时生成 `actionRunId`，贯穿 extension、background、server、adapter。
2. 新增或重构跨层 action 的失败统一返回 error envelope：
   - `layer`: `extension | server | adapter | platform`
   - `module`
   - `stage`
   - `errorCode`
   - `errorMessage`
   - `actionRunId`
   - `rawStatusCode` / `rawResponseSummary`
3. 日志按阶段打点：
   - `extension.page.detect`
   - `extension.config.loaded`
   - `extension.action.clicked`
   - `server.action.received`
   - `server.identity.resolved`
   - `server.auth.checked`
   - `server.workflow.started`
   - `adapter.meegle.request`
   - `adapter.meegle.response`
   - `server.workflow.completed`
   - `extension.action.result`
4. AI/dev 排障时先看 `layer + stage + actionRunId`，再进入对应模块。

### Acceptance Criteria

- 任一 action 失败时，popup 或日志能显示责任层级和阶段。
- 新增或重构的 Server API error response 保留 `layer/module/stage/actionRunId`。
- Adapter 把平台错误规范化为 platform-layer error，而不是只返回普通 Error message。
- Live E2E smoke test 失败时能定位到 extension config、server auth、adapter request 或 platform response 中的某一层。

## P0-1. E2E Verification Is Not a Reliable Entry Point

### Problem

当前 `extension` 的 E2E 入口和测试文件类型不匹配：

- `extension/package.json` 中 `test:e2e` 指向 `playwright test`。
- `extension/tests/e2e/auth-bridge.test.ts` 使用 Vitest 的 `describe/it/expect`。
- `extension/vitest.config.ts` 明确只 include `src/**/*.test.ts`，并 exclude `tests/**`。

这导致插件端 `tests/**` 不会被普通 Vitest 跑到，而 Playwright 又无法正确发现 Vitest 风格的 E2E 文件。

### Evidence

- `extension/package.json`
  - `test:e2e`: `playwright test`
- `extension/vitest.config.ts`
  - `include: ["src/**/*.test.ts"]`
  - `exclude: ["tests/**"]`
- `extension/tests/e2e/auth-bridge.test.ts`
  - `import { describe, expect, it } from "vitest"`
- Local check on 2026-06-09:
  - `./node_modules/.bin/playwright test --list` under `extension/` failed with `TypeError: Cannot redefine property: Symbol($$jest-matchers-object)` and reported `No tests found`.
  - `./node_modules/.bin/vitest run tests/meegle-auth-handler.test.ts tests/protocol.test.ts --config vitest.config.ts` under `extension/` reported `No test files found`.

### Impact

- 现在没有一个明确命令能验证真实 extension popup/content/background/server 协作。
- `server/tests/e2e/lark-base-workflow.test.ts` 虽然可运行，但 mock 掉 Lark client、Meegle apply、Lark 回写，只能证明 workflow 组装逻辑，不证明真实平台授权和 API 成功。
- 后续改 page/action mapping 时，无法确认真实 Lark/Meegle 授权链路是否还能跑通。

### Recommended Direction

先把测试命名和入口拆清楚：

1. `unit`: `src/**/*.test.ts`，纯单元测试。
2. `mock integration`: 可放在 `tests/integration/**/*.test.ts`，仍用 Vitest，但明确所有平台 API mock。
3. `live e2e`: Playwright 专用，文件使用 `@playwright/test`，明确依赖真实浏览器、server、extension build/profile、Lark/Meegle/GitHub seed data 和授权状态。

### Acceptance Criteria

- `pnpm --dir extension test` 能跑所有应该跑的 Vitest 测试，或文档明确哪些不跑。
- `pnpm --dir extension test:e2e -- --list` 至少能列出 Playwright 测试，不再加载 Vitest 文件。
- 至少有一个 live e2e smoke case 能验证 extension 打开目标页面后读取 `/api/config/page` 并渲染对应 action。

## P0-2. Server-Driven Config Is Only Partially Implemented

### Problem

Server 已经返回 `ExtensionPageConfig` 和 `automationActions`，但 extension 执行动作时仍然主要依赖本地 hardcoded `actionKey` 分支。

Server action 定义中包含：

- `executor.type`
- `executor.operation`
- `executor.method`
- `executor.route`

但 popup 渲染时只保留按钮 `key/title/style`，执行时在 `runFeatureAction(actionKey)` 里按本地字符串分支处理。

### Evidence

- `server/src/modules/public-config/public-config.controller.ts`
  - `AutomationActionConfig` 定义 `frontend` 和 `backend_api` executor。
  - `BUG_TICKET_TO_SUPPORT_ACTION` 定义 route `/api/meegle/workitem/bug-ticket-to-support`。
- `extension/src/popup-shared/popup-controller.ts`
  - `toPopupFeatureAction()` 只转为 `key/label/type/disabled`。
  - `runFeatureAction()` 对 `analyze`、`bulk-create-meegle-tickets`、`update-lark-and-push`、`bug-ticket-to-support`、`lookup-github-pr`、`create-github-branch` 做本地分支。
  - `bug-ticket-to-support` 的 endpoint 又在 extension 里硬编码。

### Impact

- 新增 server action 仍然需要同步改 extension 分支，server config 不是唯一行为源。
- Server catalog 说支持某 action，不代表 popup 真能执行。
- `executor.operation` 当前更像展示字段，不是执行契约。

### Recommended Direction

把 action execution 抽成 extension 侧统一 dispatcher：

- `frontend` executor: 映射到少量本地能力，如 chat、bulk modal、GitHub modal。
- `backend_api` executor: 按 server 返回的 `method/route/operation` 调用统一 backend executor。
- 对需要页面上下文的 backend action，约定 context extractor，例如 Meegle workitem URL -> `{ projectKey, workItemTypeKey, workItemId }`。

### Acceptance Criteria

- 新增一个 backend action 时，只改 server config 和 server controller，不需要再在 popup controller 加 action 分支。
- Popup action tests 使用完整 `AutomationActionListItem.executor` 断言，而不是只断言 `key`。
- server `public-config.controller.test.ts` 和 extension popup tests 使用同一组 contract fixture 或 snapshot。

## P1-1. Meegle Field Metadata And Update Rules Are Not Governed

### Problem

Meegle 更新困难不是单纯 API 调用问题，而是平台规则和字段元数据缺少治理层：

1. 部分字段不能在创建阶段更新，当前只能运行时失败后剥字段重试。
2. Meegle 字段是动态 `field_key`，不同 workitem type 的字段 ID 不同。
3. 当前业务服务直接使用硬编码字段 ID，缺少按 `projectKey + workitemTypeKey` 解析字段名/别名到 `field_key` 的公共能力。

### Evidence

- `server/src/application/services/meegle-workitem.service.ts`
  - `extractIllegalField()` 解析平台错误 `field [...] is illegal`。
  - `createWorkitemFromDraft()` 失败后把非法字段从 create payload 移除，再 post-create update。
- `server/src/application/services/meegle-lark-push.service.ts`
  - 硬编码 `FIELD_LARK_RECORD_LINK = "field_e8ad0a"`。
  - 硬编码 `FIELD_LARK_UPDATE_MESSAGE = "field_c22a1a"`。
  - 硬编码 `FIELD_LARK_MESSAGE_LINK = "field_8d0341"`。
  - 硬编码 `FIELD_LARK_UPDATE_STATUS = "field_c64c12"`。
- `server/src/modules/lark-base/lark-base-workflow.service.ts`
  - 硬编码 Lark link custom fields: `field_e8ad0a`、`field_8d0341`。
- `server/src/adapters/meegle/meegle-client.ts`
  - 已有 `getWorkitemMeta(projectKey, workitemType)`。
  - 已有 `getFields(projectKey)`。
  - 但当前业务流程没有统一使用这些 API 做字段解析、可写性校验或缓存。

### Impact

- 每增加一种 workitem type 或字段，都需要人工从平台查动态 ID 并改代码/配置。
- 平台字段限制变化时，只有运行时失败才会发现。
- 同名业务字段在 story、production_bug、tech_task 中可能对应不同 `field_key`，当前容易误写或漏写。
- 错误信息无法清楚区分“字段不存在”“字段不可创建时写入”“字段不可更新”“权限不足”“状态限制不可更新”。

### Recommended Direction

建立 Meegle metadata resolver，作为所有 Meegle create/update 的前置层：

1. 拉取并缓存 `getFields(projectKey)` 和 `getWorkitemMeta(projectKey, workitemTypeKey)`。
2. 支持用业务名、字段别名或 stable semantic key 解析到实际 `field_key`。
3. 记录字段能力：create writable、update writable、required、field type、option values、workitem type scope。
4. create/update 前先做 payload validation，能提前给出可读错误。
5. 对平台限制错误保留原始响应，并归类为明确 error code。

### Acceptance Criteria

- Meegle 写入流程不直接散落硬编码 `field_*`，至少通过 central mapping/resolver 获取。
- 对 production_bug 和 story 分别有 metadata fixture，覆盖同一业务字段不同 `field_key` 的情况。
- `createWorkitemFromDraft()` 不再主要依赖失败后剥字段重试；重试只作为兼容兜底。
- `bug-ticket-to-support` 对缺字段、字段不可写、权限不足能返回不同错误。

## P1-2. Page Detection And Business Mapping Are Duplicated

### Problem

同一类页面和业务动作在 server、extension、tests 中各自判断：

- Server 判断 Lark/Meegle/GitHub host 和 page type。
- Extension `platform-url.ts` 判断 platform。
- Extension `lark-base-url.ts` 提取 Base/Table/View/Record。
- Content scripts 在 fetch page config 失败时 fallback 到本地 platform。
- Tests 里重复写固定 Base/View ID、Production Bug key 和 action 列表。

### Evidence

- `server/src/modules/public-config/public-config.controller.ts`
  - `isMeegleHost()`、`isLarkHost()`、`isGitHubHost()`。
  - `TARGET_LARK_BASE_ID`、`TARGET_LARK_TABLE_ID`、`TARGET_LARK_VIEW_ID`。
  - `PRODUCTION_BUG_TYPE_API_NAME`、`PRODUCTION_BUG_TYPE_KEY`。
- `extension/src/platform-url.ts`
  - 另一套 `isMeegleHost()`、`isLarkHost()`、`isGitHubHost()`。
- `extension/src/lark-base-url.ts`
  - 独立提取 Lark Base context。
- `extension/src/content-scripts/shared/page-config.ts`
  - server page config 失败后 fallback，并默认对非 unsupported platform 启用 sidebar。

### Impact

- Server 认为 unsupported 的页面，extension fallback 可能仍注入 sidebar。
- Page/action 规则变更需要同时更新多处代码和测试。
- 页面 URL、workitem type、action list 的行为可能在 popup、content script、server catalog 之间漂移。

### Recommended Direction

定义一个 page rule contract：

- Server 是 page/action 规则唯一来源。
- Extension 允许有最小 fallback，但 fallback 必须保守：server 不可达时只保留基础 UI 或提示，不应默认启用完整页面注入。
- 把常用 URL 样例沉淀成 shared fixture，server 和 extension 测试共同使用。

### Acceptance Criteria

- 相同 URL 在 server page-config test 和 extension popup/content tests 中得到一致 platform/pageType/action。
- Server 不可达时 extension fallback 策略明确且可测试。
- 新增页面规则只需要改一个规则源和共享 fixture。

## P2-1. Legacy Route Policy Is Now Removed

### Problem

旧 `/api/a1/*`、`/api/a2/*` compatibility aliases 已确认移除。后续风险不是“是否保留”，而是旧命名在文档、测试、action 或 message naming 中回流。

### Evidence

- `server/src/http/lark-meegle-workflow-routes.ts`
  - 注释为 `Legacy A1/A2 routes removed; use /api/lark-base/create-meegle-workitem instead.`
- `server/src/index.test.ts`
  - 测试名为 `does not register legacy A1/A2 routes`。
  - 同时断言 `/api/a1/*`、`/api/a2/*`、`/api/lark-bug/*`、`/api/lark-user-story/*` 都不存在。
- `AGENTS.md` 已更新为旧 `/api/a1/*`、`/api/a2/*` routes have been removed。

### Impact

- 后续新增功能如果参考旧文档或旧测试名，可能误恢复 legacy route。
- 旧 A1/A2/B1/B2 术语可能继续污染新 action 或 message naming。
- PR review 需要明确阻止旧 route 回流。

### Recommended Direction

维持 removal policy：

1. 不恢复 `/api/a1/*`、`/api/a2/*`。
2. 新 route 使用当前业务名或具体 workflow route。
3. 旧 A1/A2/B1/B2 只允许出现在历史记录、迁移说明或删除测试中，不作为新协议命名。

### Acceptance Criteria

- AGENTS、docs、`index.test.ts`、runtime route 注册对 legacy routes 的说法一致：已移除。
- 新增 route/action/message 不使用 A1/A2/B1/B2。
- 如果未来必须恢复兼容 alias，需要单独 compatibility plan 和测试。

## P2-2. Test Style And Project Rules Are Not Fully Aligned

### Problem

当前项目规则要求 Vitest globals 可直接使用，并提醒不要在 tests 中引入动态 `await import()` 模式。但现有测试里仍有显式 Vitest import 和动态 import。

### Evidence

- `extension/tests/e2e/auth-bridge.test.ts`
  - `import { describe, expect, it } from "vitest"`。
- `server/tests/acp-kimi-session-history.service.test.ts`
  - 多处动态 `await import(...)`。
- `server/tests/acp-kimi.controller.test.ts`
  - 多处动态 `await import(...)`。

### Impact

- 不是当前最高风险，但会让测试风格和项目规则继续分叉。
- 动态 import 可能隐藏初始化顺序问题，也让测试重构成本变高。

### Recommended Direction

暂不作为 P0 修复。等 E2E 分层和 route/action contract 稳定后，批量清理测试风格。

### Acceptance Criteria

- 新增测试遵守项目规则。
- 旧测试按模块逐步清理，不和功能修复混在同一个大 PR。

## Suggested Rollout

### Step 1: Fix Verification Names And Entrypoints

目标：先知道什么测试在保护什么。

交付：

- 调整 extension Vitest include/exclude 或迁移 `extension/tests/*.test.ts`。
- Playwright E2E 文件改为 `@playwright/test` 风格。
- 文档列出 live e2e 所需授权和 seed data。

验证：

- `pnpm --dir extension test`
- `pnpm --dir extension test:e2e -- --list`
- `pnpm --dir server test`

### Step 2: Make Server Action Executor Real

目标：让 server page config 成为 action 行为源。

交付：

- Extension action dispatcher 支持 `frontend` 和 `backend_api` executor。
- `bug-ticket-to-support` 不再在 popup controller 中硬编码 route。
- Server/extension 共享 action fixture 或 contract test。

验证：

- server public-config tests。
- extension popup controller tests。
- 一个 mock integration 覆盖 backend executor。

### Step 3: Add Meegle Metadata Resolver

目标：把 Meegle 字段动态 ID 和字段限制显式化。

交付：

- `projectKey + workitemTypeKey` 维度的 field/meta resolver。
- 字段名/业务语义到 `field_key` 的解析。
- create/update 前 payload validation。
- 平台限制错误分类。

验证：

- story 和 production_bug metadata fixtures。
- create/update illegal field tests。
- `bug-ticket-to-support` 缺字段和不可写字段 tests。

### Step 4: Keep Legacy Route Removal Aligned

目标：让 AGENTS、docs、tests、runtime route 注册持续保持“legacy route 已移除”一致。

交付：

- 不新增 `/api/a1/*`、`/api/a2/*`。
- 不新增 A1/A2/B1/B2 action/message 命名。
- 发现旧命名时按迁移或删除处理。

验证：

- `server/src/index.test.ts`
- route catalog review。
