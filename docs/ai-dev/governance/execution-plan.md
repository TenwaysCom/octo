---
status: draft
owner: TBD
last_reviewed: 2026-06-09
scope: Execution plan for Octo AI-dev governance, system boundary cleanup, test repair, and platform metadata hardening
update_required_when:
  - P0/P1/P2 priority changes
  - action executor or error envelope implementation starts
  - Meegle metadata resolver implementation starts
  - live E2E strategy changes
---

# Octo AI Dev Governance Execution Plan

本文档是后续执行计划。问题清单见 `current-issue-map-2026-06-09.md`，系统对象生命周期见 `../lifecycle/current-system-technical-objects.md`，代码规则见 `../rules/system-boundaries-and-code-rules.md`。

目标不是一次性重写，而是按风险顺序建立保护线：

1. 先让失败能定位到 `extension | server | adapter | platform`。
2. 再让 server action catalog 成为真实执行来源。
3. 再处理 Meegle 动态字段和平台规则。
4. 最后补齐 live E2E 和兼容策略。

## 1. Success Criteria

完成本计划后，系统应达到：

| Area | Success criteria |
| --- | --- |
| Boundary | 新增 action 能明确 owner layer，不需要跨层猜测 |
| Diagnostics | 任一 action 失败能看到 `actionRunId + layer + module + stage + errorCode` |
| Action execution | backend action 由 server `executor` 驱动，popup 不再为每个 backend route 加硬编码分支 |
| Page mapping | server/extension 对同一 URL 的 platform/pageType/action 预期一致 |
| Meegle fields | Meegle 写入先走 metadata/semantic mapping，不再依赖运行时报错剥字段作为主路径 |
| Tests | unit、mock integration、live e2e 命名和入口清楚 |
| Docs | lifecycle/rules/tests/runtime 文档能支持后续 AI/dev 改动前判断风险 |

## 2. Phase Plan

### Phase 0: Lock The Governance Baseline

目标：让后续所有代码改动有统一上下文。

Scope:

- `docs/ai-dev/README.md`
- `docs/ai-dev/governance/current-issue-map-2026-06-09.md`
- `docs/ai-dev/lifecycle/current-system-technical-objects.md`
- `docs/ai-dev/rules/system-boundaries-and-code-rules.md`
- `docs/ai-dev/governance/execution-plan.md`

Tasks:

1. 保持 README 是入口，所有任务类型能路由到规则或 lifecycle。
2. 当前问题图只记录现状问题和优先级。
3. rules 文档只记录后续代码规范。
4. lifecycle 文档记录技术对象和分层 owner。

Verify:

- 文档之间互相引用清楚。
- 新任务能从 README 找到该读的规则。
- 不在 `AGENTS.md` 塞大段细节。

Exit criteria:

- ai-dev 文档可以回答“先改哪里、为什么、怎么验收”。

### Phase 1: Add Action Run Trace And Error Envelope

目标：先解决失败无法定位的问题。

Primary objects:

- `ActionRunTrace`
- `OctoActionError`
- workflow request/result

Scope:

- Extension action dispatcher / background request path
- Server controllers and workflow entrypoints
- Adapter error normalization
- Popup error display/log export

Tasks:

1. 定义共享 `actionRunId` 生成和传递规则。
2. 定义 server error envelope 类型。
3. 为关键 action 加阶段日志：
   - `extension.action.clicked`
   - `background.action.dispatch`
   - `server.action.received`
   - `server.identity.resolved`
   - `server.auth.checked`
   - `server.workflow.started`
   - `adapter.*.request`
   - `adapter.*.response`
   - `server.workflow.completed`
   - `extension.action.result`
4. 先覆盖一个最小 backend action，例如 `update-lark-and-push`。
5. 加单元测试证明 error envelope 保留 `layer/module/stage/actionRunId`。

Verify:

- `pnpm --dir server test` for touched server modules.
- `pnpm --dir extension test` for touched extension dispatcher/popup modules.
- 手动或 mock action 失败时能看到责任层级。

Exit criteria:

