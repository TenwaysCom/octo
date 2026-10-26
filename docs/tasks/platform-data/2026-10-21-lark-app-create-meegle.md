---
title: "Lark App 创建 Meegle 工作项"
module: "platform-data"
status: done
requirement_version: 2
created_on: 2026-10-21
updated_on: 2026-10-21
closed_on: 2026-10-21
owner: TBD
related:
  - "docs/tasks/platform-data/2026-09-11-lark-ticket-context-menu-actions.md"
  - "docs/tasks/platform-sync/2026-10-21-lark-ticket-edit-sync-performance.md"
---

# Lark App 创建 Meegle 工作项

## 目标

在 `#lark-app-thread-analysis` 选中 Ticket 后提供创建 Meegle 工作项的入口。v2 将操作文案缩为“打开 Meegle”和“创建 Meegle”，移到“原始讨论”同行。复用既有创建 API 和 Server workflow。保留属性编辑、AI 页签和回复草稿；不改类型映射、Server 契约、依赖或数据库，不执行部署或真实平台创建。

## 验收标准

- [x] v2：“打开 Meegle”和“创建 Meegle”紧随“原始讨论”同行展示，窄屏不溢出。

- [x] 有 platformSync 权限且未关联 Meegle 的 Ticket 显示创建按钮；无权限只展示已有链接。
- [x] 每次请求携带 actionRunId，复用 POST create-meegle-workitem；创建期间防重复提交，属性保存未完成时不能开始创建。
- [x] 成功显示所有返回工作项的链接，部分同步失败保留创建结果并提示，已有链接或 Server 返回已有链接时阻止重复创建。
- [x] 创建状态按完整 Ticket 标识保留在当前登录会话，搜索切换与主站导航不串结果；创建期间的字段写入被阻止，退出登录后的晚到响应不污染新会话。
- [x] FE 检查、针对性单测和浏览器模拟通过；明确未部署和真实平台未验证的边界。

## 背景与范围

列表右键已调用 `createLarkTicketMeegleWorkitem`。Server 解析实际 Web Session、检查 platformSync，读源记录并按现有类型映射创建工作项，写回 Lark 链接后单条同步。已有链接返回 MEEGLE_LINK_ALREADY_EXISTS，同一进程的 Web 创建入口按源记录阻止并发；不承诺跨进程或所有入口的 exactly-once。

## 方案与决策

在 App 会话持有的 Ticket 操作状态中增加创建状态和结果复用，不新建服务端业务队列。前端只派发既有 API、渲染结果和安全链接；类型及字段映射仍归 Server。创建不自动重试。成功结果同步到 Ticket 投影和导航缓存，晚到读取沿用编辑版本门禁。

`lark-ticket-field-edits.js` 增加 per-Ticket 创建状态，创建期间复用同一 Promise；完成后保留结果以供导航返回时展示。创建与属性写入互斥，不合并或更改字段映射。`LarkTicketAppPage` 显示按钮、状态、错误、工作项链接及已有链接冲突时的显式读取入口，不通过刷新整页回显创建结果，因此同 Ticket 的回复草稿保留。未新增配置、依赖或 Server 改动。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-10-21 | v1 | in_progress | 已核对列表创建入口、Server workflow 与 API 返回契约 | 实现 FE 入口和模拟验收，不调用真实平台 |
| 2026-10-21 | v1 | done | FE 入口、创建状态与链接回显完成；FE check 49 个测试文件及构建通过，浏览器九组 PASS | 尚未部署；未调用真实 Lark/Meegle，没有平台创建 ID 或 read-back 证据 |

| 2026-10-21 | v2 | in_progress | 用户补充入口短文案及同行布局；调整 App 入口与浏览器断言 | 验证桌面同行、390px 不溢出及既有编辑/创建回归 |

| 2026-10-21 | v2 | done | 九组浏览器模拟回归通过，新增断言确认创建与打开入口和原始讨论同行；390px 无溢出 | 本地合成 API；未部署或执行真实平台写入 |

## 验收场景与结果

本地 390px 浏览器、合成 Ticket、可控延迟和失败的 API：

| 操作 | 预期及实际结果 |
| --- | --- |
| 属性保存中查看创建按钮，保存完成后连续两次点击 | 保存前禁用；保存后只发一条创建请求，携带源记录标识及 actionRunId；通过 |
| 创建中搜索其他 Ticket 再返回 | 原 Ticket 保持创建中，其他 Ticket 无串入状态；通过 |
| 返回两个工作项且 syncFailed | 两条链接立即可见，保留部分成功提示；再次进入仍不能重复创建；通过 |
| 创建返回授权错误后显式重试 | 展示错误、不自动重试，手动再次点击成功后显示正确链接；通过 |
| 创建结果返回时已有回复草稿 | 不重置该 Ticket 的回复草稿；通过 |
| Server 返回已关联，随后显式读取 | 不再创建；新读取展示已有链接，过滤 javascript 等非 HTTP(S) URL；通过 |
| 无 platformSync 权限 | 未关联时无创建入口，已关联时可打开安全链接；通过 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 本次提交隔离验证 | 通过 | 从 Git index 导出临时副本：FE check 48 个测试文件及构建，Server 四个相关文件 59 项及构建，浏览器九组 PASS | 仅本次暂存内容；不含并行 Eval 改动，无真实平台写入或部署 |
| FE 单测 | 通过 | `node --test` 指定字段状态和 actions API 测试文件；`pnpm --dir fe check` 共 49 个测试文件通过 | 既有字段状态回归及新增 5 项创建状态用例：请求复用、互斥/部分成功、已有链接、失败重试和退出会话 |
| FE 静态构建 | 通过 | `pnpm --dir fe check` 的 Vite 构建 | 不代表部署 |
| 浏览器模拟集成 | 通过 | `OCTO_FIELD_BROWSER_EXECUTABLE=<已安装 Chromium> node fe/manual-tests/lark-ticket-field-edits.browser.mjs`，九组 PASS | 本机 Vite 和真实 App，全部接口为合成数据；沿用既有浏览器版本覆盖参数，在沙箱外执行 localhost 验收 |
| 差异与文档 | 通过 | `git diff --check`；FE guide、Lark App guide、lifecycle 和任务索引已更新 | 保留工作区其他任务改动 |
| Server 测试 | 未重跑 | - | 本轮未修改 Server，复用既有创建 API；模拟响应不证明真实 Server 或平台成功 |
| Live E2E / 部署验证 | 未执行 | - | 不在本次执行范围 |

## 关联

- [原列表创建入口](2026-09-11-lark-ticket-context-menu-actions.md)
- [属性编辑及共享会话队列](../platform-sync/2026-10-21-lark-ticket-edit-sync-performance.md)
