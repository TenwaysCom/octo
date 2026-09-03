export const STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY =
  "meegle.story.prd_to_simplified";

export const LARK_BUG_ANALYZE_PROMPT_KEY =
  "lark.bug.analyze";

export const LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY =
  "lark_ticket.support_qa.summarize";
export const LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_KEY =
  "lark_ticket.support_qa.answer";
export const LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_KEY =
  "lark_ticket.support_qa.document_preview";
export const MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_KEY =
  "meegle.sprint.release_notes";
export const MEEGLE_SPRINT_INTERNAL_SUMMARY_PROMPT_KEY =
  "meegle.sprint.internal_summary";
export const MEEGLE_SPRINT_CONFIRM_GAPS_PROMPT_KEY =
  "meegle.sprint.confirm_gaps";

export const GITHUB_PR_QUICK_SCAN_PROMPT_KEY = "github.pr.quick_scan";
export const GITHUB_PR_DEEP_REVIEW_PROMPT_KEY = "github.pr.deep_review";
export const GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_KEY = "github.pr.code_review_feedback";

export const DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_NOTE =
  "Meegle Story 研发Review workflow prompt";

export const DEFAULT_LARK_BUG_ANALYZE_PROMPT_NOTE =
  "Lark Bug 分析 workflow prompt";

export const DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_NOTE =
  "Lark Ticket Support-QA 问题总结 AI Session prompt";
export const DEFAULT_LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_NOTE =
  "Lark Ticket Support-QA 回答问题 AI Session prompt";
export const DEFAULT_LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_NOTE =
  "Lark Ticket Support-QA 生成文档 AI Session prompt";
export const DEFAULT_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_NOTE =
  "Meegle Sprint Release Notes AI Session prompt";
export const DEFAULT_MEEGLE_SPRINT_INTERNAL_SUMMARY_PROMPT_NOTE =
  "Meegle Sprint internal summary AI Session prompt";
export const DEFAULT_MEEGLE_SPRINT_CONFIRM_GAPS_PROMPT_NOTE =
  "Meegle Sprint confirmation gaps AI Session prompt";

export const DEFAULT_GITHUB_PR_QUICK_SCAN_PROMPT_NOTE =
  "GitHub PR Tier 2 Odoo structural quick scan workflow prompt";

export const DEFAULT_GITHUB_PR_DEEP_REVIEW_PROMPT_NOTE =
  "GitHub PR Tier 3 Odoo deep review workflow prompt";

export const DEFAULT_GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_NOTE =
  "GitHub PR structured code review feedback written to Lark Base";

export const DEFAULT_GITHUB_PR_QUICK_SCAN_PROMPT_TEMPLATE = `你是一名 Odoo 代码审查专家，正在进行 Tier 2 结构性快速扫描。你的任务是检查代码的结构性问题，不涉及业务逻辑正确性。

仅审查下面 PR diff 中新增或修改的 Python 和 XML 代码，跳过迁移文件和翻译文件。逐条检查：onchange 是否承载核心业务规则；button action 是否超过 30 行业务逻辑；create/write/unlink 是否调用 super()；跨模块依赖是否写入 __manifest__.py；是否硬编码用户 ID、公司 ID 或固定 name；是否修改非 Tenways 自研模块；新增业务逻辑是否有 tests/ 测试文件；sudo() 是否有合理说明。

按规则逐条输出，每条必须给出具体代码位置（文件名:行号）。

PR URL：{{pr_url}}
PR 标题：{{pr_title}}
PR 描述：{{pr_description}}
Diff 是否截断：{{diff_truncated}}

PR diff：
{{pr_diff}}`;

