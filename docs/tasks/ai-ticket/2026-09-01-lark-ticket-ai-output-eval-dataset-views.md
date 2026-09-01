---
title: "Lark Ticket AI 输出与 Eval 数据集视图"
module: "ai-ticket"
status: completed
created_on: 2026-09-01
owner: TBD
related:
  - "../../ai-dev/2026-09-01-lark-ticket-ai-output-and-eval-dataset-prd.md"
---

# Lark Ticket AI 输出与 Eval 数据集视图

## 目标

将当前 Ticket 处理与 AI 输出复核、Eval/Badcase 数据集构建拆为独立工作面；AI 输出按意图识别、问题总结、Ticket 答案总结、文档生成四阶段呈现。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-09-01 | completed | 新增 AI 输出 / Eval 数据集工作面、PostgreSQL `lark_ticket_eval_samples`、Web Session API 和标注编辑器；样本冻结 Ticket AI 输出及完整线程快照版本。 | 未做真实 Lark/ACP 或实际 CSV 导出；本机服务端全量测试另有超时与 logger 文件测试失败，未在本任务内排查。 |
| 2026-09-01 | completed | AI 输出扩展为四阶段流水线；回答和文档未持久化时显式显示未生成，继续处理复用详情页 AI Session。 | 实际的回答/文档 Session 结果仍需由后续 Skill 写入新增的本地 AI 字段。 |
| 2026-09-01 | completed | AI 输出与 Eval 数据集改为 Lark Ticket 视图配置中的独立选项，和普通列表/看板共用服务端筛选、标签筛选、排序和分组；修复 Eval 列表被通用 Header 鉴权拦截的问题，改为使用既有 Web Session。 | 尚未执行 PostgreSQL `db:migrate`，因此运行中环境未必已有样本表。 |
| 2026-09-01 | completed | AI 输出与 Eval 数据集接入既有 Lark 主分组及二级分组折叠状态；主组、子组均可独立收起，并在这两个视图间保留状态。 | 仅支持已有视图配置定义的两级分组。 |
| 2026-09-01 | completed | 视图配置会随 AI 输出 / Eval 数据集模式切换对应显示字段，并实时控制字段显隐；排序仍在分组前按稳定的 Ticket 基础字段执行。 | 当前未按 AI 阶段内容或人工 Eval 标注排序，避免对未定义的文本和标签语义作隐式排序。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 聚焦测试 | 通过 | Eval service、Ticket controller、route catalog：3 files / 7 tests | 覆盖完整快照、拒绝不完整快照和路由注册。 |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：132 tests | 覆盖新 Eval API client 与既有 FE 行为。 |
| 构建 | 通过 | `pnpm --dir server build`、`pnpm --dir fe build` | 静态编译和生产构建，不代表登录态 UI 或真实平台调用。 |
| Server 全量测试 | 非本功能失败 | `pnpm --dir server test` 发现既有 pg-mem/ACP 测试超时及 logger 文件断言失败 | 新增 Eval service 聚焦测试通过；未调用外部服务。 |
| AI 流水线定向测试 | 通过 | pipeline、Ticket AI section、AI field allow-list：5 tests；两端 build 通过 | 覆盖旧字段兼容映射和未生成空态，不代表真实 AI Session 已回写新字段。 |
| Eval Web Session 鉴权回归 | 通过 | `api-auth`、Ticket controller、route catalog：13 tests；两端 build 通过 | 验证新列表接口不再需要浏览器提供 `master-user-id`，实际登录态页面仍待本地服务重启后人工刷新确认。 |
