---
status: draft
owner: TBD
last_reviewed: 2026-06-09
scope: Coding rules for Octo browser extension entrypoints, popup, background, content scripts, action dispatch, auth triggers, logging, and tests
update_required_when:
  - extension action dispatcher changes
  - popup/sidebar architecture changes
  - content script platform probes change
  - extension auth trigger behavior changes
  - extension test entrypoints change
---

# Extension Code Rules

本文档约束 extension 端代码应该是什么样子。跨层边界见 `system-boundaries-and-code-rules.md`，技术对象 lifecycle 见 `../lifecycle/current-system-technical-objects.md`。

## 1. Core Positioning

Extension 是薄客户端。它的职责是：

1. 识别当前页面。
2. 采集页面上下文。
3. 渲染 popup/sidebar UI。
4. 触发 Lark/Meegle 授权。
5. 把用户 action 和上下文交给 server。
6. 展示 server 返回的结果和诊断信息。

Extension 不应承载：

1. Lark -> Meegle 的业务 workflow。
2. Meegle 字段 ID 和字段可写规则。
3. 复杂 page/action catalog。
4. 跨平台 mapping。
5. 长期 token 持久化。

## 2. Directory Ownership

| Directory | Responsibility | Rules |
| --- | --- | --- |
| `extension/src/entrypoints/` | WXT entrypoints | 只做入口加载和轻量 wiring，不放业务逻辑 |
| `extension/src/background/` | message routing, auth handlers, storage bridge | 可以协调 extension 内部消息，不编排 server business workflow |
| `extension/src/content-scripts/` | page probe, context extraction, auth-code bridge | 只读页面和触发授权桥，不决定业务动作 |
| `extension/src/injection/` | injected UI/bootstrap | 只做页面注入和 UI interaction，不直接写平台业务数据 |
| `extension/src/popup-react/` | current popup UI | UI state/rendering，业务 action 交给 popup-shared/runtime |
| `extension/src/popup-shared/` | popup controller and shared behavior | 可以组织 UI controller，但 backend action 必须走 executor dispatcher |
| `extension/src/popup/` | popup runtime/API calls | server request wrapper、auth status、action request，不硬编码业务 workflow |
| `extension/src/types/` | shared extension-side types | 类型必须和 server contract 对齐，避免自定义漂移 |

## 3. Page Context Rules

Extension 可以采集：

- `url`
- `origin`
- `tabId`
- platform hint
- Lark `recordId` / Base context
- Meegle `projectKey` / `workItemTypeKey` / `workItemId`
- GitHub PR URL context
- selected rows or visible page state needed by UI

Extension 不应在 page context 阶段做：

- 根据业务字段决定创建哪种 Meegle workitem。
- 解析 Meegle dynamic field metadata。
- 自行判断平台字段是否可写。
- 在 server 不可达时默认启用完整 action。

Fallback 规则：

1. Server config fetch failed 时，只能进入 conservative fallback。
2. Conservative fallback 可以显示基础 UI、错误提示、日志导出。
3. Conservative fallback 不应启用真实业务 action。
4. fallback 必须可测试。

## 4. Popup And Action Rules

Popup action 的来源是 server `pageConfig.automationActions`。

规则：

1. Popup 渲染 action 时保留完整 `executor`。
2. `PopupFeatureAction` 不应丢掉执行所需信息。
3. `frontend` executor 只允许映射到少量本地能力：
   - open chat
   - open bulk create modal
   - open GitHub preview/create modal
   - trigger auth
4. `backend_api` executor 必须走统一 backend dispatcher。
5. backend dispatcher 读取 server 返回的 `method/route/operation`。
6. backend dispatcher 必须附带：
   - `actionRunId`
   - current URL
   - page context
   - `masterUserId`
   - extension version when available
7. Popup 不为每个 backend action 写新的 route 分支。

禁止模式：

```ts
if (actionKey === "some-backend-action") {
  await run({ endpoint: "/api/some/hardcoded-route" });
}
```

推荐模式：

```ts
await dispatchAutomationAction({
  action,
  context,
  actionRunId,
});
```

## 5. Background Message Rules

Background router 可以做：

