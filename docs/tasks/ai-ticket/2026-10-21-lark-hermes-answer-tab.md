---
title: "Lark Ticket AI：Hermes Agent AI 页签需求确认"
module: ai-ticket
status: done
requirement_version: 6
created_on: 2026-10-21
updated_on: 2026-10-21
closed_on: 2026-10-21
owner: TBD
related:
  - "./2026-09-11-wiki-qa-quick-action.md"
  - "../acp/2026-09-05-hermes-acp-integration.md"
  - "../acp/2026-09-10-fe-hermes-permission-approval.md"
---

# Lark Ticket AI：Hermes Agent AI 页签需求确认

## 目标与范围

用户要求在 `#lark-app-thread-analysis` 的 Wiki RAG AI 之后增加 `Hermes Agent AI`，接入既有“回答问题”快捷 ACP 入口，并明确调用 grilling 先确认设计。用户现已明确“确认，按这个方案实现”。v2 进入实现与本地验证；原设计核查证据不能作为实现完成依据。

## 已确认决策

- 位置与名称：Wiki RAG AI 后增加 Hermes Agent AI 页签。
- Q1：围绕当前选中的 Ticket 提问；通用问答继续使用原入口。
- Q2：首版只回答和建议，正式修改 Ticket / 回写飞书仍由人操作；新页签不增加业务反馈写回操作。既有 Answer 的本地查询记录不等同于业务写回，不承诺完全只读文件系统。
- Q3：点击“回答问题”后开始；切换页签不自动调用模型。
- Q4：支持连续追问；与主站同账号、同 Ticket 的 Answer 会话互通，隔离其他用户记录。
- Q5：答案优先，工具步骤默认折叠；审批卡片及停止按钮可见，沿用既有审批交互。
- Q6：新页签只展示与继续 Hermes Answer 会话；旧 Kimi 会话保留在原入口。
- Q7：追问沿用原会话初始资料；需要最新资料时点击“新对话”重新准备，显示资料版本或准备时间。
- Q8：切换页签、Ticket 或关闭页面后继续后台运行；返回原 Ticket 恢复，主动取消使用停止，超时沿用既有规则。

## 当前状态

v6 Sources 的 Server / FE 数据链路已修复并部署测试环境。Server 在 Answer 完成前返回结构化 `answer.sources`，运行快照保留该事件，原生历史加载按用户轮次补齐；FE 直接消费，不再按固定 Markdown 标题猜来源。无模型定向回归与两端构建通过。用户确认正文 Inline citation 暂不处理，编号与原文保持不变，不增加自动配号或跳转。

用户先前停止真实模型和完整流程验收的要求继续有效。本轮只做定向无模型检查和部署健康 / 静态入口检查，未将它们当作真实客户端 Sources 验收。

## 已确认完整方案

### 页面与交互

1. 在 Wiki RAG AI 后新增 Hermes Agent AI 页签。没有选定 Ticket 时不发请求；打开页签只读取会话，不自动启动模型。
2. 当前账号 / Ticket 没有可恢复的 Hermes Answer 会话时，展示“回答问题”按钮，点击启动原快捷入口的默认任务。
3. 默认恢复最近的 Hermes Answer 会话，可选择其他历史会话；新对话准备当前 Ticket 字段、关联聊天及现有知识材料。仅靠 actionKey 不能识别 provider，旧 Kimi 会话不混入。
4. 对话展示逐步返回的答案及追问输入；工具步骤默认折叠，审批请求始终可见，保留停止按钮。已有运行优先恢复，同一会话运行中不重复启动第二轮。
5. 展示所依据的聊天版本 / 资料准备时间。追问保留初始材料，要使用新资料则新建对话；不宣称会自动刷新旧会话的材料。
6. 切换 Ticket / 页签或关闭页面不取消后端运行；返回后沿用既有会话和运行快照恢复机制，受既有超时、服务进程与原生历史可用性约束。旧 Ticket 的迟到事件不能出现在新 Ticket。
7. 失败显示明确错误并保留输入、已收到的内容，不自动重发模型任务；结果不明时先恢复服务端状态，避免因断线重复创建会话。
8. 首版呈现答案和建议，不增加修改 Ticket / 飞书业务反馈写回按钮。保留既有 Answer 的本地查询记录与审批机制，不将问答用途描述为文件系统的强制只读隔离。

