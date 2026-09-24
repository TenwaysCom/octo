---
title: "Lark Ticket 影子模式 AI 问题总结后台任务"
module: "ai-ticket"
status: done
requirement_version: 14
created_on: 2026-09-03
updated_on: 2026-09-24
closed_on: 2026-09-24
owner: TBD
related:
  - "docs/ai-dev/prompts/support-intent-analysis-v2.md"
---

# Lark Ticket 影子模式 AI 问题总结后台任务

## 目标

v14：Wiki 问答与 Shadow 共用可配置候选召回上限 WIKI_QA_RECALL_LIMIT，默认 20；重排 Top5、最终最多3篇不变。此前 v13 固定最多10篇的范围被替代。

v13：Shadow 最终分析前复用 Wiki 问答 retrieve 的问题提取、召回、重排及原始证据筛选；最多三篇相关 Wiki 与 thread 一起分析。用户确认 Wiki 失败时基于聊天继续，并明确标记 Wiki 不可用。当前 Ticket 事实与 Wiki 历史参考分开；保留精简输出和正式总结现状。

v12：正式问题总结的 thread 输入与 Shadow 共用完整消息选取、短引用、精简、完整性元信息和实际输入证据回映射；正式分析输出/写回、Ticket 字段和用户请求保持原行为。v11 的“正式总结上下文不变”范围被本次请求取代。

v11：Shadow 一次 JsonCompletionClient 调用在现有意图、结果、质量、总结上新增业务风险与回复时机（各三个字段）。参考 Wiki 复用短引用/回复关系与堆栈精简，按完整消息块保留初始诉求和最新消息，补齐完整性、字段脱敏、实际输入证据校验和安全诊断。只写 shadow_ai，正式 Ticket AI、Wiki 行为、调度和模型参数不变。

## 验收标准

- [x] v14 Wiki/Shadow 共用默认20篇、可配置的召回上限；配置校验与边界测试通过，最终证据最多3篇。

- [x] v13 Shadow 复用现有 Wiki retrieve，空结果正常继续，异常显式降级，无 Wiki answer 调用；最终分析使用相关资料及局限。
- [x] v13 保存 Wiki 来源与检索状态，白名单透出 FE；W 引用与当前 thread 证据隔离并校验，旧记录兼容。
- [x] v13 单元/模拟集成、server build 与 FE check 通过；真实模型和部署边界分别记录。

- [x] v12 正式总结与 Shadow 使用同一 thread 函数，原始快照不变，省略证据拒绝，短引用写回原 ID；数据库自定义提示词保留，运行时追加服务端引用契约。
- [x] v12 目标测试及 server build 通过；Wiki/ACP 和正式写回冲突门禁保持原行为。

- [x] Shadow 专用数据库 prompt key 与默认模板；正式总结自定义提示词不被覆盖；保留旧结果可读。
- [x] M 短引用回映射、reply 链、完整消息预算、截断范围与快照新鲜度可追溯；长消息不静默丢尾。
- [x] 字段归一/脱敏、描述回退与去重；保留催办、升级和确认信号。
- [x] 精简 businessRisk/replyAdvice 校验、意图父子类型、证据去重/实际输入校验、安全缺失/类型/范围诊断。
- [x] 现有读取白名单和 FE 展示风险、建议、依据与时间；旧数据“未评估”。
- [x] 服务端目标测试/构建与 FE check 通过；运行时模型效果与部署另记边界。

## 背景与范围

v1-v10 ACP 等方案为历史记录，已被当前直连 Ticket Summary provider/model 的实现替代。此次保留已暂存的 2026-09-22 只读分析。数据库配置只读核实，不能以代码默认提示词冒充运行时提示词。

## 方案与决策

