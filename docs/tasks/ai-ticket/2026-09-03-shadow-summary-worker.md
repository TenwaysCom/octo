---
title: "Lark Ticket 影子模式 AI 问题总结后台任务"
module: "ai-ticket"
status: in_progress
requirement_version: 2
created_on: 2026-09-03
updated_on: 2026-09-03
closed_on: null
owner: TBD
related:
  - "docs/ai-dev/prompts/support-intent-analysis-v2.md"
---

# Lark Ticket 影子模式 AI 问题总结后台任务

## 目标

在 platform-sync-worker 进程内以后台影子模式，为「source_updated_at 静默超过 3 小时、尚无 lark_ticket_thread_syncs 快照」的 Lark Ticket 自动拉取会话快照并跑 ACP 问题总结（v2 意图识别提示词），结果写入 `lark_base_ticket_octo.shadow_ai`，不影响线上 ticket_ai 投影和评估数据集。不在本次范围：FE 展示、评估样本晋升、自动重放线上 analysis-update。

## 验收标准

- [x] schema 增加 `lark_base_ticket_octo.shadow_ai`（建表 + 幂等 ALTER）
- [x] store 提供候选查询（排除 Cancelled/Rejected、3h 静默、无快照或上次 error、幂等跳过）与 shadow_ai 回写
- [x] shadow 服务：thread ensure → ACP one-shot → Zod 校验（support-analysis-result-v1，证据 ID 必须在快照内）→ shadow_ai 落库
- [x] worker 入口按 `LARK_TICKET_SHADOW_SUMMARY_ENABLED=true` 并行启动 shadow 循环，缺 master user 时降级为告警
- [x] 单测覆盖 ok / skipped×2 / 非法 JSON / schema 失败 / 证据越界 / ACP 失败 / prompt 缺失 / 失败后续跑
- [ ] 真实环境开启并观察首轮 shadow 结果

## 背景与范围

影子结果只进 `shadow_ai` 独立列：线上 `upsertLarkBaseTicketAi` 会整体重写 ticket_ai JSON，顶层共存 key 会被冲掉，故不用 ticket_ai。`lark_ticket_eval_samples` 是人工策划评估集，批量影子输出不写入。提示词复用 `workflow_prompts` 的 `lark_ticket.support_qa.summarize`（已同步为 v2，与 server `SUPPORT_INTENT_TYPES` 一致）。

## 方案与决策

