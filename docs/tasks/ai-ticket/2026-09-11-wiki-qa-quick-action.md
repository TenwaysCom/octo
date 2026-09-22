---
title: "Ticket wiki 问答 Quick Action"
module: "ai-ticket"
status: done
requirement_version: 8
created_on: 2026-09-11
updated_on: 2026-09-22
closed_on: 2026-09-22
owner: Codex
related:
  - "../../ai-dev/lifecycle/current-system-technical-objects.md"
---

# Ticket wiki 问答 Quick Action

## 目标

当前v8仅精简 Wiki 模型上下文的消息 ID，保留原快照用于追溯。v7在提取日志基础上增加重排输入/输出专用日志与独立开关，覆盖双模式，供后续导出；保留v5范围：在v4的10篇本地召回/4组重排基础上，通过WIKI_QA_RERANK_MODE切换通用Chat Completions和专用rerank协议。保留模型提取和回答、现有摘录/超时/连接行为。

## 验收标准（v5）

- [x] MODE=general（默认）沿用Chat Completions，MODE=rerank发送query/documents/top_n，解析index/relevance_score。
- [x] 两套协议配置与错误隔离，拒绝非法模式、缺失专用配置、越界/重复索引、非法分数；无自动切换或重试。
- [x] 专用分数不冒充适用性/证据核验，保守返回历史参考与待确认条件；保留来源和最多3篇限制。
- [x] 定向测试/Server构建/差异检查通过；明确未执行真实模型、部署或30秒验证。

### v4 验收（历史证据）

- [x] 本地召回最多10篇，按现有顺序仅前4组进入重排；拒绝返回未提供给模型的候选ID。
- [x] 重排URL/model/key独立配置，默认glm-5.3-flash；提取和回答保持原共享配置。
- [x] 保留原每篇摘录、证据校验、最多3篇答案来源、超时策略、SSE与FE行为。
- [x] 定向单元/模拟集成测试、Server构建与文档差异检查通过；不据此声称真实接口兼容、30秒或已部署。

### v1原功能验收（历史证据，不替代v4）

- [x] Server 本地全文召回、模型重排，最多三篇且不凑数；来源编号由 Server 分配（真实文件读取＋mock 模型测试）。
- [x] 允许 draft，并保留草稿、历史参考、环境及证据局限。
- [x] 使用用户给定回答规则；无模型工具、ACP 会话或业务写回。
- [x] FE 新入口、一轮生成、失败重试与来源显示已接入，Server 取消与完成事件已有测试。
- [x] Server / FE 测试与构建通过，标明真实模型与浏览器验证边界。
- [x] 真实模型三阶段生成及真实 Ticket 页面完成、来源显示、重开、取消后重试均已验证。

## 背景与范围

既有 PostgresSupportKnowledgeStore 查询 PostgreSQL 的批准知识块；llm-wiki 是外部 workspace 的 Markdown 知识库，两者不是同一数据源。此次保留既有 Answer / Document，新增独立动作。

## 方案与决策

