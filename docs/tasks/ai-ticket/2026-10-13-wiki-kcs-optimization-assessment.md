---
title: "LLM wiki 优化与 KCS 试点评估"
module: ai-ticket
status: done
requirement_version: 3
created_on: 2026-10-13
updated_on: 2026-10-13
closed_on: 2026-10-13
owner: TBD
related:
  - "./2026-10-12-wiki-update-production-audit.md"
  - "./2026-09-22-historical-skip-reprocess.md"
---

# LLM wiki 优化与 KCS 试点评估

## 目标与范围

依据用户提供的《从 Ticket 提炼文档：缺少答案，提炼出来也不好用，怎么办？》全文及《网络调研与方法脑暴》，对照当前 wiki、Skill 和 Octo 源码，提出优化顺序，判断 KCS 是否值得实践并形成可验证的试点方案。v2 补充逐 Ticket KCS 的保存归属、内容、证据版本及消费流程；v3 将这些原则细化为可评审的数据模型、更新/使用协议、并发与失败处理、交互和验收设计。

本任务交付评估与建议，不执行 Ticket 摄入、生产查询、真实模型调用、处理人访谈、外部反馈写入、调度、部署或功能修改。试点规模、角色和节奏为建议，尚未分配人员或启动。

## 验收标准

- [x] 区分原始材料缺失、知识表达、检索、上下文和回答使用的问题。
- [x] 明确已有规范、源码实现差距、待验证假设，避免把规范当成上线能力。
- [x] 核对 KCS 官方方法，提出适合当前工作的轻量实践及其边界。
- [x] 给出一个问题族的试点、独立复用检验及成本记录方式。
- [x] v2：明确每票 KCS 工作记录、证据快照、通用知识和账本各自归属，给出字段及使用流程建议。
- [x] v3：交付具体数据模型、AI/人工更新规则、版本与幂等、wiki 摄入及问答消费契约、交互和验收场景。
- [x] 检查本次文档链接与差异，明确没有实施或效果证据。

## 结论与决策

建议实践 KCS 的过程捕获、搜索复用和使用时维护，并由 KDA 辅助问题族分析；保留 llm-wiki 作为知识文件及来源维护载体。先在一个问题族试点，投入是否扩大由独立复用效果与人工成本决定。

KCS 指导处理过程怎样形成和维护知识；llm-wiki 保存、组织和修订知识。新增 Ticket 的资料缺失可通过过程捕获改善；历史缺失仍需定向补证；已存在知识的检索与上下文问题需要单独定位。方法符合场景不构成项目收益证明。

当前已有七种用途和证据边界，优先打通使用链路及承接存量，不另建文章分类体系，不以全库重写、文章数量或自动提升 confirmed 作为目标。本次不改变默认 Finish 摄入范围；选定进行中 Ticket 的过程捕获须作为后续明确范围。

v3 详细设计仍为提案：独立的 KCS 记录持久化、接口、UI、取证脚本扩展及消费均未实现；不因本次讨论新增表、迁移或写通道。

## 核查结果（2026-10-13，本地快照）

