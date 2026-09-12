---
title: "Ticket wiki 问答 Quick Action"
module: "ai-ticket"
status: done
requirement_version: 1
created_on: 2026-09-11
updated_on: 2026-09-11
closed_on: 2026-09-11
owner: Codex
related:
  - "../../ai-dev/lifecycle/current-system-technical-objects.md"
---

# Ticket wiki 问答 Quick Action

## 目标

新增 wiki 问答：自动提取当前 Ticket 问题，检索 llm-wiki 最多三篇独立 FAQ / QA Card，结合固定 Lark 聊天快照生成供用户审核的回复。

## 验收标准

- [x] Server 本地全文召回、模型重排，最多三篇且不凑数；来源编号由 Server 分配（真实文件读取＋mock 模型测试）。
- [x] 允许 draft，并保留草稿、历史参考、环境及证据局限。
- [x] 使用用户给定回答规则；无模型工具、ACP 会话或业务写回。
- [x] FE 新入口、一轮生成、失败重试与来源显示已接入，Server 取消与完成事件已有测试。
- [x] Server / FE 测试与构建通过，标明真实模型与浏览器验证边界。
- [x] 真实模型三阶段生成及真实 Ticket 页面完成、来源显示、重开、取消后重试均已验证。

## 背景与范围

既有 PostgresSupportKnowledgeStore 查询 PostgreSQL 的批准知识块；llm-wiki 是外部 workspace 的 Markdown 知识库，两者不是同一数据源。此次保留既有 Answer / Document，新增独立动作。

## 方案与决策

- 用户确认 Server 检索＋模型重排、允许草稿、自动从 Ticket 提取问题、复用问题总结 provider/model。
- 读取 SUPPORT_QA_EU_WORKSPACE_DIR 下 docs/llm-wiki；以 concepts 为命中单位，index/entities 只辅助定位，raw 只供证据核对。
- 三条独立 workflow_prompts：extract、rerank、answer；初始化只补缺失，不覆盖管理员模板。
- 关键词召回最多20篇；中英文分词后标题4、对象/流程/标签3、正文2，匹配导航链接加1。同分按路径稳定排序。
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