- 用户确认 Server 检索＋模型重排、允许草稿、自动从 Ticket 提取问题、提取和回答复用问题总结provider/model，重排使用独立配置。
- 读取 SUPPORT_QA_EU_WORKSPACE_DIR 下 docs/llm-wiki；以 concepts 为命中单位，index/entities 只辅助定位，raw 只供证据核对。
- 三条独立 workflow_prompts：extract、rerank、answer；初始化只补缺失，不覆盖管理员模板。
- 关键词召回最多10篇，仅前4组原有格式的证据包交给重排模型；中英文分词后标题4、对象/流程/标签3、正文2，匹配导航链接加1。同分按路径稳定排序。
- 每篇正文最多2400字符，检查最多12个来源后按问题相关性选最多3个原始来源，共享2400字符摘录预算，保留截断及未核对标识。只支持 schema 使用的 frontmatter 标量与字符串列表；无法识别的状态/环境保留未知。无新增依赖或向量数据库。
- 原始 Ticket 只取“线程消息”节；Shadow AI 分析标为参考，不能被混入原始证据。
- 新动作复用现有鉴权、Ticket SSE 和进程内一次性运行历史；用户审核后自行使用草稿。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-11 | v1 | in_progress | 已实现文件读取、三阶段调用、动作目录及 FE 入口；检索/编排21个测试通过。 | 补齐跨层集成、全量测试与实际知识库验证。 |
| 2026-09-11 | v1 | in_progress | 新测试的环境枚举与空数组推断导致 tsc 类型错误；已显式标注 fixture 类型。 | 等待构建复核。 |
| 2026-09-11 | v1 | in_progress | 补齐跨层测试时，新增 list 断言暴露 controller fixture 缺少 listSessions mock；已补齐。复核识别脱敏占位符与引用括号、raw 别名与原始证据边界，增加对应回归。 | 当前全量检查通过，详见验证表。 |
| 2026-09-11 | v1 | in_progress | 实际 wiki 以“UK Odoo 17，PL报表不显示40500科目”只读查询，召回20篇候选，预期科目配置页排名1；ticket-1192 摘录包含分组依据。 | 未据此声称模型 Top 3 或最终答案已通过真实验收。 |
| 2026-09-11 | v1 | in_progress | 使用已配置 zcode/glm-5.3-flash 做真实模型验收时，提取阶段因 EAI_AGAIN 失败；沙箱外重试未启动，被自动审批拒绝。 | 审批理由：内部 wiki/历史工单资料发送到未确认可信的智谱 API，缺少该具体目的地的数据发送授权。没有绕过审批。 |
| 2026-09-11 | v1 | in_progress | 用户授权发送脱敏 wiki/历史证据后，智谱三阶段均返回200；首轮回答混入多事故知识页无关分支，且未确认模块更新前提。已限制回答知识片段为所选原始来源关联段落，增加 conditionsMatched 保守降级与提示词约束；新增2个回归，全量811通过。 | 使用真实模型重跑验证；不把 HTTP 成功当作答案质量通过。 |
| 2026-09-11 | v1 | in_progress | `wiki-qa-live-refined-20260911` 完成三阶段，选中2篇独立知识页；回答聚焦 group by，模块更新资料降级历史参考，含来源编号和草稿状态，并询问现场 group by 条件。 | 单一历史问题样例通过人工阅读核对；仍有简洁性优化空间，不代表全面模型评测。 |
| 2026-09-11 | v1 | in_progress | 本地正常插件登录 start/approve/complete/profile 全部200；初次 approve401 因验收脚本遗漏既有 master-user-id 请求头，补齐后通过，未改鉴权。启动当前构建 Server3040 和 FE4173。 | 无指定 ext-dev-profile，使用全新临时无头浏览器，不读取导出 cookie/token。真实 Ticket1192 页面执行被自动审批拒绝，理由是此前授权未明确覆盖真实 Ticket 上下文/关联聊天外发，已请求具体授权。 |
| 2026-09-11 | v1 | blocked | 连续三轮 Goal 均受同一具体数据外发授权阻断；未收到真实 Ticket1192 上下文及关联聊天发送到智谱 API 的确认。独立模型验证与测试已完成，未重试被拒绝的页面执行。 | Goal 标记 blocked；取得授权后恢复真实页面点击、SSE、来源显示及重开/取消/重试验收，不将当前部分验证视为完成。 |
| 2026-09-11 | v1 | in_progress | 用户明确回复“确认授权”，解除真实 Ticket1192 上下文及关联聊天发送智谱 API 的阻断；正常3040/4173登录各阶段全200。验收脚本补齐列表分页后，在1905条同步记录中定位目标并点击真实 wiki 按钮，已收到200 SSE。 | 等待实际生成及重开、取消、重试完成。 |
| 2026-09-11 | v1 | in_progress | 真实 Ticket1192 首次运行 `c7db1a4c-a1f2-4e28-93ac-d05a00f5ed17` 完成；提取7743ms、重排32411ms、回答19914ms，返回1篇草稿/历史来源。页面呈现回复、来源编号与路径、审核提示；关闭重开 load200 且来源保留。 | 验收脚本同名按钮 strict-mode 冲突已用 exact 定位修正，非产品故障。 |
| 2026-09-11 | v1 | in_progress | 取消运行 `a2a57883-6f97-4f95-9c5a-208b54c87975`：stop200，页面已停止，日志 AI_RUN_CANCELLED；重新执行启动独立运行 `76dfe038-555a-4aba-8b40-c4f1688a6527` 并返回200 SSE。 | 等待重试完成。 |
| 2026-09-11 | v1 | done | 重试运行 `76dfe038-555a-4aba-8b40-c4f1688a6527` 完成：提取9711ms、重排56369ms、回答27989ms，生成2篇来源及审核提示；脚本正常退出0，日志 WEB_AI_RUN_FINISHED。完整本地 FE → Server → 智谱 → SSE → 页面链路及重开/取消/重试已跑通。 | 未部署或提交。使用正常插件登录协议的临时无头浏览器，不包含专用扩展 profile 的登录 UI 验收；没有读取导出浏览器 cookie/token 或执行 Ticket/wiki 写回动作。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 全量测试 | 通过 | `pnpm --dir server test`：811通过，1跳过；158测试文件通过，1跳过 | 包含当前工作区其他任务；Hermes 原生协议测试按既有条件跳过。模型为 mock。 |
| Server 构建 | 通过 | `pnpm --dir server build` | tsc 含 src 下测试类型检查 |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：37通过 | 项目默认 node --test 入口；不是登录态浏览器 E2E |
| FE 构建 | 通过 | `pnpm --dir fe build` | Vite production bundle |
| 差异检查 | 通过 | `git diff --check` | 保留已有 ACP 等未提交改动；未提交或部署 |
| 实际 wiki 文件检索 | 通过 | 预期页 `concepts/accounting/account-config-report-mapping-and-20030-residuals.md` 排名1；其首条来源为 `raw/transcripts/ticket-1192.md`，含分组依据；无 Shadow AI 分析节 | 这是关键词候选召回与原始证据核对，不是模型重排结果 |
| 首轮真实模型连通性 | 原阻断已解除 | `wiki-qa-validation-20260911`：WIKI_QA_MODEL_FAILED / ZCODE_REQUEST_FAILED，底层无凭据连通性检查 EAI_AGAIN；沙箱外调用被自动审批拒绝 | 验收原计划使用脱敏测试问题与真实 wiki 证据，目的地 `https://open.bigmodel.cn/api/paas/v4/chat/completions`；需用户授权数据发送。该早期阻断经用户明确授权解除，后续结果见下行 |
| 真实模型三阶段 | 已执行 | `wiki-qa-live-approved-20260911` 与 `wiki-qa-live-refined-20260911` 均完成提取、重排、回答；第二轮2篇来源，引用有效，未声称当前已解决 | 脱敏改写问题＋真实 wiki/历史证据；不是页面端到端验证 |
| 真实模型无相关知识 | 通过 | `wiki-qa-live-no-evidence-20260911`：合成问题，14篇词汇候选经真实模型重排后0篇，回答明确无依据且仅提一个补充问题 | 验证不凑满3篇、不编造步骤；候选召回不代表最终相关 |
| 登录态浏览器完整流程 | 通过 | 当前代码3040/4173：正常登录各阶段全200；真实 Ticket1192 点击后200 SSE并显示回复、编号、草稿状态和来源路径；重开load200且来源保留；stop200与AI_RUN_CANCELLED；重新执行完成并显示审核提示。运行ID及耗时见进展记录 | 用户已明确授权真实上下文和关联聊天外发到智谱；使用既有开发身份和真实同步快照。临时 Chromium，非指定扩展 profile。无 Ticket/wiki 写回；运行历史仍遵循既有进程内存生命周期 |