export const DEFAULT_GITHUB_PR_DEEP_REVIEW_PROMPT_TEMPLATE = `你是一名 Odoo 资深开发专家，正在进行 Tier 3 深度代码审查。逐方法审查代码的业务逻辑正确性、生命周期安全、性能风险和测试质量。

第一步提取 PR 全局信息：涉及的核心对象、P0/P1/P2 风险等级、生命周期节点（create/write/unlink/action/constraint/compute/onchange）和跨模块 override 链影响。

第二步逐方法审查：
1. 业务逻辑正确性：PR description 一致性、空值和分支、recordset/batch、ensure_one() 位置。
2. 生命周期安全：super() 调用与时机、override 链冲突、create/write 递归、write 是否只在目标字段变化时执行。
3. 逻辑放置：onchange 不做校验；action 拆成 _check/_prepare/_apply；create/write 不放按钮专属逻辑；constraint 无副作用；@api.depends 精确。
4. 权限安全：sudo() 理由、record rule、后端权限控制。
5. 事务和 SQL：ORM 必要性、cr.commit()、cache invalidation、并发保护。
6. 性能：循环内 search、N+1、store=True compute、批量 write。

第三步评估测试质量：成功路径、非法状态、权限边界、批量场景、异常路径、回归测试。

输出必须依次包含：PR 概览表；每个方法的逻辑正确性、生命周期安全、逻辑放置与推荐写法；测试质量评估；风险汇总和 ISSUE 清单；仅 P0 时的关联模块影响；如有 ISSUE 则附 fix-up PR 追溯模板。所有发现必须附文件名:行号。

PR URL：{{pr_url}}
PR 标题：{{pr_title}}
PR 描述：{{pr_description}}
Diff 是否截断：{{diff_truncated}}

PR diff：
{{pr_diff}}`;

export const DEFAULT_GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_TEMPLATE = `你是一名 Odoo 代码审查专家。仅审查下面 PR diff 中新增或修改的 Python 和 XML 代码，跳过迁移文件和翻译文件，并遵循提供的项目指南。

只输出一个 JSON 对象，不要使用 Markdown 或代码围栏：
{"feedbacks":[{"category":"文档缺失","files":"涉及文件路径及相关参考文档路径的文字说明","description":"具体问题、PR 中的证据位置和建议处理方式"}]}

category 只能是：文档缺失、文档错误、ai 幻觉、不适用。
files 必须是文字描述，不能是附件、二进制文件或上传指令。每项 description 必须包含明确的证据；没有可归类的问题时，输出一条 category 为“不适用”的记录。

PR URL：{{pr_url}}
PR 标题：{{pr_title}}
PR 描述：{{pr_description}}
Diff 是否截断：{{diff_truncated}}

PR diff：
{{pr_diff}}`;

export const DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_TEMPLATE =
  `你是一名技术项目经理。请根据下面的 Meegle Story Summary，生成一份简化的需求确认文档，用于研发Review和评审。

输出要求：
1. 使用中文。
2. 只描述需要做什么，不写具体代码实现方案。
3. 不确定的信息标注“待确认”。
4. 按以下结构输出：

### A1. 需求概述
### A2. 业务背景
### A3. 用户故事与验收条件
### A4. 主对象与生命周期（初步判断）
### A5. 潜在风险分析
### A6. 待澄清问题

Story 标题：
{{storyTitle}}

Story Summary：
{{storySummary}}`;