| 层面 | 已核对事实 | 含义与边界 |
| --- | --- | --- |
| Schema / 写入 Skill | 已定义 faq、how_to、diagnostic、known_issue、historical_case、investigation、navigation；根因、结果、审核、当前适用性独立记录 | 无需再发明“没有完整答案也可以保留知识”的规则；需要核对实际执行 |
| 存量元数据 | concepts 共 123 篇，全部 status=draft；content_type、root_cause_status、resolution_status、applicability_status 分别仅 5 篇有字段 | 118 篇缺少这些显式字段；这是严格限定 frontmatter 的机械统计，不是全库内容质量或原文证据评审 |
| 逐票账本 | 1936 行；draft 1434、on_hold 250、needs_evidence 172、historical_case 7、no_distill 73 | 待办不因存在账本行而消失；这些是本地登记状态，不是生产源端覆盖率或人工复核结果 |
| 默认提示词 | Answer 默认模板仍指 query-support-qa v2.1 和旧读取顺序；Document 默认模板仍写 QA Card / FAQ / skip 及 entities 联动 | 与现行 Skill 存在文字差距；模板受数据库保存的 prompt 覆盖，未核对本次线上实际生效文本，不能直接认定为问答失败根因 |
| 使用入口 | Wiki 问答使用 createWikiQaService；ACP Answer 的 Server 注入材料来自 searchApproved / support_knowledge 数据库，并允许 Agent 按权限读取 wiki；Shadow 复用 Wiki retrieve | 更新 wiki 文件不等于 approved 数据库材料自动同步；应分别建立入口基线，不把各入口视为同一查询管线 |
| 文件检索 | 基于中英文词项匹配、标题/标签/正文加权；默认召回 20 篇可配置，重排至多 5 篇，最终至多 3 篇 | 症状、业务用语及具体条件需要有可发现入口；未重现真实失败，不据此决定新增检索引擎或放宽阈值 |
| 摘录 | 已尽量保留完整相关章节、限制和相邻原文；知识片段与来源各受预算约束，无法容纳完整必要片段时可返回空内容或降为历史参考 | 不能只把“命中页面”算取得了依据；需要记录因预算、来源缺失或后续过滤而丢失的内容，不能静默裁掉限制来提高命中 |
| 状态消费 | reader / Wiki evidence 类型未直接传递 content_type、root_cause_status、resolution_status、applicability_status，也未直接读取逐票 retrieval_status | Skill 有要求不代表 Server 已结构化落实；未来补齐时须按具体结论和来源判断，避免一张票排除整页或一张票放行整页 |
| 专用重排分支 | mode=rerank 时分数只决定相关性，conditionsMatched=false，资料降为历史参考；general 分支可返回条件核对结果 | 专用分支缺少独立适用性核验，是条件性的实现差距；未确认当前生产 mode。不应把分数高直接改为适用或绕过证据检查 |
| 可观察性 | 已有分阶段进度、候选/过滤计数、可选 extract/rerank/answer 日志及 actionRunId；Schema log 有候选、选择、缺口、采用和效果字段 | 复用现有记录机制；未确认生产日志开关或是否保存了一次失败的完整证据链，不声称已有闭环评测 |

本次只抽读了存量《价格表与产品资料维护规则》作为组织样例：它在同页包含价目表、仓位、促销及退货等级案例。可将“具体症状入口是否被宽泛主题掩盖”列入试点核查；没有回读其全部 raw，不能认定正文错误，也不建议直接自动拆页。

## 优化顺序（建议，未实施）

| 顺序 | 工作 | 具体交付与完成条件 |
| --- | --- | --- |
| 1 | 固定一次真实失败与所用入口 | 保存输入时点、当时可见 Ticket 材料、知识版本、人工指定预期段落、实际候选与上下文、回答和失败位置；找不到预期依据先补内容，不直接改检索 |
| 2 | 对齐有效提示词与已有规范 | 核对数据库保存模板及默认模板，统一按用途分流、concepts 优先和 entities 按需；验证不恢复旧分类淘汰或隐含全实体维护门槛 |
| 3 | 修订一个问题族的知识 | 按原始症状、环境、检查—观察—分支、结果与证据组织；通用规则链接权威定义，场景页引用案例与 raw；只在实际需要时增建 navigation，不固定每个主题必须三页 |
| 4 | 按证据修复查询链路 | 核对词项覆盖、重排、摘录预算和多页关联；来源变化追踪到知识及索引；按结论核对适用性和状态；专用重排需要后续核验而非分数代替事实。改动位置由失败记录决定 |
| 5 | 试行新增 Ticket 的 KCS 工作习惯 | 在选定范围中早搜、按处理过程记录草稿、结束时确认动作/观察/范围；自动随工单更新尚未实现，先手动维护和确认 |
| 6 | 用复用反馈安排后续投入 | 实际用过、有效、需修改、仍缺材料分别记录；集中补高需求/高影响缺口；复核其余旧 skip 时接回历史任务，不新造覆盖率 |

不建议因为本次方法调研就新增知识图谱、向量库或另一套知识状态库。先验证当前入口、内容和记录能否支撑实际任务；有已定位且现有机制难以解决的瓶颈后再设计技术改动。

## KCS 实践与当前 wiki 的对应

| 官方实践 | 当前场景建议 | 人工承担的最小判断 |
| --- | --- | --- |
| 处理中捕获 | 开始保留症状/环境，排查记动作和观察，结束补结果；LLM 从真实记录整理并提示缺口 | 处理人确认实际动作、结果和适用条件；未发生的操作不补写 |
| 简单结构 | 处理记录先用问题、环境、动作/结果、证据与缺口；根因可未知，最终再按现有 content_type 整理 | 哪些事实已确认、哪些只是推测；少量共同字段不等于新增七套表单 |
| 搜索与复用 | 新问题先查已有知识，匹配时补充或修订，缺乏适用证据时保留调查线索 | 核对同症状是否同一条件；检索命中与实际采用分别记录 |
| 使用时审阅 | 复用者记录适用/无效/需修订，必要时更新已有页面与来源 | 复用反馈不能自动提升 confirmed，也不代替现行要求的真实签核范围 |
| KDA | 按同症状不同路径、同原因不同表现比较，必要时建设导航/分流路径 | 共同词语或多个类似 Ticket 不证明同根因；全部无答案可产出缺口清单 |