## 提交复核

用户要求提交本任务。共享文件按功能片段暂存，保留 ACP/Hermes、旧 Answer/Document 提示词迁移与运维任务的未提交改动。将暂存版本单独导出验证：Server 构建通过、808项测试通过/1跳过；FE 37项测试通过、构建通过。808与工作区811的差异来自排除其他任务新增测试；本次 wiki 测试均包含在内。真实模型/页面验收使用前述工作区环境，此次暂存版本未额外重复外部模型调用。提交未包含部署或推送。

## 关联

- [技术对象生命周期](../../ai-dev/lifecycle/current-system-technical-objects.md)
- [Server 规则](../../ai-dev/rules/server-code-rules.md)

## 2026-09-21 日志排障：network error 与无过程展示

本轮范围为只读定位原因，未修改应用代码、Nginx 配置或执行部署；原功能交付状态不代表此次故障已修复。

- 正式环境运行 `bd9dead8-ba94-4c98-9c90-32f6ace30d86`（`web_run_71edd5cf-175e-4a2c-8785-ebcf9fd909af`）在 2026-09-21 16:10:27 启动；`/home/deploy/projects/octo/server/logs/app.2026-09-21.1.log` 记录 extract 27,011 ms、rerank 151,545 ms、answer 111,308 ms，三个模型请求均 200，16:15:18 `WEB_AI_RUN_FINISHED` 为 `completed`。
- `journalctl -u nginx --since '2026-09-21 16:09:00' --until '2026-09-21 16:17:00'` 中正式域名的 ai-sessions 请求于 16:11:27 报 `upstream timed out (110: Connection timed out) while reading upstream`，距开始恰好 60 秒。`/var/log/nginx/error.log` 为空，实际证据来自 systemd journal。
- 正式环境同日 api 日志显示 16:16:14 对同一 run 执行 `/load`，200、2 ms。这与断流后后台继续完成、重开恢复答案吻合。
- 当前 `lark-ticket-ai.controller.ts` 断开时只取消观察，不取消后台 run；`web-ai-session-runs.ts` 在进程内保存结果供 load 返回。SSE helper 没有心跳，也没有 `X-Accel-Buffering: no`；正式 Nginx `/api/` 未配置读超时或关闭缓冲。
- `wiki-qa.service.ts` 三阶段等待 JSON completion；wiki 分支直到完整答案生成才 emit answer/done，没有阶段进度或 thought 事件。ZCode adapter 仅取 `message.content`，没有流式 reasoning 传递。因此无过程展示是当前实现缺口。
- 建议后续修复：SSE 定时心跳及禁用代理缓冲，展示提取/检索/重排/生成阶段进度，断流后按已有 run 自动恢复状态和结果，避免将连接错误等同于任务失败。此处仅记录建议，未执行。