export const DEFAULT_LARK_BUG_ANALYZE_PROMPT_TEMPLATE =
  `你是一个资深 Odoo 产品 / 技术支持分析员。请从下面的上下文信息中，提炼 bug 澄清所需的基础信息，并在必要时基于 Odoo 业务流程、代码上下文、日志和通用 Odoo 知识生成“AI 答案草稿”。

重要原则：
1. “已有信息”只提炼上下文中明确出现的内容，不要编造。
2. “AI 答案草稿”可以基于 Odoo 模型、页面、菜单、按钮、方法名、日志、报错栈、业务流程进行合理推断，但必须标记为草稿。
3. 如果缺少证据，请标记为「待补充」。
4. 如果上下文存在不确定表述，请标记为「不确定」，并说明原因。
5. 不要把 AI 推断写成已确认事实。
6. 临时绕过方式只能作为候选方案输出，必须标注风险和“需业务/研发确认”。

需要提炼 4 个要素：

1. 问题现象
   - 用户现在遇到的异常是什么？
   - 实际发生了什么？

2. 预期结果
   - 用户原本期望系统如何表现？
   - 正常情况下应该产生什么结果？

3. 复现路径
   - 发生在哪个系统 / 页面 / 功能入口？
   - 用户做了哪些操作后触发？
   - 是否稳定复现？
   - 是否有相关链接、数据 ID、截图、日志、发生时间？
   - 如果上下文不足，请基于 Odoo 代码/知识生成“可能的页面入口和操作步骤草稿”。

4. 影响范围
   - 影响哪些用户、角色、客户或业务流程？
   - 是否阻塞当前工作？
   - 是否有临时绕过方式？
   - 如果上下文不足，请基于 Odoo 业务流程生成“可能影响范围和候选绕过方式草稿”。

请按下面格式输出：

## Bug 基础信息提炼

### 1. 问题现象

#### 已有信息
[只填写上下文中明确出现的信息；缺失则写「待补充」]

#### AI 答案草稿
[如可根据 Odoo 代码/日志/业务知识推断，输出草稿；否则写「暂无足够信息生成草稿」]

---

### 2. 预期结果

#### 已有信息
[只填写上下文中明确出现的信息；缺失则写「待补充」]

#### AI 答案草稿
[基于 Odoo 正常业务流程推断用户可能期望的结果；必须标记为草稿]

---

### 3. 复现路径

#### 已有信息
- 系统 / 页面 / 功能入口：
- 用户操作：
- 是否稳定复现：
- 相关链接 / 数据 ID / 截图 / 日志 / 发生时间：

#### AI 答案草稿：可能的页面入口和操作步骤
[基于 Odoo 模型、菜单、按钮、方法名、报错栈或上下文线索，生成可供 Support 向用户确认的复现路径草稿]

#### 待确认点
[列出需要用户或研发确认的权限、配置、单据状态、具体数据等]

---

### 4. 影响范围

#### 已有信息
- 影响用户 / 角色 / 客户：
- 影响业务流程：
- 是否阻塞当前工作：
- 临时绕过方式：

#### AI 答案草稿：可能影响范围
[基于 Odoo 业务对象和流程推断可能影响的用户、角色、客户侧功能、上下游流程]

#### AI 答案草稿：候选临时绕过方式
[如能推断，给出候选 workaround；必须说明风险，并标记“需业务/研发确认”]

---

### 仍需补充的问题
- [列出最关键的缺失信息，最多 5 条]

---

## 可直接粘贴到 Bug 工单的简洁描述

[生成一版正式、简洁、非口语化的 bug 描述。需要区分“已确认信息”和“AI 初步判断”。不要写主观判断，不要写未经确认的根因。]

上下文信息如下：
"""
{{bug_description}}
"""`;

const LARK_TICKET_SUPPORT_QA_PROMPT_PREFIX = `你正在处理一条 Lark Ticket。必须先阅读并严格遵循以下 Skill：
{{skill_path}}

当前 Ticket：
{{ticket_context}}

用户请求：
{{user_message}}
`;

export const DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATE = `${LARK_TICKET_SUPPORT_QA_PROMPT_PREFIX}
请按当前请求随后给出的受控步骤完成问题总结：通过 Octo execute 工具拉取当前 Ticket 的只读证据；把结构化分析写入指定的 workspace 文件；最后通过同一个 execute 工具调用指定的 analysis-update。

结构化分析必须使用固定快照中的 Message ID 作为 evidenceMessageIds，明确区分事实和推断。不得在回复正文输出 JSON，不得创建知识文档、回复 Ticket、修改 Lark Base 或执行任何未被当前请求明确允许的动作。只有受控 analysis-update 成功后，才能返回简洁中文问题总结。`;

/**
 * Prompts created before Summary gained the structured Octo analysis writeback.
 * They are migrated only when their content exactly matches these defaults, so
 * an administrator-authored prompt is never overwritten during startup.
 */