KCS 指南中的 WIP、Not Validated、Validated 等不与本项目 draft、confirmed 或 applicability_status 机械一一对应；先保留现有独立状态维度，明确内容可供何种用途使用。能检索调查记录与能给当前操作建议是不同资格。

历史 1646、2008 在用户文章中是复核摘录线索；本次未重新读取原工单。不能把文章里的 R-SKU 示意直接升级为当前创建步骤或审批要求。补证先形成具体问题清单，由人工安排查询或访谈，本任务不联系处理人。

## 一个问题族的试点（建议）

建议用两周观察窗口；样本量、时长和角色均为本项目试验设计，不是 KCS 官方门槛或效果承诺。离线对照使用固定版本的独立 wiki 副本，显式指定 workspace，避免试验改写 production/staging 共用的知识目录。

1. 选择一个有真实“文档不好用”反馈、来源可追溯的问题族；例如退货等级/R-SKU 仅为候选，实际需回读来源并核对需求。指定一位支持处理人和一位领域复核人，可由同一人承担，但最终复用检验交给未参与编写的人。
2. 用 10–15 张同问题族历史票进行取证与修订；另保留约 5 个未用于编写的独立问题，若暂时没有足够问题则继续收集，不以重复原票冒充独立验证。
3. 先跑旧知识/旧入口基线；在资料固定时检验检索/上下文改动，再固定入口比较知识修订。专家补证后新增的信息单列，以免把新增答案带来的改善算成提示词或检索收益。
4. 检验输入只给当时可见的问题和条件，不提前提供处理结果；最终结果由复核人用来判定答案。人工阅读与系统问答分别记录。
5. 新增 Ticket 在处理中手动记录草稿，提示处理人只补阻塞缺口；不要求每张票另写文章，不改变关闭条件，不创建周期自动化。
6. 用结果决定扩大、调整或停止：误用历史结论、超证据操作或人工负担显著增加，应先修正；没有足够独立样本则结论保持未验证。

| 观察项 | 记录口径 |
| --- | --- |
| 找到预期依据 | 人工已指定有适用依据的测试问题中，实际取得预期页/段落的数量与总数；只在候选列表出现另记，不能算进入最终上下文 |
| 必要条件完整 | 每个问题由复核人预先列必要条件，逐项记录是否进入上下文及回答；无依据时正确追问也可为合适结果 |
| 使用依据正确 | 重要结论均可定位、历史/调查不越界、下一步有依据；单列错误归因、漏条件和不支持的操作 |
| 实际帮助 | 独立使用者完成任务/明确下一步/仍需升级，另记恢复是否有真实反馈；未知结果保持 unknown |
| 人工成本 | 每票记录补充、复核、寻找依据及返工时间，并与基线比较；不能只记 LLM 生成耗时 |
| KCS 执行情况 | 是否先搜索、关联已有知识、及时补动作/观察/结果；作为过程观察，不设每人文章配额 |

## 逐票 KCS 设计入口

v2 的保存归属、字段和使用流程原则由 v3 的[Ticket KCS 更新与使用设计](../../tenways-octo/ticket-kcs-update-and-use-design.md)细化承接。具体数据与协议只在设计文档维护，本任务保存需求、调研依据、进展和验证边界。设计状态为 draft，未实现功能或修改线上行为。

## 来源与证据