验证边界：已核对正式应用日志、Nginx journal、磁盘配置与当前源码；未重新触发模型、未执行浏览器 E2E、未运行应用测试。确认本次样本的代理超时，不据此断言所有历史 network error 原因相同。

## 2026-09-22 耗时拆解

目标：解释前述正式环境约五分钟样本的耗时，核对模型调用次数、候选量、输入构造、超时和日志边界。本轮为排障分析，不修改运行逻辑或配置。

- 已完成日志与静态代码核对：正式日志 `app.2026-09-21.1.log:6584/6609/6621` 的三阶段分别 27.011、151.545、111.308 秒，合计 289.864 秒；任务按秒级日志约 291 秒，非模型阶段总计约 1 秒量级（时间戳精度不足以给出精确值）。本地召回在 extract 完成的同一秒记录 candidates=20。
- provider 为 zcode，日志模型为 glm-5.3-flash；正式磁盘 `.env` 的单次 timeout 为 350000 ms。该值是每次调用的中止上限，不是固定等待，也不是整轮超时。未读取或输出凭据；磁盘配置不作为历史进程环境的独立证明。
- 三次依赖调用串行执行：提取问题 → 本地召回 → 模型重排 → 模型回答。service 与 adapter 无自动重试；此次日志没有模型失败或重复调用。正式/测试三个相关源码文件相同，并核对正式 dist 中对应流程与参数。
- 20 篇候选各带最多约 2400 字符 wiki 摘录和总计约 2400 字符原始证据摘录；即两类正文预算合计约 96000 字符，另加元数据与截断标记。这是代码预算，并非该次实测长度。三阶段均传 Ticket 上下文，线程上限约 60000 字符，另含字段等材料；没有整段 prompt 的统一 token 预算。
- 重排要求核对原始证据、环境/条件、冲突并选最多三篇，因此最终三篇并不意味着模型只读三篇；此次实际传入20篇候选。回答仍带 Ticket 上下文和所选证据，前两步未将上下文压缩为后续专用短输入。
- 请求使用非流式 JSON completion，未显式设置 thinking、max_tokens；只解析 message.content。日志未记录 prompt/answer 字符数、usage、reasoning token、首字耗时或上游排队信息。不能断言此次超时由模型思考、输入长度或排队中的某一项单独导致；已确认延迟集中于外部 completion 等待，重排与回答合计占模型耗时约91%。adapter duration 在 fetch 返回后取值，service duration 覆盖完整 JSON completion；本次二者仅差1–2ms。
- 作为有限对照，测试环境9月的11次非合成名称真实模型完整运行，三阶段模型耗时合计40.269–159.900秒，中位85.311秒；问题和材料不同，不能作为同输入性能基准。正式目录可见9月日志仅找到这一次完整 wiki 模型样本。