第 3、4、7 项的默认恢复、运行防重及错误交互已随完整方案确认，并完成下述本地/模拟验收。

### 实现范围

- FE 在现有 Lark 分析页增加页签及 Hermes 会话面板，复用现有 Ticket AI API、Markdown、会话状态、审批组件和停止能力。无需将 Wiki 一次性回答改造成连续会话。
- Server 按需补充可信的 provider 与材料元信息，并核对页签与相关 API 的权限、用户及 Ticket 归属；FE 不从 sessionId 字符串猜 provider。
- 复用 `lark-ticket-support-qa-answer` 的现有 prompt / skill / Hermes runtime，不增加模型或 provider，也不扩大为通用问答。沿用原 Zod DTO 与公开路由，未增加客户端 provider 选择参数、数据库表或迁移。
- 实施后分别执行定向单测/构建、浏览器 mock 回归，再核验测试环境真实 Hermes 的认证、Skill 与模型输出。v3 用户已授权部署和真实模型验收；内部知识发送已获用户明确确认；真实调用与两端连续追问按当次证据验收，不能用历史成功替代。

## 代码核查事实

- [Action catalog](../../../server/src/modules/public-config/automation-actions.config.ts:150) 中 `lark-ticket-support-qa-answer` 已使用 `hermes_acp`；提示词 `lark_ticket.support_qa.answer`，权限 profile `support-qa.answer.v1`。
- [现有 Lark 分析页](../../../fe/src/components/lark-ticket/LarkAppAnalysis.jsx) 的 Wiki 是 `lark-ticket-wiki-qa` 一次性问答；其纯文本展示尚不具备 Hermes 工具审批 UI。
- [Ticket AI API](../../../fe/src/services/lark-ticket-ai/lark-ticket-ai-api.js) 已支持创建/续聊、SSE、读取及停止；[主站详情](../../../fe/src/pages/LarkTicketDetailPage.jsx) 已有 Answer 会话交互。
- [服务](../../../server/src/application/services/lark-ticket-ai-session.service.ts) 在新建 Answer 时准备 Ticket 字段、完整关联聊天快照和 approved knowledge，材料缺失时不启动 Agent。会话按用户和 Ticket 三元组隔离，恢复按持久化 provider 路由。
- 既有 Answer 会保存 workspace 内查询记录；反馈草稿确认是另一套显式流程，不等同于 Eval / Badcase。工具申请需保留现有审批交互，不能把文本渲染视为完整接入。
- 追问不会自动重新准备 Ticket/聊天材料，继续使用初始 `threadSnapshotVersion`；已确认通过“新对话”更新材料。
- 同 action 的历史会话可能属于 Kimi，恢复后仍走原 provider；设计核查时列表未返回 provider；v2 已补可信元数据，页签不再仅按 actionKey 判断。
- Lark App 页面要求 platformLists；原 Answer API 只检查 active Web Session、larkId 及会话所有权；v2 已在 Ticket AI controller 统一增加 platformLists 门禁，拒绝 viewer 直接调用并返回诊断信息。

## 验收标准

- [x] 完成 Q1–Q8 设计决策访谈。
- [x] 用户确认完整方案与范围，进入实现。
- [x] Wiki 后页签顺序/标题正确；仅浏览页签不会创建任务，点击回答问题才启动当前 Ticket 的 Hermes Answer。
- [x] 新页签只列出当前账号 / Ticket 的 Hermes Answer 会话，旧 Kimi 继续留在原入口；两端同一 Hermes 会话可读取与追问。
- [x] 初次运行及新对话使用既有材料准备流程；追问不自动替换初始材料，资料标识正确。
- [x] 流式答案、默认折叠工具步骤、必要审批、允许/拒绝/过期及停止正确呈现，失败不会被晚到成功事件覆盖。
- [x] 已有运行可恢复，运行中不重复提交；导航不会取消后台任务，旧 Ticket 响应不会污染新 Ticket。
- [x] 无会话/无入口权限拒绝访问；用户、Ticket 及 provider 的会话绑定不可篡改。
- [x] 断线/失败保留输入，按服务端状态恢复，不自动重复执行；明确展示认证、材料或恢复失败。
- [x] 390px 下页签、追问、审批和停止可达；Shadow / Wiki RAG 原行为回归通过。
- [x] 分别记录本地测试、mock 浏览器和真实模型/部署验收，不混称。