- 用户于 2026-10-13 在本 chat 粘贴的讨论文章全文，以及[补充调研原文](</home/deploy/.codex/attachments/c2cff03f-f486-44dd-a354-6ba964fe4143/Pasted text.txt>)。讨论中的外部方法适配建议不视为本项目实验结果。
- [Wiki Schema](/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/SCHEMA.md)、[写入 Skill](/home/deploy/projects/odoo-eu-guide/.agents/skills/write-support-qa/SKILL.md)、[查询 Skill](/home/deploy/projects/odoo-eu-guide/.agents/skills/query-support-qa/SKILL.md)。
- [当前数据库类型](../../../server/src/adapters/postgres/schema.ts)、[Ticket AI 类型](../../../server/src/domain/lark-ticket-ai.ts)：区分现有数据与提议中的 KCS 记录。
- [默认工作流提示词](../../../server/src/domain/workflow-prompts.ts)、[Ticket 使用入口](../../../server/src/application/services/lark-ticket-ai-session.service.ts)、[approved 知识存储](../../../server/src/adapters/postgres/support-knowledge-store.ts)。
- [文件知识 reader](../../../server/src/adapters/filesystem/wiki-knowledge-reader.ts)、[知识与来源摘录](../../../server/src/domain/wiki-evidence.ts)、[Wiki 查询 service](../../../server/src/application/services/wiki-qa.service.ts)、[重排 client](../../../server/src/adapters/ai/wiki-qa-rerank-client.ts)。
- [提取日志](../../../server/src/adapters/filesystem/wiki-qa-extract-log.ts)、[重排日志](../../../server/src/adapters/filesystem/wiki-qa-rerank-log.ts)、[回答日志](../../../server/src/adapters/filesystem/wiki-qa-answer-log.ts)。只核对实现，不读取或复制敏感运行 payload。
- KCS v6 [Capture Knowledge in the Moment](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/030/010/010)：处理过程中保留上下文及进行中的知识。
- KCS v6 [Use a Simple Template](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/030/020/010)：问题、环境、处理方法、可选原因和元数据；先保持结构简单。
- KCS v6 [Article State](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/040/010/030)：状态、受众和治理维度，WIP 可保留尚无答案的材料。
- KCS v6 [Reuse is Review](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/030/040/020)：使用中发现并修订内容，建立快速反馈。
- KCS v6 [KDA Techniques](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_KDA_Guide/060_KDA_Techniques)：分别分析共同症状和共同原因/解决方式，形成入口和路径。

官方正文于 2026-10-13 核对；统一使用 v6 链接，避免混用用户补充材料中另一版指南的章节编号。legacy data 页面本次获取失败，不将其未读正文作为新增结论依据。没有使用外部百分比或 ROI 推算本项目收益。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-10-13 | v1 | done | 已读两份用户材料，核对 Schema、Skill、元数据、查询/提示词/日志源码及 KCS 官方正文；优化与试点建议交付；14 个本地链接、围栏、空白和 diff 检查通过。 | 真实失败回放、试点及生产生效情况均未验证。 |
| 2026-10-13 | v2 | done | 补充每票 KCS 数据归属、最小字段、版本与增量及消费流程设计；核对现有数据库/AI 类型并搜索专用 KCS 实现，未修改应用或存储；文档检查通过。 | 逐票 KCS 持久化、取证及问答消费均为提案，功能、迁移和试点未运行。 |
| 2026-10-13 | v3 | done | 已交付独立 KCS 设计文档与索引，覆盖记录/候选/使用存储、AI 差异与人工采纳、版本/幂等/冲突、wiki 原始证据扩展和增量、问答上下文与反馈；设计及任务共 33 个本地链接、围栏、空白和差异检查通过。 | 仅设计交付；未编写运行时代码、执行迁移、接入调度或验证模型/生产效果。 |
| 2026-10-13 | v3 | done | 补充 KCS 方法与本项目逐票工作记录的区别、原 Ticket/已有文档的处理、当前同步副本与 raw 版本边界；核对官方 Linking 与 legacy 指南搜索正文。设计版本升为 2，数据/操作提案未改，仍无实现。 | 源码/本地规范核对，未重新执行生产问答或核查全库内容；legacy 页面直接打开超时，建议限定于已返回的搜索正文。 |

## 验证

| 类型 | 结果 | 边界 |
| --- | --- | --- |
| 源码与规范核查 | 完成 | 当前 workspace 静态实现，不是生产故障复现或部署验收 |
| 本地统计 | 完成 | 123 篇 concept 的 frontmatter、1936 行账本；不证明源端最新或内容正确 |
| 官方方法核查 | 完成（限定来源） | 捕获、模板、状态、复用和 KDA 正文；没有执行方法效果实验 |
| 文档静态检查 | 通过 | v3 最新设计及任务共 35 个本地链接存在；围栏、空白、`git diff --check` 与差异复核通过；未对所有其他引用重新联网检查 |
| 单测 / 模型问答 / live E2E | 未执行 | 本次无应用行为修改，也未取得真实失败样例进行回放 |

## 后续

本次具体设计以 [Ticket KCS 更新与使用设计](../../tenways-octo/ticket-kcs-update-and-use-design.md)为准。若实施，从一个实际失败样例和问题族开始，另按授权范围建立实现/试点任务；本记录完成仅表示评估交付。历史重评、周期摄入和生产部署仍由对应任务管理。