- v11 取代旧“复用正式总结提示词”与前缀截断方案：新增独立 Shadow 提示词、输出版本和规则版本；不迁移覆盖旧共享自定义提示词，不自动重算。
- 风险等级 1–9 或 null，与 confidence 独立；回复建议五种，均输出 rationale 与 evidenceMessageIds。
- 60,000 字符消息预算保留完整块，最新消息优先于初始消息，再按倒序补充可容纳消息及 reply 父消息；省略范围、完整性、同步时间由服务端生成，不让模型自报。
- v14 在最终 Shadow 分析前增加 Wiki 提取/召回/重排/证据筛选（替代 v11 一次调用假设）；最终结果仍一次结构化生成，result/quality 不增加证据字段。
- 后续：result/quality 独立证据、effort/token/分段耗时、快照/提示词版本调度与有限退避。本次无数据库迁移执行、无部署、无真实模型调用。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-24 | v14 | done | Shadow Wiki 召回/重排与降级已完成；Wiki/Shadow 共用默认20篇可配上限；187项目标测试与两端检查通过。 | 未部署、未修改实际配置或验证真实模型；详见 v13–v14 记录。 |
| 2026-09-23 | v12 | done | 正式总结与 Shadow 共用 thread 处理，目标 85 项与 server build 通过。 | 未部署或验证真实模型；正式输出与数据库提示词不变。 |
| 2026-09-23 | v11 | in_progress | 用户确认上下文精简、风险/回复建议及必要校验诊断；已重新打开验收。 | 待实现与本地验证；历史证据不代表 v11 通过。 |
| 2026-09-23 | v11 | done | 本地实现完成，服务端目标 85 项、两端构建与 FE 检查通过；只读确认当前共享提示词为自定义内容，完整保留。 | 未部署、未迁移、未验证真实模型；详见本页 v11 交付记录。 |
| 2026-09-03 | v1 | in_progress | 服务/存储/worker 接线完成，9 个单测通过，server 全量 668 测试通过，tsc 通过 | 待真实环境开启观察 |
| 2026-09-03 | v2 | in_progress | v2 新增：shadowAi 经 store/domain 透出到工单列表数据，FE pipeline 在意图识别/问题总结缺正式输出时回退展示影子结果（状态"影子·已生成"），正式字段优先；server 671 + FE 138 测试通过 | 待真实环境开启观察 |
| 2026-09-03 | v3 | in_progress | v3 新增：shadow 轮询默认改为每 1 小时一轮（`LARK_TICKET_SHADOW_SUMMARY_POLL_INTERVAL_MS` 可覆盖）；`platform-sync-sources` list 响应附带 `shadowSummary` 水位（ok/skipped/error/pending/lastAnalyzedAt/enabled，读取失败自动省略不拖垮列表），FE #sync 页新增「Lark Ticket AI 分析」卡片；server 673 + FE 138 测试通过，tsc 通过 | 待真实环境开启观察 |
| 2026-09-03 | v4 | in_progress | v4：worker 入口解耦，shadow 循环不再依赖 `scheduler.enabled`（scheduler 关闭时只跑 shadow，满足"其他数据不定时同步"）；`.env.example` 补 shadow 配置说明。冒烟两轮（dev 库）：候选捞取→thread ensure→shadow_ai 落库链路全部走通，但 10 张全部 `SHADOW_THREAD_UNAVAILABLE`——master user（Ben Lin）Lark refresh token 失效（code 20026 "refresh token is invalid, it may has been used"），error 状态已正确落库等待重试；server 673 测试 + tsc 通过 | 待 master user 重新登录 Lark 刷新凭据后重跑验证 ok 路径 |
| 2026-09-03 | v5 | in_progress | v5：`scheduler.tasks` 任务级配置落地——`tasks.lark/meegle/github`（enabled + intervalMinutes，覆盖 intervalsMinutes，缺省全开）、`tasks.shadow`（enabled 缺省关 + intervalMinutes/settleMinutes/batchLimit/acpTimeoutSeconds）；shadow 合并进 scheduler 块，env `LARK_TICKET_SHADOW_SUMMARY_*` 保留为覆盖项（开关 env 优先，调参 config 优先）；#sync 卡片 enabled 判定走同一优先级；`it-platform-sync.md` 配置说明更新；新增 4 条测试，server 677 + tsc 通过 | 待重新登录后按新配置跑通 ok 路径 |
| 2026-09-03 | v6 | in_progress | v6 冒烟通过：token 刷新后首轮 considered 5 → summarized 4 / failed 1，ok 输出质量正常（intent+subtype+中文摘要均合理）；2126 失败于 `analysis.quality` schema 校验（模型输出不符合 strict schema）。水位：ok 4 / skipped 0 / error 11 / pending 212。发现设计偏差：error 重试被 `analyzedAt < source_updated_at` 条件挡住，瞬时失败（token/输出校验）不会下轮自动重试，要等工单在 Lark 侧更新。已修复：候选与 pending 统计的 watermark 条件对 `status='error'` 豁免，dev 库验证 pending 212→223（+11 即全部 error 记录），server 677 + tsc 通过 | worker 常驻方式待定（pm2 未安装）；待下轮观察 error 重试与 2126 复跑 |
| 2026-09-03 | v7 | in_progress | v7 范围修正：已有 `lark_ticket_thread_syncs` 快照的工单**不再排除**（用户澄清）——候选条件删掉 `NOT EXISTS thread 快照` 分支，处理时由 `threadContext.ensure` 走原增量逻辑补 thread 数据（10min 内复用 cache / 超期 incremental+60s overlap / >24h full reconcile / 拉取失败回退 stale_cache）。dev 库验证 pending 223→1820（=1841 总量 −17 Cancelled/Rejected −4 已 ok）；server 688 + tsc 通过 | 待调大 batchLimit 消化 backlog；worker 常驻方式待定 |
| 2026-09-03 | v8 | in_progress | v8 错误诊断增强：定位到一票 `SHADOW_OUTPUT_INVALID` 实为 Kimi 配额 403（`[provider.auth_error]`）以流式文本返回被当成模型输出。新增 `SHADOW_ACP_PROVIDER_ERROR` 错误码（捕获路径与"输出文本即 provider 错误且无 JSON"路径都识别）；`SHADOW_OUTPUT_INVALID` 各分支携带 `outputChars` + 截断 `outputPreview`（300 字符），写入 `shadow_ai.error` 并随 warn 日志输出；空输出单独报 "output was empty"；domain `parseLarkTicketShadowAi` 透出 `errorMessage/outputChars/outputPreview`。server 691 + tsc 通过 | 待配额恢复后重跑观察 error 分类是否符合预期 |
| 2026-09-03 | v8 | in_progress | 合并冲突处理：保留输出文本的 provider 错误分类，以及 ACP 成功输出的 debug 诊断；诊断只记录 300 字符 `outputPreview`，不记录完整工单/模型输出。目标单测 16/16 与 server TypeScript 构建均通过。 | 未做真实 Lark/Kimi 运行时验证。 |
| 2026-09-03 | v9 | in_progress | v9 FE 展示补全：domain `parseLarkTicketShadowAi` 额外透出 `intentType/intentSubtype`（`intent` 保持合并串兼容 pipeline）；Ticket 详情页右栏新增「影子分析」面板（状态 badge + 意图/子意图/置信度/总结，skipped 显示原因、error 显示 errorCode+errorMessage，底部分析时间/快照/提示词版本元信息）；AI 输出视图行标题区新增 issue 类型、优先级 badge（复用 LarkTicketBadge，有值才渲染）。server 691 + FE 145 测试通过，tsc + vite build 通过 | 待本地联调目检面板与 badge 实际渲染效果 |
| 2026-09-04 | v9 | done | 台账复核确认 v6 已在真实环境获得首轮 4 条成功影子结果，后续错误分类和 v9 FE 投影已合入；当前 Server 全量 146 files / 707 tests、FE 33 files 测试与 production build 通过。 | 常驻进程部署、配额恢复后的持续观测和人工视觉验收是运行运营事项，不阻塞本任务当前验收；如需推进，另建运维任务。 |
| 2026-09-05 | v10 | done | 每张影子任务现在写入 `processingDurationMs`，覆盖成功、跳过与失败；Server API 解析并由详情页显示“耗时”。Shadow 专项 19/19、Server 全量 715/715、FE 33/33 与两端构建通过。 | 现有历史影子结果不会补写该字段；仅新一轮处理会具备耗时。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单测 | 通过 | `vitest run lark-ticket-shadow-summary` 9/9 | mock ACP/thread/store，未触真实 Lark/Kimi |
| 全量测试 | 通过 | `pnpm --dir server test` 668/668 | octo-kimi-execute-mcp 单次并行抖动失败，复跑通过，与本次改动无关 |
| 静态检查 | 通过 | `pnpm --dir server build` (tsc) | - |
| 合并后目标单测 | 通过 | `pnpm --dir server exec vitest run src/application/services/lark-ticket-shadow-summary.service.test.ts src/adapters/kimi-acp/spawn-config.test.ts`：16/16 | mock ACP/thread/store，未触真实 Lark/Kimi |
| 合并后静态检查 | 通过 | `pnpm --dir server build` (tsc) | 不替代运行时验证 |
| 运行时验证 | 通过 | v6：真实环境首轮 `considered 5 → summarized 4 / failed 1`，成功结果已写入 `shadow_ai`；错误记录验证可在后续轮次重试。 | 不等同于常驻部署或长期配额/质量监控。 |
| 台账复核回归 | 通过 | 2026-09-04：`pnpm --dir server test`（146 files / 707 tests）、`pnpm --dir fe test`（33 files）与 `pnpm --dir fe build`。 | 自动化回归不替代长期运行观测。 |
| v10 回归 | 通过 | 2026-09-05：`pnpm --dir server exec vitest run src/application/services/lark-ticket-shadow-summary.service.test.ts src/domain/lark-ticket-ai.test.ts`（19/19）、`pnpm --dir server test`（148 files / 715 tests）、`pnpm --dir server build`、`pnpm --dir fe test`（33/33）和 `pnpm --dir fe build`。 | mock 测试确认处理耗时字段与投影契约；不补写历史 `shadow_ai`。 |