- 接收 popup/content script 消息。
- 查 tab-scoped identity fallback。
- 触发 auth bridge。
- 转发 server request。
- 缓存 extension 内部状态。

Background router 不应做：

- 执行 Lark/Meegle/GitHub workflow。
- 拼 Meegle 字段 payload。
- 自行解释平台业务错误。
- 将 raw cookies/token 发给 server。

Message action naming:

1. 保持稳定 action string。
2. 新增 message action 必须有明确 owner handler。
3. 新增或重构跨层 action 必须带 `actionRunId` 或能从 payload 上游继承。

## 6. Auth Trigger Rules

Meegle auth:

1. Content script 可以在 Meegle 页面调用 BFF 获取 one-time `auth_code`。
2. Extension 只能把 `auth_code` 发给 server exchange。
3. Extension 不保存长期 Meegle token。
4. Extension 不把 raw browser cookie 发给 server。

Lark auth:

1. Extension 可以发起 OAuth session。
2. Callback content script 只读取 callback result。
3. `masterUserId` 可以缓存到 extension storage，用于后续 action identity。
4. token exchange/refresh/persistence 属于 server。

UI 规则：

- Auth missing 要提示用户授权。
- Auth failed 要保留错误原因。
- Auth required、identity missing、platform rejected 不能混成一个普通失败。

## 7. Logging Rules

Extension 端使用 `extension/src/logger.ts`，不使用 `console.log`。

日志字段建议：

| Field | Meaning |
| --- | --- |
| `actionRunId` | 一次用户 action 的 trace id |
| `operation` | server executor operation 或 frontend action key |
| `layer` | `extension` |
| `stage` | `extension.page.detect`, `extension.config.loaded`, `extension.action.clicked`, `background.action.dispatch`, `extension.action.result` |
| `tabId` | 当前 tab id |
| `pageType` | server page type |
| `matchedRuleId` | server page rule id |

敏感信息规则：

- 不记录 raw token。
- 不记录 raw cookie。
- 不记录完整 auth code，只能记录 suffix 或 hash。
- 用户 ID 可做摘要化。

## 8. Error Display Rules

Popup 应能展示：

- action 是否成功。
- 如果失败，失败来自哪一层。
- `errorCode`
- `stage`
- 可复制或可导出的 `actionRunId`

Popup 不应把所有错误都展示为：

- `操作失败`
- `Unknown error`
- `请重试`

如果 server 返回的 error envelope 不完整，extension 可以包装为：

```ts
{
  layer: "extension",
  module: "popup",
  stage: "extension.action.result",
  errorCode: "SERVER_ERROR_ENVELOPE_INVALID",
  errorMessage: "Server response is missing action error envelope.",
  actionRunId
}
```

## 9. Type And Contract Rules

1. Extension-side contract types must match server response shape.
2. If server `AutomationActionConfig` changes, update `extension/src/types/automation-actions.ts` in the same change.
3. Do not add extension-only executor variants unless server catalog can explain them.
4. Optional fields must be intentional and tested.
5. Zod or runtime validation should be used at server response boundary when malformed data can break UI behavior.

## 10. Test Rules

Extension tests:

| Test type | Location | Purpose |
| --- | --- | --- |
| Unit | `extension/src/**/*.test.ts` | pure mapper/controller/runtime behavior |
| Mock integration | explicit `tests/integration` or similar | extension + mocked server/runtime |
| Live E2E | Playwright tests only | real browser extension + server + platform page |

Rules:

1. `pnpm --dir extension test` should run Vitest tests.
2. `pnpm --dir extension test:e2e` should run Playwright tests, not Vitest-style files.
3. New Vitest tests should use globals already configured by project.
4. Do not introduce dynamic `await import()` patterns in tests.
5. Action dispatcher tests must prove backend actions are executor-driven.
6. Fallback tests must prove unsupported/server-failed pages do not enable full business actions.

## 11. PR Checklist

Before merging extension changes:

1. Did this keep workflow logic out of extension?
2. Did backend action use server executor instead of hardcoded route branch?
3. Did action payload include `actionRunId`?
4. Did fallback stay conservative?
5. Did auth trigger avoid sending raw cookie/token?
6. Did logs use `extension/src/logger.ts`?
7. Did tests cover the changed popup/background/content behavior?