- [x] v3：协调部署测试环境 Server / FE，确认健康检查和实际发布资源。
- v3 完整两端流程验收由用户停止；飞书真实首答 / 追问通过，主站连续追问与回读未完成，不再作为 v4 待办。
- [x] v3：追问进入等待时，输入区旁立即显示提交 / 正在处理 / 待确认状态，按钮显示“正在回答…”，不展示模型思考正文。
- [x] v3：本轮已执行的 UI / Eval QA 数据清理，分别记录浏览器运行时验证与真实飞书客户端边界。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-10-21 | v1 | in_progress | 按 grilling 只读核查既有 Hermes/Answer/Wiki 入口，用户确认 Q1–Q3。 | Q4–Q5 待答；未改应用、未运行模型、未部署。 |
| 2026-10-21 | v1 | in_progress | 用户确认 Q4、Q5 均按建议；补充核实旧 provider 恢复、追问材料和关闭页面后台运行的现有契约。 | Q6–Q8 待确认；仍仅设计核查，无应用改动。 |
| 2026-10-21 | v1 | in_progress | 用户确认 Q6–Q8 均按建议；整理完整页面/会话方案、实现范围和可执行验收标准。 | 等待最终整体确认后实现；本轮仅更新任务文档，无应用改动或真实调用。 |
| 2026-10-21 | v2 | in_progress | 用户确认按完整方案实现，开始 FE 页签与 Hermes 会话元数据接入。 | 实现及验证进行中，尚未执行真实模型或发布。 |
| 2026-10-21 | v2 | done | 新页签、追问/恢复/停止/审批、可信 provider/资料元数据及权限门禁完成；55 项 Server、50 个 FE 测试入口、8 组 Hermes 与 6 组既有 Eval 浏览器 mock 通过，两端构建通过。 | 本地实现交付；未运行真实模型、未部署、未执行真实飞书免登或客户端验收。 |

| 2026-10-21 | v3 | in_progress | 用户授权部署和真实模型完整流程验收；已核对 staging PM2、端口 3030、测试库及 Hermes runtime 路径。 | 正在发布及真实验收，不重启生产进程；无需新数据库迁移。 |

| 2026-10-21 | v3 | blocked | 08:52 UTC（16:52 香港时间）已发布当前 Server / FE；内外健康、全部静态资源哈希、其他 5 个 PM2 进程不变验证通过。实际页面 4 项无模型检查、既有 Eval/Badcase 10 项流程回归通过，合成数据清理完成。 | 自动审批拒绝真实调用：现有 Answer 附带内部知识，需用户确认发送至既有智谱端点。已异步询问；真实客户端亦待用户验收，未宣称模型正常。 |

## 验证证据与边界