## 关联

- docs/ai-dev/prompts/support-intent-analysis-v2.md
- scripts/intent-analysis/analyze_intents.py（离线同款提示词批量分析脚本）


## 2026-09-22 Wiki与Shadow机制比较（只读分析）

- 范围：用户要求对比当前代码中的Wiki上下文/回答机制与Shadow上下文/总结机制，提出优化点；未授权本轮改Shadow实现。旧任务ACP记载属历史；当前Shadow直接使用共享JsonCompletionClient。本地Shadow service文件与../octo同文件字节一致，数据库覆盖prompt未读取，不把内置prompt当运行时实际prompt。
- Wiki当前本地机制：固定快照与M短标签→问题提取（关键词去重、最多20）→最多10篇全量重排→专用Top5且>=默认0.7→错误签名/主题过滤→最多3篇及相关原始证据→JSON答案/编号校验。提取和回答请求可配置low；general没有分数阈值。新机制本轮未部署。Wiki当前聊天输入仍有60k字符头10k/尾50k截取，并非完整token预算或完美语义摘录。
- Shadow：默认source_updated_at静默3h、每轮5条、每轮后等待1h（可配置）；按Ticket更新时间/错误状态挑选，逐条获取固定快照，一次模型调用输出意图、处理结果、质量和展示总结，仅写shadow_ai。聊天preparedMessages已排序、按ID去重、去删除消息、角色归一和脱敏；Shadow拼接每条前1000字符，聊天总预算30000字符，超出后丢尾部；字段/提示词不在该预算内。保留长ID，未输出replyTo；Issue Description既作上下文字段又作user_message，字符串以外类型被忽略，未回退detailDescription；字段未走聊天同样的脱敏函数。
- 首要证据问题：长消息cause/否定可被静默裁掉，尾部解决确认/重开可完全丢失；不向模型传递快照完整性/新鲜度和结构化截断范围。证据ID校验基于全部preparedMessages，而非实际发送的消息；只有intent带证据ID，result/quality没有各自的证据关联；Shadow意图子类型为自由字符串，未复用正式结果的父子枚举校验，意图证据允许空/重复。
- 建议顺序：①保留初始诉求、处理关键动作、末尾状态/纠正及reply链，用完整消息块和总预算替代前缀裁切，按实际输入ID校验并显式降级缺证据结果；②短标签与回映射、字段归一/脱敏、描述去重、保留影响质量评价的催办/升级消息（不照搬Wiki删寒暄/取3篇）；③分开说明intent/result/quality输出规则及证据，无需立即拆成多次模型调用；④补effort、token/分段耗时/安全schema诊断，严格区分未知confidence与类型错误，不能凭空补高置信度；⑤调度加入快照版本/提示词版本变化判定与有限退避，避免仅聊天变化时总结不刷新、固定错误反复占用批次。
- 运行证据：../octo/server/logs/app.2026-09-22.*.log共38次COMPLETED、6次FAILED（运行次数，非去重Ticket数），成功processingDurationMs中位151422.5、最大293740；2次SHADOW_OUTPUT_INVALID字段均analysis.result.confidence（15:33:39、17:03:35），4次ZCODE_REQUEST_FAILED耗时300344/300615/300579/300388ms。无输出正文，无法判定confidence是缺失/类型/范围哪一种；总处理耗时包含上下文获取，不能全归因于模型或推理预算。octo_test当日Shadow日志含18:34测试样例，排除，不用于实际成功率分析。
- 验证边界：代码/日志只读核对；未运行模型、未写数据库或修改业务代码、未部署。本段仅分析结论，不代表优化已落地。


