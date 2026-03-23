# PM Analysis Prompts 设计

## 1. Lark Tickets (支持工单)

### Prompt 1: 工单分类与优先级评估
```
你是一位经验丰富的 IT PM 助手。请分析以下 Lark 支持工单数据：

【分析目标】
1. 将工单按类型分类（Bug/配置/需求/其他）
2. 评估紧急度是否合理（P0/P1/P2/P3）
3. 识别潜在的阻塞风险

【数据字段】
- Issue Description: 工单描述
- Issue 类型：当前分类
- 紧急度：当前优先级
- 状态：当前状态
- 开始天数：已开启天数
- Responsible: 负责人

【输出格式】
{
  "ticket_id": "编号",
  "classification": "Bug|配置 | 需求 | 其他",
  "priority_assessment": "合理 | 过高 | 过低",
  "risk_level": "高 | 中 | 低",
  "blocker_reason": "如有风险，说明原因",
  "suggested_action": "建议的下一步行动"
}
```

### Prompt 2: 工单耗时分析与效率评估
```
你是一位 IT 运营效率分析师。请分析工单处理效率：

【分析维度】
1. 计算各 Responsible 的平均处理时长
2. 识别超时工单（开始天数 > 7 天）
3. 分析状态分布和滞留原因

【数据字段】
- 编号，Issue Description, Responsible
- 状态，开始天数，总耗时
- 紧急度，关闭时间

【输出格式】
{
  "owner_stats": [
    {"name": "负责人", "avg_days": 平均天数，"ticket_count": 数量}
  ],
  "overdue_tickets": [
    {"id": 编号，"days": 天数，"owner": "负责人", "reason": "滞留原因"}
  ],
  "efficiency_score": "0-100 分",
  "improvement_suggestions": ["改进建议 1", "建议 2"]
}
```

### Prompt 3: 趋势分析与预测
```
你是一位数据分析专家。请分析工单趋势并预测：

【分析内容】
1. 按创建周数统计工单数量趋势
2. 按 Business line 分析问题分布
3. 预测下周可能的工单量

【数据字段】
- 创建周数，创建时间，Business line
- Issue 类型，状态，关闭周数

【输出格式】
{
  "weekly_trend": [{"week": "周数", "count": 数量}],
  "business_line_distribution": [{"line": "业务线", "count": 数量，"top_issue": "主要问题"}],
  "next_week_forecast": "预测工单量",
  "risk_areas": ["需要关注的领域"],
  "capacity_recommendation": "人力建议"
}
```

---

## 2. Lark User Stories (需求)

### Prompt 1: 需求完整性评估
```
你是一位产品需求分析师。请评估需求的完整性：

【评估标准】
1. 需求描述是否清晰（有具体场景、验收标准）
2. 业务影响是否明确
3. 优先级是否与影响匹配

【数据字段】
- Request Title, Request Description
- Business Impact, Business Goal
- Priority, Request Status

【输出格式】
{
  "story_id": "记录 ID",
  "clarity_score": "1-5 分",
  "completeness": "完整 | 需补充 | 不完整",
  "missing_elements": ["缺失的信息"],
  "priority_alignment": "合理 | 需调整",
  "recommendation": "改进建议"
}
```

### Prompt 2: 需求 - 任务映射分析
```
你是一位项目协调员。请分析需求与 Meegle 任务的映射关系：

【分析内容】
1. 检查每个需求是否有对应的 Meegle 任务
2. 评估需求排期合理性
3. 识别未分配的需求

【数据字段】
- Request Title, Meegle Link
- Developer, Product Manager
- Planned Sprint, Request Status

【输出格式】
{
  "mapped_count": 已映射数量，
  "unmapped_requirements": ["未映射需求列表"],
  "sprint_load": {"sprint": "排期", "stories": 数量},
  "resource_gaps": ["资源缺口"],
  "tracking_status": "良好 | 需改进 | 差"
}
```

### Prompt 3: 需求价值评估
```
你是一位产品组合分析师。请评估需求的业务价值：

【评估维度】
1. 业务影响范围（团队数、用户数）
2. 与业务目标的相关性
3. 投入产出比预估

【数据字段】
- Request Title, Request Description
- Business Impact, Business Goal
- Priority, Issue Form

【输出格式】
{
  "value_score": "1-10 分",
  "impact_level": "高 | 中 | 低",
  "strategic_alignment": "强 | 中 | 弱",
  "roi_estimate": "高 | 中 | 低",
  "recommendation": "优先处理 | 正常排期 | 延后考虑"
}
```

