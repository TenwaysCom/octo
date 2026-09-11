---
title: "Lark Ticket 列表右键快捷动作"
module: "platform-data"
status: in-progress
requirement_version: 1
created_on: 2026-09-11
updated_on: 2026-09-11
closed_on: null
owner: jack
related:
  - "docs/ai-dev/rules/server-code-rules.md"
  - "docs/tenways-octo/it-platform-sync.md"
---

# Lark Ticket 列表右键快捷动作

## 目标

FE Lark Ticket 列表（列表 / 分组 / 看板视图）右键 ticket 行弹出 Linear 风格二级上下文菜单：

- 一级动作：更新状态、修改负责人、修改需求人（提出人）、修改紧急度、修改类型、修改 Business Line、创建 Meegle Work Item
- 二级子菜单：可变更的选项值，当前值打勾并计数；「创建 Meegle」无二级
- 字段写操作以 Lark Base 为源：`updateRecord` 写回 Base 后单条重同步（`syncLarkBaseTicket`），列表行原地更新
- 权限：web 会话 + `getWebWorkspaceAccess(role).platformSync`（admin/devops/pm）

不在范围内：extension 改动、批量操作、新数据库 schema、UI 组件库。

## 验收标准

- [x] 右键 lark ticket 行弹出菜单；列表 / 分组 / 看板视图生效；ai-output / eval-dataset 视图不触发
- [x] 六个字段动作均有二级选项（来自 Lark 字段元数据 / 同步数据人员聚合），可写入并回显最新行
- [x] 创建 Meegle 复用 `executeLarkBaseWorkflow`，已有链接返回 409 与提示
- [x] Base 写成功但投影重同步失败时返回部分成功（`syncFailed: true`），不阻塞用户
- [x] server / fe 测试与构建通过

## 背景与范围

- FE 列表数据来自 Postgres 同步投影（`/api/web/platform-data/lark-tickets`），行含 `recordId/baseId/tableId`
- Lark Base 字段名候选集中到 `server/src/domain/lark-ticket-fields.ts`，供 cleaning / sync / field-update 共用
- 人员字段（需求人/负责人）读值为 `[{name, id(open_id)}]`，写入用 `[{id}]`
- `LarkClient.getFields` 扩展返回 `type/ui_type/property.options`，为 select 字段提供权威选项

## 方案与决策

- 「提出人」= 列表「需求人」列（requester），与用户确认
- 二级选项来源：select 字段用 Bitable 字段元数据 options；人员用已同步 ticket `source_fields` 聚合去重（含 open_id），与用户确认
- 写操作权限与 `platformSync` 同级（admin/devops/pm），与用户确认
- 菜单 UX 按 Linear 参考图：一级图标+`›`、分组分隔线、二级灰标题（「更新状态…」）、彩色圆点+计数+当前值 ✓
- 新增路由（挂在 `lark-ticket` 模块，cookie 会话鉴权，api-auth 对 `/api/web/lark-tickets/` 前缀本就豁免）：
  - `POST /api/web/lark-tickets/:recordId/fields`
  - `POST /api/web/lark-tickets/:recordId/create-meegle-workitem`
  - `GET /api/web/lark-tickets/field-options`
- 创建 Meegle 成功写回后，Server 先单条同步并清洗 Ticket，再返回供 FE 重载列表；同步失败保留创建结果和链接，以 `syncFailed` 提示部分成功。
- 字段写回后的单条同步显式启用 `cleanAfterSync: true`，更新列表与服务端筛选使用的清洗列。
- FE 按 base/table/record 使用同步 ref 防重复提交，鼠标与键盘创建入口均禁用；Web 创建服务同样按源记录阻止进程内并发请求。此保护不覆盖跨 Server 进程、重启或其他旧创建入口，不承诺平台创建的全局 exactly-once。
- 菜单独立接收字段元数据与当前加载列表；缺失值不匹配、不计数；子菜单激活时始终展示加载、错误重试或空结果。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-11 | v1 | in-progress | server+fe 实现，测试/构建通过 | 未做浏览器端真实 Lark 联调（`make server-dev && make fe-dev` 手工验证） |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| server 单测 | 通过 | `pnpm --dir server test`：833 passed / 1 skipped；含 field-update service（写入格式、字段定位、部分成功）、controller（鉴权/404/409）新增用例 | 未覆盖真实 Lark API |
| server 构建 | 通过 | `pnpm --dir server build`（tsc） | - |
| fe 单测 | 通过 | `pnpm --dir fe test`：198 passed（含 actions-api、菜单纯函数新增用例） | 未做组件级 DOM 测试 |
| fe 构建 | 通过 | `pnpm --dir fe build` | - |

## 关联

- 参考：extension「创建 Meegle」走同一 `executeLarkBaseWorkflow`（`extension/src/background/router.ts` → `/api/lark-base/create-meegle-workitem`）
- 同步链路：`PlatformSyncService.syncLarkBaseTicket` 单条重同步

## Review 修复记录（2026-09-11）

- 根因：菜单模型与组件参数未接通、空字段未归一化；只验证写入返回和临时回显，遗漏数据库清洗投影及创建后的同步；React 状态更新前没有同步防重入保护。
- 六条 review 均已修复；新增空字段、创建/同步顺序、不同 actionRunId 并发、同步部分成功和锁释放回归测试。
- 本轮验证：`pnpm --dir server test` 836 passed / 1 skipped；`pnpm --dir fe test` 39 个测试文件通过；Server TypeScript 与 FE Vite 构建通过，`git diff --check` 通过。
- 验证边界：外部 API 使用 mock，未执行真实 Lark/Meegle 写入；新增服务端并发保护仅适用于同一进程内的 Web Ticket 创建路径。
- 临时 Playwright 浏览器检查通过：空字段菜单渲染、loading、error/retry、空选项、加载列表计数、创建按钮及键盘禁用。仅使用本地组件与构造数据，无真实账号。首次临时页面缺少 React Refresh 初始化及 CJS 默认导入，修正测试页后通过；未改产品代码绕过问题。