## 2026-09-23 v11 实施与交付

- 开发完成：独立 `lark_ticket.shadow.summarize` / `shadow-analysis-result-v2`；保留意图/结果/质量/总结，新增业务风险和回复时机各三个字段。默认规则定义位于 [shadow-summary-prompt.ts](../../../server/src/domain/shadow-summary-prompt.ts)，规则版本 v1、实现 promptVersion v5。
- 上下文：与 Wiki 共用短引用渲染和堆栈精简，Wiki 原行为不变；Shadow 完整块预算 60,000 字符（不含字段/提示词/元信息），最新与初始消息优先，按倒序补充消息及可容纳的 reply 祖先。超长块整体省略，不是完整 token 预算或语义摘要；省略范围/完整性/同步时间由服务端生成。preparedMessages 与完整 message ID 不变，模型返回引用校验后回映射原 ID。字段归一、脱敏和描述回退/去重已实现。
- 校验：新输出校验意图父子类型、风险等级、回复枚举，证据去重且仅接受本次呈现消息。result/quality 明确事实边界但未增加证据字段。Schema 诊断区分 missing/type/range，只记录白名单路径与安全原因，JSON 解析错误也不携带原文。
- FE：详情和 Lark 分析区展示风险/回复建议及依据，旧数据未评估；保留分析时间及材料局限，不能作为实时提醒。
- 配置只读核实：当前配置库存在 `lark_ticket.support_qa.summarize` 且与代码默认文本不同；独立 Shadow key 尚不存在。未输出提示词正文或连接信息，未修改数据库。新 key 由正常初始化幂等补入，仅缺失时插入；自定义正式/Shadow prompt 均不覆盖，服务在未初始化该 key 时可使用新内置模板。
- 工作区保护：保留已暂存的 09-22 只读分析与索引变更，以及并行出现的 Lark App 样式/理解区/任务记录改动；本次在 LarkAppAnalysis 仅扩展 Shadow previewLabels。