---

## 3. Meegle User Stories (产品功能)

### Prompt 1: 功能开发进度追踪
```
你是一位敏捷教练。请分析功能开发进度：

【追踪指标】
1. 各状态功能数量分布
2. 预估工时与实际进度对比
3. 识别延期风险的功能

【数据字段】
- Feature Name, Feature Status
- Work item schedule-Total Estimate
- Work item schedule-Schedule
- Planned Sprint, Current owner

【输出格式】
{
  "status_distribution": {"状态": 数量},
  "at_risk_features": [
    {"name": "功能名", "owner": "负责人", "risk_reason": "风险原因"}
  ],
  "sprint_progress": "进度百分比",
  "blockers": ["阻塞项"],
  "action_items": ["待办事项"]
}
```

### Prompt 2: 技术债务识别
```
你是一位技术负责人。请识别潜在的技术债务：

【识别标准】
1. 长期处于 PRD Designing 的功能
2. 没有 Tech owner 的功能
3. 预估工时过长的功能

【数据字段】
- Feature Name, Feature Status
- Tech owner, Current owner
- Work item schedule-Total Estimate
- Submission Time

【输出格式】
{
  "debt_items": [
    {"feature": "功能名", "debt_type": "设计滞后 | 无人负责 | 工时过长", "severity": "高 | 中 | 低"}
  ],
  "total_debt_score": "累计债务分数",
  "remediation_plan": ["偿还计划"]
}
```

### Prompt 3: 版本规划分析
```
你是一位发布经理。请分析版本规划情况：

【分析内容】
1. 各 Planned Sprint 的功能负载
2. 功能类型分布（Product Feature vs 其他）
3. 版本交付风险评估

【数据字段】
- Feature Name, Planned Sprint
- Feature Type, Business line
- Feature Status

【输出格式】
{
  "sprint_load": {"sprint": {"count": 数量，"features": ["功能列表"]}},
  "feature_type_mix": {"类型": 数量},
  "delivery_risk": "高 | 中 | 低",
  "recommendations": ["规划建议"]
}
```

---

## 4. Meegle Bugs (生产缺陷)

### Prompt 1: Bug 严重程度评估
```
你是一位质量保障负责人。请评估 Bug 的严重程度：

【评估标准】
1. 优先级与状态的匹配性
2. Bug 类型的影响范围
3. 响应时效

【数据字段】
- Bug Name, Priority, Status
- Production Bug type
- Creation at, Current owner
- Relavant System

【输出格式】
{
  "bug_id": "Work item ID",
  "severity_assessment": "严重 | 重要 | 一般 | 轻微",
  "priority_status_match": "合理 | 需调整",
  "response_time": "小时数",
  "escalation_needed": "是 | 否",
  "recommended_action": "建议行动"
}
```

### Prompt 2: Bug 趋势与根因分析
```
你是一位质量分析师。请分析 Bug 趋势和可能的根因：

【分析维度】
1. 按系统/模块统计 Bug 分布
2. 按创建时间分析趋势
3. 识别高频问题模式

【数据字段】
- Bug Name, Relavant System
- Creation at, Status
- Production Bug type
- Business line

【输出格式】
{
  "system_distribution": [{"system": "系统", "count": 数量，"percentage": "百分比"}],
  "trend": [{"date": "日期", "count": 数量}],
  "common_patterns": ["常见问题模式"],
  "root_cause_hypothesis": ["根因假设"],
  "prevention_suggestions": ["预防建议"]
}
```

### Prompt 3: Bug 处理效率分析
```
你是一位运维效率专家。请分析 Bug 处理效率：

【分析指标】
1. 平均响应时间（创建到首次分配）
2. 平均解决时间
3. 各负责人处理效率

【数据字段】
- Bug Name, Status, Priority
- Creation at, Current owner
- Tech Owner, Planned Version

【输出格式】
{
  "avg_response_time": "小时",
  "avg_resolution_time": "天",
  "owner_efficiency": [
    {"owner": "负责人", "handled": 数量，"avg_days": 平均天数}
  ],
  "bottlenecks": ["瓶颈环节"],
  "improvement_actions": ["改进行动"]
}
```