- 至少一个 backend action 的失败能定位到 extension/server/adapter/platform 中的一层。

### Phase 2: Make Server Action Executor Real

目标：让 server `automationActions.executor` 成为真实执行契约。

Primary objects:

- `ExtensionPageConfig`
- `AutomationActionConfig`
- popup action dispatcher

Scope:

- `server/src/modules/public-config/public-config.controller.ts`
- `extension/src/types/automation-actions.ts`
- `extension/src/popup-shared/popup-controller.ts`
- `extension/src/popup/runtime.ts`
- related tests

Tasks:

1. 对齐 server 和 extension 的 `AutomationActionExecutor` 类型。
2. popup state 保留完整 executor，而不是只保留 `key/title/style`。
3. 新增 backend executor dispatcher：
   - 读取 `method/route/operation`
   - 附带 `actionRunId`
   - 附带 page context 和 `masterUserId`
4. 保留少量 `frontend` executor 分支，例如 chat、bulk modal、GitHub modal。
5. 移除 backend action 的 popup route 硬编码路径。

Verify:

- Server page config tests 断言 backend executor route/operation。
- Extension popup tests 断言 action 使用 executor dispatch。
- 新增 backend action 不需要新增 popup hardcoded branch。

Exit criteria:

- `bug-ticket-to-support` 和 `update-lark-and-push` 都能通过 server executor 驱动。

### Phase 3: Repair Test Boundaries

目标：把 unit、mock integration、live e2e 分清楚，避免误判。

Primary objects:

- Extension Vitest tests
- Extension Playwright E2E tests
- Server mock integration tests

Scope:

- `extension/vitest.config.ts`
- `extension/tests/**`
- `extension/package.json`
- `server/tests/**`
- `docs/ai-dev/tests/golden-test-matrix.md`

Tasks:

1. 明确 `extension/src/**/*.test.ts` 是 unit test。
2. 决定 `extension/tests/**` 是迁入 Vitest、改成 Playwright，还是重命名为 mock integration。
3. 让 `pnpm --dir extension test:e2e -- --list` 能列出 Playwright tests。
4. 建立 `docs/ai-dev/tests/golden-test-matrix.md`。
5. 标明哪些测试需要真实 Lark/Meegle 授权和 seed data。

Verify:

- `pnpm --dir extension test`
- `pnpm --dir extension test:e2e -- --list`
- `pnpm --dir server test`

Exit criteria:

- 测试失败能判断是 unit、mock integration 还是 live e2e，而不是入口本身坏了。

### Phase 4: Introduce Meegle Metadata Resolver

目标：解决 Meegle 动态字段和字段写入限制。

Primary objects:

- `MeegleFieldMetadata`
- semantic field mapping
- Meegle create/update validation

Scope:

- `server/src/adapters/meegle/meegle-client.ts`
- new server metadata resolver module
- `server/src/application/services/meegle-workitem.service.ts`
- `server/src/application/services/meegle-lark-push.service.ts`
- `server/src/modules/lark-base/lark-base-workflow.service.ts`
- fixtures/tests

Tasks:

1. 定义 semantic field keys：
   - `larkRecordLink`
   - `larkMessageLink`
   - `larkUpdateMessage`
   - `larkUpdateStatus`
   - `system`
   - `plannedVersion`
   - `plannedSprint`
2. 建立 metadata fixture，至少覆盖 story 和 production_bug。
3. resolver 支持 `projectKey + workitemTypeKey + semanticFieldKey -> field_key`。
4. resolver 记录 create/update writable、required、field type、option values。
5. create/update 前做 payload validation。
6. 将 hardcoded `field_*` 收敛到 resolver fallback config 或 fixture。

Verify:

- Resolver unit tests cover same semantic field mapping to different `field_key` by workitem type.
- Meegle create/update tests distinguish field missing、create not writable、update not writable、option missing。
- Existing Lark Base and push tests continue passing.

Exit criteria:

- 新增 Meegle 字段写入不需要直接改 workflow service 的 `field_*`。

### Phase 5: Align Page Mapping And Route Policy