### 本次实际验证

| 层级 | 结果 | 证据与边界 |
| --- | --- | --- |
| 服务端单元及模拟集成 | 通过 | 8 个目标文件 85 项：Shadow service、上下文、提示词、投影、数据库 seed、Wiki 上下文与问答、正式 AI session；数据库使用 pg-mem，provider/thread 使用 fixture/mock。风险场景证明结构及分离处理，不证明真实模型判断准确率。 |
| 静态检查 | 通过 | `pnpm --dir server build`、`git diff --check`；不代表已部署。 |
| FE 单测与构建 | 通过 | `pnpm --dir fe check`（46 个测试文件与 Vite build）；补充 JSX 渲染后定向 `node --test src/lib/lark-app-render.test.js src/lib/lark-ticket-shadow-ai.test.js` 通过。Vite 仍提示 >500 kB chunk，不影响构建通过。 |
| 配置库只读检查 | 通过 | 仅读取两个 prompt key 并比较文本是否等于代码默认；没有写入或迁移。 |
| 真实模型 / 登录态浏览器 / 部署后验证 | 未执行 | 未调用模型、未执行数据库迁移、未部署或重启；不得宣称生产生效。 |

### 待部署后的人工验收建议

1. 准备新产生分析的 Ticket，打开详情或 Lark 分析区，确认看到风险 1–9/待确认、五类回复建议及依据；旧 Ticket 的缺失字段应显示未评估。
2. 对照高风险已有效回应、低风险反馈承诺逾期、等待补充、重新报障和角色未知等真实消息，人工核对建议与证据，特别检查没有从 confidence 换算风险。
3. 对超长线程核对最新状态保留、省略范围提示；检查分析时间与快照同步时间，不把历史建议当作当前实时判断。