- 新服务 `lark-ticket-shadow-summary.service.ts`：deps 注入（syncStore/threadContext/acpService/promptStore），env 可调 settle(3h)/batch(5)/timeout(300s)/poll(5min)。
- ACP 走 `chatOneShot`（one-shot，不进 session registry/ownership），AbortSignal 超时。
- 候选 SQL：`NOT EXISTS thread 快照 OR shadow_ai.status='error'`，且 `shadow_ai.analyzedAt < source_updated_at`；按 ticket_number 倒序。
- 无 thread 链接/无消息 → `skipped`；单条失败写 `error` 不阻塞队列，下轮自动重试。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-03 | v1 | in_progress | 服务/存储/worker 接线完成，9 个单测通过，server 全量 668 测试通过，tsc 通过 | 待真实环境开启观察 |
| 2026-09-03 | v2 | in_progress | v2 新增：shadowAi 经 store/domain 透出到工单列表数据，FE pipeline 在意图识别/问题总结缺正式输出时回退展示影子结果（状态"影子·已生成"），正式字段优先；server 671 + FE 138 测试通过 | 待真实环境开启观察 |
| 2026-09-03 | v3 | in_progress | v3 新增：shadow 轮询默认改为每 1 小时一轮（`LARK_TICKET_SHADOW_SUMMARY_POLL_INTERVAL_MS` 可覆盖）；`platform-sync-sources` list 响应附带 `shadowSummary` 水位（ok/skipped/error/pending/lastAnalyzedAt/enabled，读取失败自动省略不拖垮列表），FE #sync 页新增「Lark Ticket AI 分析」卡片；server 673 + FE 138 测试通过，tsc 通过 | 待真实环境开启观察 |
| 2026-09-03 | v4 | in_progress | v4：worker 入口解耦，shadow 循环不再依赖 `scheduler.enabled`（scheduler 关闭时只跑 shadow，满足"其他数据不定时同步"）；`.env.example` 补 shadow 配置说明。冒烟两轮（dev 库）：候选捞取→thread ensure→shadow_ai 落库链路全部走通，但 10 张全部 `SHADOW_THREAD_UNAVAILABLE`——master user（Ben Lin）Lark refresh token 失效（code 20026 "refresh token is invalid, it may has been used"），error 状态已正确落库等待重试；server 673 测试 + tsc 通过 | 待 master user 重新登录 Lark 刷新凭据后重跑验证 ok 路径 |
| 2026-09-03 | v5 | in_progress | v5：`scheduler.tasks` 任务级配置落地——`tasks.lark/meegle/github`（enabled + intervalMinutes，覆盖 intervalsMinutes，缺省全开）、`tasks.shadow`（enabled 缺省关 + intervalMinutes/settleMinutes/batchLimit/acpTimeoutSeconds）；shadow 合并进 scheduler 块，env `LARK_TICKET_SHADOW_SUMMARY_*` 保留为覆盖项（开关 env 优先，调参 config 优先）；#sync 卡片 enabled 判定走同一优先级；`it-platform-sync.md` 配置说明更新；新增 4 条测试，server 677 + tsc 通过 | 待重新登录后按新配置跑通 ok 路径 |
| 2026-09-03 | v6 | in_progress | v6 冒烟通过：token 刷新后首轮 considered 5 → summarized 4 / failed 1，ok 输出质量正常（intent+subtype+中文摘要均合理）；2126 失败于 `analysis.quality` schema 校验（模型输出不符合 strict schema）。水位：ok 4 / skipped 0 / error 11 / pending 212。发现设计偏差：error 重试被 `analyzedAt < source_updated_at` 条件挡住，瞬时失败（token/输出校验）不会下轮自动重试，要等工单在 Lark 侧更新。已修复：候选与 pending 统计的 watermark 条件对 `status='error'` 豁免，dev 库验证 pending 212→223（+11 即全部 error 记录），server 677 + tsc 通过 | worker 常驻方式待定（pm2 未安装）；待下轮观察 error 重试与 2126 复跑 |
| 2026-09-03 | v7 | in_progress | v7 范围修正：已有 `lark_ticket_thread_syncs` 快照的工单**不再排除**（用户澄清）——候选条件删掉 `NOT EXISTS thread 快照` 分支，处理时由 `threadContext.ensure` 走原增量逻辑补 thread 数据（10min 内复用 cache / 超期 incremental+60s overlap / >24h full reconcile / 拉取失败回退 stale_cache）。dev 库验证 pending 223→1820（=1841 总量 −17 Cancelled/Rejected −4 已 ok）；server 688 + tsc 通过 | 待调大 batchLimit 消化 backlog；worker 常驻方式待定 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单测 | 通过 | `vitest run lark-ticket-shadow-summary` 9/9 | mock ACP/thread/store，未触真实 Lark/Kimi |
| 全量测试 | 通过 | `pnpm --dir server test` 668/668 | octo-kimi-execute-mcp 单次并行抖动失败，复跑通过，与本次改动无关 |
| 静态检查 | 通过 | `pnpm --dir server build` (tsc) | - |
| 运行时验证 | 未执行 | - | 需设 `LARK_TICKET_SHADOW_SUMMARY_ENABLED=true` 后观察 shadow_ai 写入 |

## 关联

- docs/ai-dev/prompts/support-intent-analysis-v2.md
- scripts/intent-analysis/analyze_intents.py（离线同款提示词批量分析脚本）
