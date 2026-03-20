# AI Agent / Skill 设计

## 1. 设计目标

AI 能力不直接写死在插件里，而是集中在服务端，以 `Agent + Skill` 形式组合，支持后续扩展不同场景。

## 2. Agent 设计

### 2.1 A1 Intake Agent

职责：

- 对支持工单做分类
- 判断是否直接处理、转 B2 或转 A2
- 输出缺失信息、风险等级和下一步建议

### 2.2 A2 Requirement Agent

职责：

- 把原始需求整理为结构化研发输入
- 识别信息缺口
- 生成进入 B1 所需的任务草稿
- 给出评审建议和拆分建议

### 2.3 PM Analysis Agent

职责：

- 拉取指定范围内的 Lark / Meegle / GitHub 最新数据
- 识别阻塞项、滞留项、描述不完整项和高风险项
- 输出一次性分析报告和建议动作

### 2.4 Dev Handoff Agent

职责：

- 基于 B1 / B2 当前任务与来源上下文生成提测说明草稿
- 输出影响范围、验证点和待关注事项

## 3. Skill 设计

### 3.1 A1 相关 Skill

- `ticket-classification`
- `missing-info-detection`
- `bug-draft-enrichment`
- `risk-assessment`

### 3.2 A2 相关 Skill

- `requirement-structuring`
- `gap-analysis`
- `dev-brief-generation`
- `review-recommendation`

### 3.3 PM 分析相关 Skill

- `cross-platform-summarization`
- `blocker-detection`
- `stale-item-detection`
- `next-action-suggestion`

### 3.4 通用 Skill

- `template-rendering`
- `schema-validation`
- `field-normalization`
- `identity-resolution`
- `meegle-meta-discovery`

## 4. 运行方式

一次典型请求的工作流如下：

1. 插件传入页面类型、上下文、当前识别用户
2. API Gateway 选择目标 Agent
3. Agent 调用平台 Adapter 拉取最新数据
4. Agent 按场景编排若干 Skill
5. 如果目标是 Meegle，先补拉项目类型、字段、模板与元数据
6. Agent 输出结构化结果
7. 结果通过 schema 校验后返回插件
8. 如果用户确认写入，再调用目标平台 Adapter

## 5. 输出约束

所有 Agent 输出都应尽量结构化，包括：

- 摘要
- 缺失字段
- 风险判断
- 建议动作
- 可编辑草稿

不允许只返回不可控的长文本结果。

## 6. Meegle 感知输出协议

对于会创建 `B1/B2` 的场景，Agent 不应只输出“建议标题 + 建议描述”，而应输出更贴近 Meegle 接口的数据结构：

- `target_project_key`
- `target_workitem_type_key`
- `name`
- `template_id`
- `field_value_pairs`
- `owner_user_keys`
- `missing_meta`
- `idempotency_hint`

这样执行层才能直接对接 `MeegleClient.create_workitem(...)`，同时保留对字段和模板的控制。

## 7. 一期重点

一期 AI 能力重点是 `A1` 和 `A2` 两条工作流；GitHub 相关能力主要用于交付状态读取与 PM 分析支撑。

## 8. 待补项

基于 `meegle_clients` 当前代码，仍需要后续补充：

- B1 / B2 对应的真实 `workitem_type_key`
- `field_value_pairs` 的精细映射规则
- `workflow task` 是否进入一期主流程
