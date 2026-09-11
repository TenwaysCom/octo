---
title: "Lark Ticket 详情属性编辑"
module: "platform-data"
status: completed
requirement_version: 1
created_on: 2026-09-11
updated_on: 2026-09-11
closed_on: 2026-09-11
owner: jack
related:
  - "docs/tasks/platform-data/2026-09-11-lark-ticket-context-menu-actions.md"
  - "docs/tenways-octo/it-platform-sync.md"
---

# Lark Ticket 详情属性编辑

## 目标

详情页右侧 Properties 支持修改状态、紧急度、需求人、负责人、类型和 Business Line，并写回 Lark Base。复用列表字段写入及单条同步清洗接口，不新增服务端接口。创建时间、关闭时间及 Shadow AI 保持只读。

## 验收标准

- [x] 有 platformSync 权限时六个属性可点击编辑，支持选值、保存、取消。
- [x] 使用服务端字段选项；人员提交 optionUserId，写入携带 actionRunId。
- [x] 显示加载、加载失败重试、空选项、保存中、写入失败及部分成功状态。
- [x] 保存期间阻止重复提交，未授权时无编辑入口。
- [x] 成功后合并详情及前后导航缓存，保留其他字段与导航顺序。

## 背景与范围

详情原本使用只读属性展示，首次加载优先读取列表传入的导航快照。单纯更新详情局部 state 会在切换 Ticket 后重新读取旧导航快照。

## 方案与决策

- 新增 LarkTicketEditableProperties，保留 badge/人员显示，以单字段内联选择与保存表单编辑。
- 复用 GET field-options 和 POST fields；权限依据 profile.workspaceAccess.platformSync，服务端继续独立鉴权。
- 保存使用同步 ref 防重入；组件以 API 地址和完整 Ticket 标识为 key，切换记录不沿用草稿；选项加载通过请求版本忽略卸载后的响应。
- 服务端确认同步成功后合并返回投影，并按 baseId/tableId/recordId 更新导航缓存。导航缓存使用函数式更新，旧请求不会覆盖当前导航集合。
- syncFailed 时显示 Lark 已写入但 Octo 同步失败，保持旧投影，不伪造同步成功或再次自动写入。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-11 | v1 | completed | 六字段编辑、状态处理及导航缓存更新完成；FE 测试、构建和模拟接口浏览器检查通过 | 真实 Lark 写入需业务环境验收 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 测试 | 通过 | pnpm --dir fe test，39 个测试文件通过；新增导航更新回归 | 不调用真实平台 |
| FE 构建 | 通过 | pnpm --dir fe build | Vite 生产构建 |
| 浏览器模拟接口检查 | 通过 | 临时 Playwright 检查六字段、人员 ID、空值、选项失败重试、防重复提交、写入失败重试、部分同步成功和只读权限 | 使用本地组件及模拟 API，无真实账号或平台写入 |
| 差异检查 | 通过 | git diff --check | 用户已暂存 .gitignore 未改动 |

## 复盘

需同时更新详情与导航快照，避免局部保存成功后切换页面恢复旧值。临时浏览器 Harness 首次混用了 Vite 不同版本的 React 模块导致 useState dispatcher 为空；统一模块版本后检查通过，产品代码无需规避。

## 关联

- [列表右键快捷动作](2026-09-11-lark-ticket-context-menu-actions.md)
