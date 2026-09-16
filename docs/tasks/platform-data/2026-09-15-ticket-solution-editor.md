---
title: "Ticket 解决方案编辑并回写 Lark Base"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-09-15
updated_on: 2026-09-15
closed_on: 2026-09-15
owner: Codex
related:
  - "2026-09-11-lark-ticket-context-menu-actions.md"
---

# Ticket 解决方案编辑并回写 Lark Base

## 目标与范围

详情页解决方案标题旁提供编辑图标，进入多行编辑后显示保存图标，仅显式保存写入 Lark Base。批量导入、去重、清洗策略、AI 调度及输入保持现状；不新增依赖或数据库结构。保留工作区原有搜索、筛选和其他任务改动。

## 验收标准

- [x] 编辑图标切换为保存图标；输入、失焦、换行不提交，保存期间禁用并阻止重复提交。
- [x] 支持多行及清空；首尾去空白，最多 20,000 字符；其他字段保持原校验。
- [x] 使用既有 Web 权限、字段回写与单条同步清洗；成功更新详情和导航缓存。
- [x] 失败/部分成功保留草稿并明确提示；完整 Ticket 身份隔离草稿及迟到响应。
- [x] FE check、相关 Server 单测和 build 通过；单独记录浏览器 mock 与真实平台验证边界。

## 方案与决策

复用 `POST /api/web/lark-tickets/:recordId/fields`，增加语义字段 `solution`，映射到“解决方案”。返回投影包含字符串 solution（清空为 `""`）。独立编辑组件按 API origin、Base、Table、Record 重新挂载；切换后丢弃未保存草稿。保存失败不关闭编辑，Lark 成功/本地同步失败沿用 `syncFailed` 部分成功语义。普通 Enter 只换行，不设自动保存和快捷键提交。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-15 | v1 | in_progress | 用户确认只实现解决方案编辑；已检查现有权限、字段服务、同步和详情入口 | 实现及本地验证，未调用真实 Lark 写接口 |
| 2026-09-15 | v1 | done | 实现图标切换、多行保存、清空和身份隔离；新增 DTO/服务/API/缓存回归检查；FE check、Server 77 项相关测试与 build、Chromium mock 交互均通过 | 未部署，未执行真实 Lark 写入或登录 E2E |

实现复核补充了“平台更新响应省略空字段”的清空回归：合并响应时先应用已提交的 solution，防止旧值复活。该边界已由服务测试覆盖，不另重复写入跨任务经验库。浏览器夹具首次直接命名导入 Vite 优化后的 CJS `react-dom_client.js` 失败，改为默认导入再使用 `createRoot` 后通过，未改变应用代码。预览服务初次被自动审批以模型容量不足拒绝，复核本机绑定与 fixture 隔离后重试获准；测试服务已停止。

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测及构建 | `pnpm --dir fe check` 通过；Node 报告 41 个测试文件通过，Vite production build 通过 | API 单测：`fe/src/services/lark-ticket/lark-ticket-actions-api.test.js`；缓存单测：`fe/src/lib/lark-ticket-detail-navigation.test.js`；本次日志 `/tmp/octo-solution-fe-check.log` | 含现有工作区测试；不代表部署 |
| Server 单测 / mock integration | 4 个测试文件、77 项通过 | `pnpm --dir server test src/application/services/lark-ticket-field-update.service.test.ts src/modules/lark-ticket/lark-ticket-field-actions.controller.test.ts src/application/services/platform-data.service.test.ts src/application/services/platform-sync.service.test.ts`；本次日志 `/tmp/octo-solution-server-test.log` | Lark 客户端和同步依赖使用 mock；覆盖清空的 null/省略字段返回、多行、上限、权限及部分成功 |
| Server 静态检查 | `pnpm --dir server build` 通过 | 本次日志 `/tmp/octo-solution-server-build.log` | TypeScript 编译 |
| 浏览器 mock 交互 | Chromium + React StrictMode 下 8 组检查通过；无页面运行时错误 | 临时夹具 `/tmp/octo-solution-browser.cjs`、结果 `/tmp/octo-solution-browser.log` | 使用独立虚构 Ticket，所有 API 拦截；验证聚焦、显式保存、清空、20,000 字符上限、失败/部分成功、重复点击、跨 Table 迟到响应、跨 Base 草稿隔离及只读权限。Vite 开发热更新 WebSocket 被浏览器本机网络限制阻止，不影响已加载组件检查。临时文件不作为长期测试入口 |
| 差异检查 | `git diff --check` 通过 | 本次工作区差异 | 保留原有未提交改动 |
| Live E2E / 已部署验证 | 未执行 | 无 | 未使用真实授权，也未修改任何真实 Lark Ticket；未部署 |

## 关联

- [字段编辑任务](2026-09-11-lark-ticket-context-menu-actions.md)
- [当前系统技术对象](../../ai-dev/lifecycle/current-system-technical-objects.md)