建议顺序：先增加安全性能指标（阶段、输入/输出长度、token usage、完整耗时），再评估候选精简、上下文去重和分阶段模型/推理预算。缩短耗时的改动必须复核召回与证据质量；心跳/进度/流式展示只改善连接和等待体验，不能据此宣称降低模型总耗时。

验证边界：静态源码/正式 dist/既有日志核对完成，`git diff --check` 通过；没有访问业务数据库重建历史 prompt、没有再次调用外部模型、没有执行性能实验或部署。排障结论已交付，优化建议待实施。

## 2026-09-22 v4 范围收敛与实施

v2/v3的30秒提案（取消模型提取、两阶段5秒/18秒预算、进一步压缩上下文、心跳与恢复等）已被用户本轮范围替代，暂不实施。保留三阶段提取→检索/重排→回答，仅改以下两项：

1. Reader本地召回上限10篇，workflow取前4组交给重排。沿用现有每篇正文约2400字符、原始证据合计约2400字符的摘录规则，保留元数据和限制；答案最多3篇。
2. 新增wiki专属Chat Completions重排adapter，URL默认智谱完整endpoint、model默认glm-5.3-flash。`WIKI_QA_RERANK_API_KEY`未设置且URL精确为默认地址时复用`ZCODE_API_KEY`；自定义地址不继承其他密钥，无专用key时不发Authorization。默认智谱地址缺key在请求前失败，禁止自动转发重定向。配置和请求错误不输出payload或凭据。

配置名保留`WIKI_QA_RERANK_URL`、`WIKI_QA_RERANK_MODEL`、`WIKI_QA_RERANK_API_KEY`、`WIKI_QA_RERANK_TIMEOUT_MS`。本轮不压缩超时，未设置专用timeout时继承原`LARK_TICKET_SUMMARY_TIMEOUT_MS`有效值，否则60000ms；此前5000ms仅为已搁置的性能预算，不作为此次默认值。显式非法专用配置失败，不静默回退。

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-22 | v4 | in_progress | 已确认只改10篇/4组和独立重排配置，保留现有未提交排障记录；重开受影响验收项。 | 实施定向代码和测试；不重跑外部模型、不部署。 |
| 2026-09-22 | v4 | done | 已实现10篇本地召回/前4组重排、独立OpenAI兼容Chat Completions adapter和配置文档；6文件70项定向测试与Server构建通过。 | 未调用真实供应商、未部署；不承诺30秒或答案质量不变。 |

### v4 验证证据

