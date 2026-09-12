# Lark Ticket AI 输出与 Eval 数据集视图

## Background

当前 Lark Ticket 列表用于日常处理，详情页可查看 Octo 本地 `ticket_ai`。这两者都不能高效完成两件不同的事：复核 AI 的当前输出，以及把经过人工确认的 Ticket 固化为可回归的 Eval/Badcase 样本。

## Goal

在 Lark Ticket 页面提供两个独立工作面：

1. **AI 输出**：按“意图识别 → 问题总结 → Ticket 答案总结 → 文档生成”查看每个 Ticket 的 AI 处理流水线；从这里继续进入详情页执行已有 AI Session，或把符合条件的 Ticket 建立为 Eval 样本。
2. **Eval 数据集**：维护冻结的 `Ticket snapshot + AI output + 人工标准答案 + Badcase 标签`，供后续导出和离线回归。

## Scope

- Lark Ticket 的“视图配置”新增“AI 输出 / Eval 数据集”；四种视图共用 Ticket 的服务端筛选、标签筛选、排序和分组配置。
- AI 输出视图仅读取已同步 Ticket 及 Octo 本地 `ticket_ai`，按四阶段展示状态和结果，不触发 Lark 写入。
- 创建 Eval 样本时服务端确认完整的线程快照，冻结当前 AI 输出与 snapshot version。
- Eval 数据集视图支持填写人工意图、期望结果、备注、失败标签，并将样本标为 `eval` 或 `badcase`。
- 数据全部只写 Octo PostgreSQL；Badcase 是 Eval 样本的特殊状态，不直接修改 Lark。

## Non-Scope

- 不在本次直接导出 CSV 或运行 DeepEval。
- 不自动训练模型、修改 Prompt/Skill，或自动执行 Ticket 外部动作。
- 不批量提交人工标注。

## Affected Layers And Objects

- FE: `PlatformListPage`、Lark Ticket AI workspace、Web API client。
- Server: Web-session Ticket Eval API、Zod DTO、application service、PostgreSQL store。
- Persistence: `lark_ticket_eval_samples`，以 Ticket 复合键和线程快照版本唯一定位样本。

## Behavior Contract

- 没有完整线程快照的 Ticket 不可创建 Eval 样本，必须展示“缺少完整线程快照”。
- 同一 Ticket 的同一 snapshot version 重复创建时返回已有样本，保证幂等。
- AI 输出冻结为创建时的 allow-listed `ticket_ai` 字段；之后 AI 字段或线程变化不覆盖历史样本。
- 回答总结和文档生成尚未持久化时必须显示“未生成”；列表的“继续处理”只进入详情页复用既有 AI Session，不能把 Session 预期当作已完成结果。
- Eval 视图仅显示当前筛选与分组范围内已有样本；样本与 AI 输出以 `baseId + tableId + recordId + snapshotVersion` 关联，二者不互相覆盖。
- `eval` 和 `badcase` 保存时必须有人工意图及期望结果；Badcase 还至少有一个失败标签。
- 样本可先保存为 draft，draft 不进入可用 Eval 数据集。

## Acceptance Criteria

- 用户能在 AI 输出视图定位四阶段的已生成/未生成状态，并从一条已有 AI 输出的 Ticket 创建 Eval 样本。
- Eval 数据集视图能查看、编辑、保存 draft/eval/badcase 样本。
- 样本行明确展示 Ticket、固定快照版本、AI 摘要、人工标准答案和数据集状态。
- Eval 样本至少展示冻结 AI 意图、人工标准意图、期望结果、失败标签、数据集状态和 snapshot version；人工意图后续细分为意图类型、子类和人工摘要。
- 创建/更新请求使用 Web Session、Zod 校验与 `{ ok, data, error }` 响应；不写 Lark。
- 定向 FE、Server 测试与两端 build 通过。

## Verification Plan

- Server store/service/controller 单测：快照校验、幂等创建、状态校验、Badcase 标签校验。
- FE mapper/API 单测：AI 输出状态与请求/响应解析。
- `pnpm --dir server build`、`pnpm --dir fe test`、`pnpm --dir fe build`。

## Risks And Follow-Up

- 当前不导出到 CSV；后续需要受控 exporter 将已批准 `eval`/`badcase` 样本转换为 DeepEval 数据文件，并保留样本 ID 与版本。
- 现有 SupportTicketAnalysis 的 AI/人工投影不作为该数据集的唯一来源，以免人工更新覆盖 AI 基线。
