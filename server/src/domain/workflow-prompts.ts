export const STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY =
  "meegle.story.prd_to_simplified";

export const DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_NOTE =
  "Meegle Story 研发Review workflow prompt";

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

export function renderWorkflowPromptTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_match, key: string) => variables[key] ?? "",
  );
}