| 类型 | 结果 | 边界 |
| --- | --- | --- |
| 定向单元测试与mock integration | 6文件70项通过：wiki-qa-rerank-client、ticket-summary-client、zcode-chat-client、wiki-knowledge-reader、wiki-qa.service、lark-ticket-wiki-qa | 覆盖环境变量只切换重排、10/4限制、未发送候选ID拒绝、原证据/引用规则、缺key/非法配置、自定义地址密钥隔离、HTTP异常/截断/超时/取消；fetch为mock，不代表真实兼容或性能。 |
| 静态构建 | `pnpm --dir server build`通过 | TypeScript编译，不代表部署。 |
| 文档与差异 | `git diff --check`通过，更新server/.env.example、Server规则与技术对象记录 | 未修改实际.env或Nginx，保留既有排障记录。 |
| 真实模型、浏览器E2E、全量Server测试、部署验证 | 未执行 | 本轮执行与改动匹配的定向测试；没有外发Ticket材料或切换运行环境。 |

测试期间曾用全局fake timer总数断言请求timer已清理，因共享日志组件的timer导致误报；改为验证本请求timer被clearTimeout清理后通过。未修改运行逻辑来规避该测试。后续需用真实样本评估缩小候选输入对召回和回答质量的影响；本轮不实施此前30秒方案的其他部分。

### 2026-09-22 10:59 重排404排障

用户报告“Wiki 问答模型调用失败”。测试环境`app.2026-09-22.1.log:1262–1267`，actionRunId `5c4a3522-8ec6-4778-b33b-2a993b457904`：extract成功37333ms，召回10篇/重排4组；随后`BAAI/bge-reranker-v2-m3`在135ms返回404，错误码`WIKI_QA_RERANK_REQUEST_FAILED`，回答阶段未执行。

只读检查发现server/.env有两组重复URL/model定义，后一组是SiliconFlow的`https://api.siliconflow.cn/v1`与BGE reranker；日志模型与后一组一致。配置变量要求完整endpoint，当前adapter直接POST配置URL、不追加路径。因此当前地址缺少操作路径。同时存在第二层协议不兼容：现有adapter发送Chat Completions的messages/response_format并解析choices.message.content，BGE模型在SiliconFlow使用`/v1/rerank`的query/documents和results[index,relevance_score]，不能只把URL改为/rerank就完成接入。