| 层级 | 实际结果 | 证据 / 边界 |
| --- | --- | --- |
| Server 静态检查 | 通过 | `pnpm --dir server build`；无数据库迁移。 |
| Server 单测 / 模拟服务编排 | 55 项通过 | `lark-ticket-ai-session.service` 20、controller 8、`web-ai-session-runs` 11、Ticket/Sprint lifecycle controller 6、permission service 8、permission controller 2。覆盖 provider 与固定聊天元数据、跨用户/Ticket 拒绝、旧 Kimi 不被 catalog 改写、未建 native Session 的运行恢复、断连/停止、原生审批与超时。模型 / 平台依赖 mock，不证明真实 Hermes 可用。 |
| FE 单测 | 50 个入口通过 | `pnpm --dir fe test`；新增 provider/action 过滤回归，既有 SSR / 会话 / API 逻辑通过。 |
| FE 生产构建 | 通过 | `pnpm --dir fe build --outDir /tmp/octo-hermes-fe-dist --emptyOutDir`。本仓库 fe/dist 正在由测试站直接服务，故本轮输出到任务临时目录，避免仅验证构建就发布半套前后端。 |
| Hermes 浏览器 mock integration | 8 组通过 | [脚本](../../../fe/manual-tests/lark-hermes.browser.mjs)：标签页不自动生成、隔离 Kimi/Wiki/Document 历史、追问与新材料会话、折叠工具、保留跨页签输入、390px；断流恢复、允许/拒绝与晚到 done、后台恢复、停止、Ticket 迟到响应隔离、方向键、真实主站详情组件追问后飞书页签回读。仅合成 Ticket 和模拟 API，不连接真实模型。 |
| Shadow/Eval 浏览器回归 | 6 组通过 | [既有脚本](../../../fe/manual-tests/lark-ticket-eval.browser.mjs)；标签页新增后既有保存/冲突/重试/历史与窄屏交互通过，同样是 mock API。 |
| 测试环境部署 / 运行验证 | 通过 | 测试站 `https://octotest.odoo.tenways.it:18443`；仅重启 `octo-server-staging`，Server 构建后发布 FE 哈希资源并原子替换 HTML。无需新迁移；健康与资源匹配、其他 5 个服务 PID/启动时间/状态不变。证据 `/tmp/hermes-staging-release-5XqXXl/{release,postflight}.json`；保留发布前 FE 回退副本。 |
| 测试站真实浏览器，无模型 | 4 项通过 | 实际飞书分析页打开 Hermes 不创建会话；主站详情可打开；未登录 401 / viewer 403、其他账号独立历史；390px 页面不横溢。合成 Ticket 与临时自建 QA Web Session，未使用真实飞书免登；脚本 `HERMES_QA_UI_ONLY=1 node /tmp/hermes-staging-live.mjs` 明确跳过全部模型点击，并断言启动 POST 为零。证据同目录 `hermes-live.json` / `hermes-ui-mobile.png`。 |
| 已部署 Shadow / Eval / Badcase 回归 | 10 项通过 | 取消不写入、Badcase 必填/原子保存、主站编辑与飞书回读、双用户冲突/重读保留输入、重复请求防重、新输出独立版本、输出变更冲突、旧结果历史、主站加入/标记共享、权限/DTO 拒绝。实际站点与测试 DB，无模型；全部自建 QA 数据清理。证据同目录 `live-acceptance.json`。 |
| 真实 Hermes 模型与两端连续追问（v3） | 用户停止，部分完成 | 已核对 runtime 与既有配置模型 `glm-5.3-flash`、provider `zai`、端点 `open.bigmodel.cn/api/coding/paas/v4`；配置存在不证明认证或输出成功。自动审批拒绝调用，因现有流程会附带最多 5 条内部知识，且原生 Skill 可读取知识。用户已明确授权现有流程。独立 QA 真实首答完成（967 字）和飞书追问完成（新增 83 字、10 秒），同一 session、不同 run，环境 / 校验码回读正确；主站完整追问与返回飞书未完成。用户要求停止后已取消最后自建 QA 并清理 DB。原生 QA Session 元数据确认 `model=glm-5.3-flash`、`billingProvider=zai`。未变更凭证、模型或 endpoint。 |
| 真实飞书客户端 / H5 认证 | 用户确认首答及追问启动 | 用户从真实客户端确认首轮回答正常，追问后来开始处理，前段等待较长；服务器无真实飞书 GUI，不将自建 QA Web Session 当免登验收。新等待提示已发布，未宣称模型响应提速。 |

