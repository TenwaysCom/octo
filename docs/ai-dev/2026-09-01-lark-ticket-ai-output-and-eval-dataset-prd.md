# Lark Ticket AI 输出与 Eval 数据集视图

## Background

当前 Lark Ticket 列表用于日常处理，详情页可查看 Octo 本地 `ticket_ai`。这两者都不能高效完成两件不同的事：复核 AI 的当前输出，以及把经过人工确认的 Ticket 固化为可回归的 Eval/Badcase 样本。

## Goal

在 Lark Ticket 页面提供两个独立工作面：

1. **AI 输出**：按“意图识别 → 问题总结 → Ticket 答案总结 → 文档生成”查看每个 Ticket 的 AI 处理流水线；从这里继续进入详情页执行已有 AI Session，或把符合条件的 Ticket 建立为 Eval 样本。
2. **Eval 数据集**：维护冻结的 `Ticket snapshot + AI output + 可选人工标准答案 + Badcase 标签`，供后续导出和离线回归。

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
- Persistence: `lark_ticket_eval_samples`，以 Ticket 复合键和线程快照版本唯一定位样本；`lark_ticket_eval_reviews` 保存每次成功人工保存的身份、时间、状态和 actionRunId。

## Behavior Contract

- 没有完整线程快照的 Ticket 不可创建 Eval 样本，必须展示“缺少完整线程快照”。
- 同一 Ticket 的同一 snapshot version 重复创建时返回已有样本，保证幂等。
- AI 输出冻结为创建时的 allow-listed `ticket_ai` 字段；之后 AI 字段或线程变化不覆盖历史样本。
- 回答总结和文档生成尚未持久化时必须显示“未生成”；列表的“继续处理”只进入详情页复用既有 AI Session，不能把 Session 预期当作已完成结果。
- Eval 视图仅显示当前筛选与分组范围内已有样本；样本与 AI 输出以 `baseId + tableId + recordId + snapshotVersion` 关联，二者不互相覆盖。
- Draft / Eval 的人工意图、期望结果与失败标签均选填；Bad case 至少有一个失败标签，人工意图与期望结果选填。
- “加入 Eval”直接创建 Eval，已有样本显示“编辑 Eval”并复用编辑器，可保存为 Draft。人工保存任意状态都记为一次审核，Draft 不等于未审核。
- AI 输出和 Eval 数据集右侧首行固定 Thread、messages、加入 Eval、编辑 Eval 四个图标，均有悬浮说明及无障碍名称；已有样本禁用加入，无样本禁用编辑。第二行只读紧凑标签显示“未标记 / Draft / Bad case / 纳入 Eval”，后接最近标注人和月日时分；标题前不重复状态。
- Eval 人/时间取最近一次人工成功保存；由 Web Session 和服务端时钟绑定，在操作区第二行常驻展示，长姓名省略；悬浮可查看完整姓名和时间，编辑器保留完整信息。旧样本缺失信息显示未记录，不从创建或更新时间推断。
- My evals 复用快捷过滤区，按本人曾保存过的样本匹配，在服务端分页前按 Ticket 去重。别人后续保存不移除原参与者的归属；与现有页面筛选取交集。
- 每个 Ticket 默认展示最高快照版本；My evals 展示本人参与过的最高版本。保存与审核记录事务提交，同一样本、操作人和 actionRunId 的重复请求不重复记审核，也不覆盖后续保存。

## Acceptance Criteria

- 用户能在 AI 输出视图定位四阶段的已生成/未生成状态，并从一条已有 AI 输出的 Ticket 创建 Eval 样本。
- Eval 数据集视图能查看、编辑、保存 draft/eval/badcase 样本。
- 样本行沿用现有布局展示 Ticket、AI 摘要、人工标注和标题前状态；快照版本在编辑器中查看。
- Eval 行保留已有字段显隐配置；审核人和时间不增加常驻列，My evals 不增加统计面板。
- 创建/更新请求使用 Web Session、Zod 校验与 `{ ok, data, error }` 响应；不写 Lark。
- 定向 FE、Server 测试与两端 build 通过。

## Verification Plan

- Server store/service/controller 单测：快照校验、幂等创建、状态校验、Badcase 标签校验。
- FE mapper/API 单测：AI 输出状态与请求/响应解析。
- `pnpm --dir server build`、`pnpm --dir fe test`、`pnpm --dir fe build`。

## Risks And Follow-Up

- 当前不导出到 CSV；后续需要受控 exporter 将`eval`/`badcase` 样本转换为 DeepEval 数据文件，并保留样本 ID 与版本；导出用于标准答案评分前需另行检查标注完整性，纳入 Eval 不代表答案正确。
- 现有 SupportTicketAnalysis 的 AI/人工投影不作为该数据集的唯一来源，以免人工更新覆盖 AI 基线。

实施状态和验证证据见[任务台账](../tasks/ai-ticket/2026-09-01-lark-ticket-ai-output-eval-dataset-views.md)。