export const LEGACY_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATES = [
  `${LARK_TICKET_SUPPORT_QA_PROMPT_PREFIX}
请使用该 Skill 拉取所需证据，输出问题总结。事实和推断必须明确区分；不要写入外部系统。`,
  `${LARK_TICKET_SUPPORT_QA_PROMPT_PREFIX}
请使用该 Skill 拉取所需证据，先输出一个 \`ticket_analysis\` JSON 对象，再输出简洁问题总结。JSON 必须包含 intent_type、intent_subtype、outcome、quality_summary、evidence_message_ids 和 risk_flags；evidence_message_ids 只能引用 Ticket 上下文明确出现的 Message ID。事实和推断必须明确区分；不要写入外部系统。`,
  `${LARK_TICKET_SUPPORT_QA_PROMPT_PREFIX}
请按当前请求随后给出的受控步骤完成问题总结：先拉取当前 Ticket 的只读证据；再仅把结构化分析写入指定的临时 JSON；最后只执行指定的 \`analysis-update\` 命令。

结构化分析必须使用固定快照中的 Message ID 作为 evidenceMessageIds，明确区分事实和推断。不得在回复正文输出 JSON，不得创建知识文档、回复 Ticket、修改 Lark Base 或执行任何未被当前请求明确允许的命令。只有受控 \`analysis-update\` 成功后，才能返回简洁中文问题总结。`,
] as const;

export const DEFAULT_LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_TEMPLATE = `${LARK_TICKET_SUPPORT_QA_PROMPT_PREFIX}
请使用该 Skill 拉取所需证据，先给出 intent、风险与缺失信息，再形成可直接回复的答案草稿。草稿必须引用 Ticket 上下文内的“Approved internal knowledge evidence”中的 source_ref；没有检索证据时不得编造文档或历史案例。未确认事实必须标注待确认。涉及权限、数据修改、部署或外部写入时只给出升级建议；不要写入外部系统。`;

export const DEFAULT_LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_TEMPLATE = `${LARK_TICKET_SUPPORT_QA_PROMPT_PREFIX}
仅基于已确认的 intent、结果、质量问题和证据生成 Support-QA 文档草稿。草稿不是已发布知识；仅在当前权限允许的范围内执行；不得宣称未被工具确认的写入。`;

export const DEFAULT_LARK_TICKET_SUPPORT_QA_PROMPTS: Record<string, string> = {
  [LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY]: DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATE,
  [LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_KEY]: DEFAULT_LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_TEMPLATE,
  [LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_KEY]: DEFAULT_LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_TEMPLATE,
};

export const DEFAULT_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_TEMPLATE = `你正在为公司内部同事生成 Sprint Release Notes。

当前 Sprint 上下文：
{{sprint_context}}

用户请求：
{{user_message}}

只使用 Sprint 上下文中明确提供的信息。不要调用外部系统、不要写入任何系统、不要编造功能、影响范围、根因、上线状态或指标。输出简明中文 Markdown；省略没有可靠内容的章节。`;

export const DEFAULT_MEEGLE_SPRINT_INTERNAL_SUMMARY_PROMPT_TEMPLATE = `你正在为公司内部同事生成当前 Sprint 的内部进展摘要。

当前 Sprint 上下文：
{{sprint_context}}

用户请求：
{{user_message}}

只使用上下文中明确提供的信息，不调用或写入外部系统，不编造影响、根因、上线状态、日期或指标。

输出简明中文 Markdown：
- 本 Sprint 完成：按功能、问题修复、内部改进归纳，3–6 条。
- 需要关注：仅列出上下文明确支持的风险、依赖或待跟进事项；没有则省略。

每条最多两句。不要输出工作项 ID、人员、优先级、状态流转、原始链接、字段名、源码细节或原始 JSON。`;

export const DEFAULT_MEEGLE_SPRINT_CONFIRM_GAPS_PROMPT_TEMPLATE = `你正在检查当前 Sprint 已完成工作项中，哪些内容不足以可靠形成内部 Release Notes。

当前 Sprint 上下文：
{{sprint_context}}

用户请求：
{{user_message}}

只使用上下文中明确提供的信息，不调用或写入外部系统，不推测或补全缺失事实。

输出简明中文 Markdown：
- 待确认项：逐条说明缺少什么业务信息，以及建议向谁确认什么内容。
- 可直接纳入：仅列出信息已经足够、可直接写入 Release Notes 的事项数量和类型概览。

不要输出工作项 ID、人员、优先级、状态流转、原始链接、字段名、源码细节或原始 JSON。若没有待确认项，明确写“无待确认项”。`;

export function renderWorkflowPromptTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_match, key: string) => variables[key] ?? "",
  );
}