浏览器命令：`OCTO_EVAL_BROWSER_EXECUTABLE=<本机已安装 Chromium 路径> pnpm --dir fe exec node manual-tests/lark-hermes.browser.mjs`。复用 Extension Playwright devDependency，不新增依赖或下载浏览器。手机目检截图 `/tmp/octo-hermes-mobile.png` 来自合成资料，不是实际业务数据。

## 实现入口与交付说明

- [Lark 分析页](../../../fe/src/components/lark-ticket/LarkAppAnalysis.jsx)新增第三个页签及完整方向键导航，首次访问才挂载 Hermes 面板；同 Ticket 切页签保留未发送输入，切换 Ticket 销毁旧观察者。
- [Hermes 面板](../../../fe/src/components/lark-ticket/LarkHermesPanel.jsx)复用 `useAiSessionPanel`、Markdown、复制、审批卡片与现有 API；仅展示经 Server 元数据识别的 Hermes Answer，不增加业务写回按钮。工具步骤折叠，审批仅在可见页签主动定位。运行中禁止重复提交和切换历史；后台任务可返回恢复。
- [会话服务](../../../server/src/application/services/lark-ticket-ai-session.service.ts)的 list/load 返回安全元数据 `agentProvider`、`threadSnapshotVersion`、`threadContextSyncedAt`；同步时间不冒称新准备时间，不公开 native ID / workspace。
- [controller](../../../server/src/modules/lark-ticket-ai/lark-ticket-ai.controller.ts)统一要求 platformLists；运行快照恢复只读 ownership 元信息，不对 busy native runtime 做 load。续聊来源保持原 ownership，临时运行 provider 从 Server catalog 决定。
- 未修改模型、Prompt、Skill、原生工具策略、数据库 schema、外部反馈写回流程。v3 已协调发布 Server/FE；尚需核验真实模型和客户端。

## 复盘

- 首次编译发现当前 Ticket Action catalog 的 ACP provider 类型已限定 Hermes，不能加入无实际分支的 Kimi 判断；旧 Kimi 继续从 ownership 读取，测试证明恢复不被新 catalog 改写。
- 浏览器 mock 最初猜错审批路径，按现有 API wrapper 改为 `/api/web/acp/permissions/reply`。mock 的用户消息只写历史、不重复发到 SSE，保持 `WebAiSessionRuns` 的真实语义。
- 识别到 fe/dist 被测试站直接服务，生产构建改用独立临时输出目录；没有把构建当作部署。以上为本任务进展，不重复新增既有路由核对/运行边界规则。

## v3 授权与继续验收

内部知识发送授权已获用户明确确认，该授权下已执行部分真实 QA；随后用户明确停止验收，当前不再继续主站追问 / 回读。自动审批拒绝发生在用户确认之前，当时未执行模型步骤；当前验收按新授权进行，不以 UI / mock 结果代替模型成功。

| 2026-10-21 | v3 | in_progress | 用户授权现有知识问答流程，真实客户端首答正常，反馈追问似乎未启动。继续独立 QA 真实首答/追问复现与诊断。 | 尚未确认追问成功，不使用旧回复代替本轮输出。 |

## 追问等待反馈修正

用户进一步确认追问后来开始处理，原“未启动”反馈更正为前段等待较长。服务端日志证明该追问有新 run、原生 prompt 和持续更新；未修改运行调度、模型或超时。已复现输入区缺少处理反馈：状态位于长历史顶部，提交按钮仍显示“发送追问”，只有思考事件时底部看不到进展。

浏览器 mock 新用例先因 `.lark-hermes__composer` 内缺少处理 status 超时，再补充输入区 `role=status`、提交/处理/审批/停止提示和“正在回答…”按钮后通过。9 组 Hermes 浏览器场景及 FE 生产构建通过。已单独发布 FE（`progress-release.json`），没有重启 Server 或中断用户会话；真实模型验收继续进行。

首次 QA 真实调用运行约 172 秒后要求审批向 Wiki log 追加合成测试记录。脚本未自动放行，停止并清理其 QA DB 数据；不把该轮认定为完成。后续验收仅对结构化 rawInput 中已审查的精确日志追加命令使用一次性审批，保持其他操作审批边界。