目标：减少 page/action mapping 和 route 兼容策略漂移。

Primary objects:

- page rule fixture
- route compatibility policy

Scope:

- server page config tests
- extension platform/page tests
- `AGENTS.md`
- `docs/ai-dev/governance/current-issue-map-2026-06-09.md`
- route registration/tests

Tasks:

1. 建立 URL fixture，覆盖 Lark Base、Meegle workitem、Meegle production bug、GitHub PR、unsupported。
2. Server 和 extension 测试使用同组 fixture 或同名 snapshot。
3. 明确 legacy `/api/a1/*`、`/api/a2/*` 是保留还是删除。
4. 同步 `AGENTS.md`、docs、server route tests 的说法。

Verify:

- Server page config tests pass.
- Extension page/popup tests pass.
- Route policy 在 docs/tests/AGENTS 中一致。

Exit criteria:

- 同一 URL 在 server 和 extension 预期一致。
- legacy route 状态没有文档和代码冲突。

### Phase 6: Add Live E2E Smoke

目标：验证真实 extension + server + Lark/Meegle 授权链路。

Primary objects:

- Playwright extension profile
- Lark/Meegle seed data
- auth state documentation

Scope:

- `extension/tests/e2e/**`
- `docs/ai-dev/runtime/platform-auth-and-seed-data.md`
- `docs/ai-dev/tests/golden-test-matrix.md`

Tasks:

1. 记录 live E2E 前置条件：
   - server URL
   - extension build/profile
   - Lark account
   - Meegle account
   - seed Lark Base record
   - seed Meegle workitem
2. 建立 smoke case：
   - 打开目标页面
   - extension 读取 `/api/config/page`
   - 渲染 action
   - 点击 action
   - 产生 `actionRunId`
   - 失败时展示 layer/stage
3. 默认不在 CI 强制跑 live E2E，除非授权和 seed data 可控。

Verify:

- `pnpm --dir extension test:e2e -- --list`
- 手动授权环境下跑 smoke case。

Exit criteria:

- 至少一个 live smoke 能证明真实页面配置和授权链路可达。

## 3. Recommended Work Order

| Order | Phase | Why |
| --- | --- | --- |
| 1 | Phase 1: Action run trace | 后续所有修复都依赖可定位失败层 |
| 2 | Phase 2: Server executor | 先消除 action 行为源不一致 |
| 3 | Phase 3: Test boundaries | 让修改有可靠验证入口 |
| 4 | Phase 4: Meegle metadata resolver | 解决平台字段动态 ID 和写入限制 |
| 5 | Phase 5: Page mapping and route policy | 收敛重复 mapping 和兼容歧义 |
| 6 | Phase 6: Live E2E smoke | 最后验证真实平台链路 |

## 4. First Implementation Slice

建议第一刀只做一个 action 的最小闭环：

Target action:

- `update-lark-and-push`

Change slice:

1. Extension 点击 action 时生成 `actionRunId`。
2. Popup/backend dispatcher 把 `actionRunId` 传给 server。
3. Server controller/workflow 日志带 `actionRunId`。
4. Meegle adapter error 转成带 `layer/module/stage/errorCode` 的 envelope。
5. Popup 展示或日志导出能看到该 envelope。

Verification:

- Server unit tests for envelope.
- Extension unit tests for dispatcher payload.
- Existing `update-lark-and-push` related tests continue passing.

Exit criteria:

- 人为制造 auth missing 或 Meegle field missing 时，可以明确看到失败来自 `server.auth.checked` 或 `platform/adapter.meegle.response`。

## 5. Stop Conditions

遇到以下情况应先停下来补文档或测试，不继续扩大改动：

1. 需要真实平台授权，但没有 seed data 或账号说明。
2. 一个改动同时碰 extension、server、adapter、platform metadata，但没有 `actionRunId`。
3. 新增 Meegle 字段写入必须手查 `field_*`，但没有 metadata fixture。
4. route 兼容策略与 `AGENTS.md`、server tests 冲突。
5. 测试失败无法判断是入口坏、mock 假设错，还是真实平台失败。