### 失败与近失复核

- 初次 tsx CLI 只读检查触发 sandbox IPC EPERM，改用 `node --import tsx`；数据库连接在授权的沙箱外只读检查中完成。已有 [ERR-20260811-001](../../../.learnings/ERRORS.md#err-20260811-001--tsx-sandbox-ipc-pipe) 覆盖，不新增重复规则。
- 新测试尝试在同一个 pg-mem 库重复初始化整套 DDL，遇到既有 AST 支持限制；改为由生产初始化调用独立幂等 seed helper，测试重复 seed。已有 [ERR-20260904-001](../../../.learnings/ERRORS.md#err-20260904-001--pg-mem-无法在同一测试库重复执行整套-schema-ddl) 覆盖，不新增重复规则。

后续仍未实施：result/quality 独立证据字段、effort/token/分段耗时、版本触发调度和有限退避。旧结果不自动重算，仅聊天变化仍可能不触发更新。


## 2026-09-23 v12 正式问题总结共用 thread 处理

用户要求正式“问题总结”的 thread 消息也采用同样机制。已从 Shadow 提取 `prepareTicketThreadAiContext`，两者直接共用同一实现：完整块预算、最新/初始消息、reply 链、堆栈精简、保留沟通信号、M/E 标签、省略范围与新鲜度。`resolveTicketThreadEvidence` 共用实际输入校验和原始 ID 回映射；preparedMessages 不变。

正式流程保留原 Ticket 字段、用户请求、数据库 key、分析结果结构和写回方法；数据库提示词不修改，渲染后追加服务端短引用契约解释旧 Message ID 示例。正式意图仍须非空且唯一证据，无完整消息可发送时不调用模型。写回前恢复长 ID，保留 snapshotVersion 冲突校验与失败不写入门禁。不新增正式业务风险/回复字段，不改 Wiki/ACP，也不自动重算。

验证：7 个目标测试文件 85 项通过（正式 service 新增 6 项，覆盖长消息/最新纠正/确认、旧模板兼容、M→原ID、四类非法引用、无可用完整块）；`pnpm --dir server build` 和 `git diff --check` 通过。测试使用 mock provider/store/thread，不代表实际模型效果。FE 未改动，沿用 v11 验证，本轮不重复 FE 检查。未写数据库、未部署、未调用真实模型。

验收建议：部署后执行正式“问题总结”，核对长线程最新纠正信息，确认正式结果仍正常保存且证据关联到原消息；结合输入省略提示人工核对事实。此前 v11 的正式上下文不变范围已被 v12 取代。


## 2026-09-24 v13–v14 Shadow Wiki 参考与可配置召回

### 开发结果

- Shadow 直接复用 `createWikiQaService().retrieve()` 的问题提取、Wiki 召回、现有两种模式重排与相关原始证据筛选，最终最多3篇 Wiki 连同 thread 输入一次 Shadow 最终分析。未调用 Wiki answer，未修改正式总结功能。
- Wiki 问答与 Shadow 共用 `WIKI_QA_RECALL_LIMIT`：默认20篇候选，整数1–100；空配置用默认值，非法值明确失败。候选全部交给重排，Top5、专用模式分数门槛和最终最多3篇保持不变。`.env.example` 已说明；实际环境变量未修改。
- 用户明确选择“Wiki 召回/重排失败时继续基于聊天分析，并标记不可用”。空结果为 no_matches，失败为 unavailable，有资料为 matched。共用 actionRunId，只保存安全错误码。
- 服务端在最终提示词后追加 Wiki 资料与事实边界，即使数据库有自定义模板也生效；原模板不覆盖。Wiki 建议使用 [W1] 引用并校验是否本次提供，当前 thread 的 evidenceMessageIds 仍只接受 M 引用并回映射原 ID。历史解决、损失、回复不能冒充当前事实；模型输出保持原精简结构。
- 原始筛选资料以脱敏后的私有 wikiEvidence 保存供追溯，公开投影只增加 wikiContext（状态、来源标题/路径/草稿/适用性/限制）。FE 显示来源及限制；Lark App 在展开更多信息前即显示 Wiki 不可用，旧结果无该字段时不增加误导状态。
- promptVersion v6，业务风险规则版本仍 v1；旧结果不自动重算。正常命中时增加问题提取与重排两次模型请求，最终分析及总 processingDurationMs 包含 Wiki 链路；现有调度、超时和并行策略不变。

### 验证结果与边界

| 层级 | 结果 | 证据 / 边界 |
| --- | --- | --- |
| 单元及模拟集成 | 通过 | 7 个目标文件187项；包含 Shadow51、Wiki service65、reader11、rerank45、投影8、prompt1、database6。模拟串联真实 retrieve 流程，确认20篇进入重排、Top5→最多3篇、无 Wiki answer 调用；覆盖各阶段失败降级、无命中、无效W引用、Wiki与当前消息隔离、配置边界与私有正文不外泄。不代表真实模型准确率。 |
| 静态检查 | 通过 | `pnpm --dir server build`、`git diff --check`。 |
| FE | 通过 | `pnpm --dir fe check`，46个测试文件及 Vite build；含来源/降级信息与实际组件渲染断言。既有 >500kB chunk 提示不影响构建。 |
| 真实模型 / 真实Wiki / 登录态E2E | 未执行 | 本轮 adapter、provider 使用 fixture/mock，不声称实际命中率或业务判断已验收。 |
| 部署 / 数据库 / 环境配置 | 未执行 | 未修改运行数据库提示词、未更改实际环境变量、未部署或重启。 |

### 待上线验收

1. Server 与 Worker 设置同一 `WIKI_QA_RECALL_LIMIT=20`（不设置也默认20），部署新版服务端与 FE，并重启对应进程。Wiki root/provider/rerank 沿用现有配置。
2. 选有相关 Wiki 的新候选 Ticket，确认 Shadow 展示 Wiki 来源与历史局限，人工核对分析引用；执行 Wiki 问答确认其同样采用配置的候选上限。
3. 在测试环境模拟 Wiki 不可读或重排失败，确认 Shadow 仍生成聊天分析并明确显示不可用；确认“无命中”和“失败”不是同一状态。
4. 检查 W 引用可对应本轮来源，历史案例未被写成当前已解决或已回复；正式总结仍仅增加 thread 处理，不意外引入 Wiki 召回。

失败与近失复核：本轮新测试及构建无新增失败；没有需要新增的重复经验条目。