## v4 UI 优化（当前范围）

- [x] 复制按钮使用固定尺寸与零 padding，SVG 画布对称居中，不受 Lark 通用 button 样式挤压。
- [x] 按用户轮次呈现问题与 Hermes 回答；相邻 thinking / tool 汇总进一个默认折叠的处理区，不把工具步骤当答案卡片堆叠。
- [x] Thinking 展示状态概要；工具步骤展示真实名称及 pending / running / completed / failed，不展开原始思考正文。
- [x] 每轮答案集中排版，只有一个复制入口；审批保持独立可见，停止与等待反馈保留。
- [x] 构建后只更新测试站 FE，不再执行模型 / 浏览器流程验收。

参考：[assistant-ui Chain of Thought](https://www.assistant-ui.com/docs/guides/chain-of-thought) 对相邻 reasoning / tool 分组；[AI Elements Tool](https://elements.ai-sdk.dev/components/tool) 折叠工具并区分运行/审批/完成/错误状态。本次只借鉴展示模式，复用当前 React 与 CSS，不安装新框架，不改模型、Prompt 或 Server 协议。

用户截图中的复制按钮偏移来自 `.lark-app button` 的高优先级 padding / border 覆盖共享图标按钮尺寸。v4 在 Lark 作用域重置图标按钮，并使 SVG 本身的绘制边界对称。

## v4 交付与验证边界

- FE 生产构建通过：`pnpm --dir fe build --outDir /tmp/octo-hermes-fe-dist --emptyOutDir`。按用户要求，不跑新的单测、浏览器 / 模型完整验收；上文 9 组 mock 和 50 项 FE 测试属于 v3 等待提示版本。
- 已发布测试站 FE，仅拷贝哈希资源并原子替换 HTML；没有重启 Server / 修改模型 / 执行数据库迁移。发布前 HTML 已保留；证据 `/tmp/hermes-staging-release-5XqXXl/ui-v4-release.json`。
- QA 结束证据：最后一次 `hermes-live.json` 为用户要求停止后的 `AI_RUN_CANCELLED`，`qaDatabaseRowsRemoved=true`；原生历史 / 查询审计保留，不对共享知识工作区做批量删除。
- UI 实现见 `LarkHermesPanel` / `getHermesTurns`：只按用户轮次分组，不改写原 ACP 历史，不把原始思考当答案展示；正文顺序保留，每轮复制全部正文。工具状态保留失败/未完成，不把结束一概写成成功。

| 日期 | 需求版本 | 状态 | 结果与证据 | 验证边界 |
| --- | --- | --- | --- | --- |
| 2026-10-21 | v4 | done | 用户停止验收，复制图标及 Hermes 问答层次优化已发布测试环境，FE 构建通过。 | v4 未做浏览器或真实模型验收；v3 主站完整连续追问未完成，不宣称通过。 |

## v5 Reasoning / Sources（当前范围）

- [x] Reasoning 改为独立折叠区，展开可阅读现有原生思考内容，长记录区内滚动；折叠时不渲染长正文，保留实时思考 / 中断状态。此项取代 v4 只显示思考状态的呈现选择，不改原生推理或模型配置。
- [x] 工具步骤单独分组，审批保持独立可见，答案与复制内容不混入思考记录。
- [x] Sources 仅取回答“依据 / 来源 / 参考资料”等明确引用段落及脚注定义的链接和知识文档路径；去重并展示标题、域名或路径，不从工具记录推断引用。没有引用就不渲染空来源区。
- [x] 只有 http(s) 来源可打开，不发起内容抓取；文档路径仅展示，不发明文件预览路由或工作区链接。原回答与正文引用保持原文。
- [x] FE 构建后发布测试站；不恢复模型或完整浏览器流程验收。

参考：[AI Elements Reasoning](https://elements.ai-sdk.dev/components/reasoning) 的独立折叠思考与流式状态；[Sources](https://elements.ai-sdk.dev/components/sources) 的来源数量 / 折叠内容 / 来源链接。当前 ACP 只有文本与工具事件，没有结构化 source-url 事件；v5 是已有回答引用的展示整理，不宣称来源经过后端检索验证。

### v5 交付证据

`pnpm --dir fe build --outDir /tmp/octo-hermes-fe-dist --emptyOutDir` 通过。已发布静态资源并原子替换测试站 HTML，未重启 Server、未迁移 DB；发布前入口已保留。证据 `/tmp/hermes-staging-release-5XqXXl/ui-v5-release.json`。未执行新的单测 / mock 浏览器 / 真实模型验收，不沿用历史结果作为 v5 通过依据。

引用提取排除 fenced code、思考 / 工具记录；只读既有文本，无远程抓取或文件访问。模型尚在流式输出时不展示未完整 URL 的来源卡片；无明确引用不显示空区块。Source 卡片只是回答引用整理，正文仍保留原始引用格式。

| 日期 | 需求版本 | 状态 | 结果与证据 | 验证边界 |
| --- | --- | --- | --- | --- |
| 2026-10-21 | v5 | done | 独立 Reasoning 阅读、工具步骤、Sources 引用卡片已发布测试站 FE；构建通过。 | 按用户要求未恢复完整验收；来源未新增后端核验或预览能力。 |

## v6 Sources Server API 修正（当前范围）

- [x] Server Answer 完成时返回结构化来源事件，按现有 actionRunId / session 关联，FE 不再自行从回答格式猜来源。
- [x] 历史恢复补齐按用户轮次隔离的 Sources，实时流 / 运行快照 / 原生历史回放一致；无来源的追问不沿用上一轮来源。
- [x] 兼容正文内 Markdown 文档链接、绝对知识库文档路径、中文 / 英文引用区与脚注；不从思考、工具调用或代码示例推断来源，不提供不存在的文件预览接口。
- [x] 定向无模型回归与两端构建通过，协调部署 Server / FE；不运行真实模型或完整浏览器验收。

### v6 结果与证据

- 回归先红后绿：`lark-ticket-ai-session.service` 的结构化来源历史用例最初因缺少 `answer.sources` 失败；修复后通过。引用解析覆盖无标题正文链接、绝对 / 相对知识路径、数字脚注、平衡括号 URL、case source_ref、去重、代码块排除、凭证 URL / 不安全协议 / 路径穿越拒绝。
- Server 定向 4 文件 / 47 项通过：来源 domain 4、Ticket service 22、run store 12、controller 9。覆盖实际 SSE 序列化与 scoped load API、按轮次补齐历史、思考 / 工具不作为引用、无来源追问不继承旧来源。均为合成事件 / mock 依赖，无模型调用。
- FE 定向 2 个测试入口通过（`lark-hermes-session` / `ai-session-transcript`），覆盖服务端来源接收、流式与回放一致、轮次隔离、危险 href 拒绝。旧 FE Markdown 来源提取函数已删除。
- `pnpm --dir server build` 与 FE 临时目录生产构建通过；无 schema / 迁移。Sources 表示回答引用，不升级为事实验证或检索审核结论；未知数字引用不凭空生成来源。
- 已发布 Server / FE：2026-10-21 18:15（北京时间）。发布前确认活动 Ticket run 为零，仅重启 `octo-server-staging`；其余 5 个进程不变，公网健康正常，实际 HTML 与本地构建匹配。发布证据 `/tmp/hermes-sources-release-MzmoVa/release.json`，保留发布前 HTML。没有触发真实模型、完整浏览器验收或真实飞书客户端复验。
- 用户确认正文 Inline citation 暂不处理；本次只做 Sources 数据 / 卡片，原文与编号保持不变。

| 日期 | 需求版本 | 状态 | 结果与证据 | 验证边界 |
| --- | --- | --- | --- | --- |
| 2026-10-21 | v6 | done | Sources 服务端事件 / 历史恢复 / FE 消费已接通并发布，47 项 Server 与 2 个 FE 定向测试入口及构建通过。 | 无真实模型或客户端 Sources 验收；正文 Inline citation 经用户确认暂不处理。 |