证据：[SiliconFlow官方rerank契约](https://docs.siliconflow.cn/docs/api/rerank-post)。这次不是此前Nginx60秒超时；日志没有支持将其归因为密钥无效。前端通用错误由wiki service归一化产生，底层404只在adapter日志中保留。

兼容现有实现的恢复方式：使用支持Chat Completions JSON输出的模型及完整endpoint，确保使用同供应商密钥；恢复默认智谱时不能继续使用SiliconFlow专用key。若继续用BGE，则需要新增专用rerank协议适配并保留证据/条件核验，属于下一步代码需求。本轮仅诊断，未改用户.env、未更换模型、未重新外发材料。候选裁剪功能已在此真实运行日志得到10/4证据，尚无该轮完整回答成功证据。

## 2026-09-22 v5 双机制重排

用户明确要求两套机制并通过配置切换。新增`WIKI_QA_RERANK_MODE=general|rerank`，默认general；URL始终为完整endpoint。general默认智谱/glm-5.3-flash；rerank必须显式配置URL与model，不隐式将glm模型用于专用接口。既有key/timeout规则继续，专用模式不继承ZCODE_API_KEY。

Adapter只负责协议请求和形态校验，返回discriminated result；workflow负责将候选索引映射回证据ID。专用模型仅给相关性次序/分数，不能生成conditionsMatched=true；入选候选保留既有原始证据，统一标historical_reference并说明未逐项核验适用条件。零结果仍走既有无证据回答，不能把失败伪装成零结果。除新增协议适配外不新增模型核验轮次、不改其他阶段。

状态：done；v5本地实现与定向验证完成。保留所有现有未提交实现与排障记录，用户运行.env未自动切换或改写。

### v5 验证与交付

- Adapter增加general/rerank模式、独立请求体/响应校验，日志带mode；workflow通过类型化输入传query和前4组document，返回专用分数时映射为历史参考证据并保留待确认前提。general prompt与原证据选择逻辑保持。
- 已更新server/.env.example的两套互斥配置示例、Server规则及技术对象生命周期；MODE默认general，专用模式显式URL/model，密钥与timeout沿用v4规则。
- 定向单元/mock integration：同v4六个测试文件共88项通过。新增专用请求字段与响应排序、无结果、越界/负数/非整数/重复索引、过多结果、非法分数、错误协议、缺模式/URL/model、实际adapter到workflow的证据映射与保守适用性验证。
- 静态检查：`pnpm --dir server build`、`git diff --check`通过。初次构建暴露联合类型分支未充分收窄，已改为按results字段分支；构建及定向测试重跑通过。
- 未执行真实SiliconFlow/智谱调用、浏览器E2E、全量Server测试或部署；没有修改实际.env。需运维设置MODE=rerank、URL=https://api.siliconflow.cn/v1/rerank、model=BAAI/bge-reranker-v2-m3并保留对应专用key，清理重复配置后重启目标Server进行真实验收。此记录不声明用户当前环境已修复或30秒达标。

### 2026-09-22 11:10 专用模式再次404与配置修复

最新真实运行`fc8bb050-0be0-4210-b0ca-73988a43a86e`（app.2026-09-22.1.log:1493–1498）：extract成功21297ms、10篇召回/4组重排；mode已为rerank，BGE请求160ms返回404，说明模式切换已生效但地址仍错误。server/.env最后生效的URL仍为`https://api.siliconflow.cn/v1`。

已仅把该测试环境URL改为`https://api.siliconflow.cn/v1/rerank`，保留用户其余配置及凭据。通过编译后的真实adapter向该endpoint发送两条水果/交通的合成句子（不含Ticket/wiki资料），得到合法专用results，相关文档index=0排首位。沙箱内首轮因网络限制失败；获工具自动审批后在可联网环境验证成功，未打印密钥或业务payload。

确认3030端口归属PM2 `octo-server-staging`，cwd为本测试仓库/server；仅重启该服务加载.env，启动PID为1293293，正式服务未操作。真实完整Ticket问答尚未重跑；合成接口成功不等于端到端答案验收。当前故障修复是运行配置调整，无新增应用代码。

## 2026-09-22 v6 提取输入输出专用日志

用户要求增加独立日志和环境变量开关，保存提取问题的输入与输出，便于后续导出 Excel。最近三次历史日志仅有阶段、模型和耗时，无法恢复当时输出；不重跑模型冒充历史结果。Excel 导出待有原始记录后继续。

验收标准：
- [x] 默认关闭；开启后独立按日轮转，输入、输出和失败通过 actionRunId 关联。
- [x] 保存实际渲染的提取 prompt、模型返回文本和校验结果；不记录重排/回答 payload，不记录认证头或原始异常。
- [x] 日志文本应用脱敏；关闭时不创建专用文件；日志失败不改变问答结果。
- [x] 覆盖开关、成功、无效输出、模型失败及隔离测试，完成构建；明确运行启用边界。

### v6 验证与启用

- 新增 `WIKI_QA_EXTRACT_LOG_ENABLED`（仅 true 开启）与 `WIKI_QA_EXTRACT_LOG_FILE`（默认 `./logs/wiki-qa-extract.log`）。进程共享懒加载 sink，按现有 pino-roll 日轮转，不随请求创建 worker。input 保存渲染 prompt；output 保存返回 content、model、valid、durationMs；failed 保存安全错误码。全部关联 actionRunId，仅覆盖提取阶段。
- 沿用支持材料邮箱/订单引用脱敏，并屏蔽常见内嵌 Bearer、密钥字段和 URL 用户凭据；不读取或写入请求认证头，正则脱敏不保证任意业务文本完全匿名。失败关闭专用 sink 并写安全告警，不影响问答返回。
- 定向单元/mock integration：4个文件44项通过；Server tsc 构建和 diff whitespace 检查通过。初次构建发现 Pino logger 不支持 error 事件，已改为监听 transport 的 error，重跑通过。合成数据真实落盘验证：独立日轮转文件、input/output 两条可解析 JSON、脱敏通过；临时验证文件已删除，未调用模型。
- 当前测试仓库 `.env` 已设 `WIKI_QA_EXTRACT_LOG_ENABLED=true`，确认 PM2 cwd 为 octo_test/server 后仅重启 octo-server-staging；`/api/health` 返回200。最初误查未注册的 `/health` 返回404，按代码改用正式健康路由后通过。没有重启正式服务。
- 尚未执行开启后的真实 Wiki 问答或浏览器 E2E；运行启用不等于已采集真实输入输出。历史三次输出未留存，无法补回，因此没有生成冒充历史数据的 Excel；后续真实调用记录可用于导出。未跑全量Server套件。

## 2026-09-22 v7 重排输入输出日志

用户要求重排也记录输入输出。增加独立开关及日志文件，覆盖 general 的实际 messages 请求和专用 rerank 的 query/documents 请求与响应；沿用脱敏、失败隔离和 actionRunId 关联。不修改模型、候选数或超时。

- [x] 默认关闭，测试环境启用；输入无认证头，输出与模式/模型/耗时可关联。
- [x] 覆盖双模式与失败，定向测试、构建、合成落盘验证通过，再重启测试服务。

### v7 验证与运行启用

- Adapter在发送请求前记录实际 requestBody；成功 HTTP 响应记录解析前 output 文本，非法 JSON 也保留。后续协议/索引校验失败关联 failed 事件；output 不代表业务校验通过。HTTP 错误仅记录状态与安全错误码，不保留错误正文或认证头。general 与 rerank 均带 mode、model、actionRunId 和响应耗时。专用接口原始分数顺序保留，业务排序不受影响。
- 新增独立 `WIKI_QA_RERANK_LOG_ENABLED` 与 `WIKI_QA_RERANK_LOG_FILE`，默认关闭，路径 `./logs/wiki-qa-rerank.log`，沿用提取文本脱敏和按日轮转。日志写入失败不改变模型调用结果。提取开关与重排开关相互独立。
- 单元/mock integration：4个文件85项通过，包含双协议输入/响应、非法JSON、HTTP失败、关闭不创建sink及同步/异步日志失败隔离。Server构建与diff检查通过。合成调用adapter并真实写文件，验证双模式共4条事件及脱敏；未发起外部模型调用，临时文件已删除。
- 测试环境 `.env` 已启用重排日志；确认 PM2 cwd 为本仓库 server 后重启 `octo-server-staging`，`/api/health` 返回200。正式服务未操作；尚未执行真实问答/浏览器E2E或全量Server套件。后续真实重排调用才会生成该专用文件。

## 2026-09-22 v8 Wiki 消息上下文精简

仅 Wiki 问答使用 M1/M2 短标签替换消息元数据中的长 ID，同步转换回复关系，移除 Allowed evidence Message IDs 列表。正文、角色、时间、顺序和既有截断上限保留，服务端原快照保留长 ID；不改变 Summary/ACP 输入。

- [x] 短标签和回复关系正确，快照外回复明确标注；不修改原快照。
- [x] Wiki 与共享 Summary 路径定向回归及构建通过；测试服务重启验证。

### v8 验证与启用

- Wiki 分支显式选择短 ID 格式；M 标签按原固定快照顺序生成，前向/后向回复都正确引用，快照外回复使用独立 E 标签并标明 outside snapshot。未替换正文中的任意文本或修改数据库快照，追溯可通过固定快照及序号还原；未新增映射持久化。原有60000字符/首10000尾50000截断策略保留。
- 定向单元/mock integration：wiki集成、Ticket AI session和wiki service三个文件共50项通过；覆盖回复关系、角色时间正文保留、原快照不变、Summary仍传真实ID。Server构建与diff检查通过。
- 确认 PM2 cwd 为本测试仓库后，仅重启 octo-server-staging；/api/health 返回200。未发起真实模型调用、浏览器E2E或全量Server套件，未量测延迟改善；不能据此声称30秒达标。
