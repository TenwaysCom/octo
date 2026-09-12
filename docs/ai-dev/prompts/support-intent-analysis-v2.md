# Support 意图识别提示词 v2

> 输出契约：`support-analysis-result-v1`（与 v1 相同，下游无需改动）
> intentType 10 类，与 server `SUPPORT_INTENT_TYPES`（server/src/domain/support-ticket-analysis.ts）一致，
> 使用 service_request（不含 feature_request）；intentSubtype 为封闭枚举，每个 intent 末尾带 `other` 兜底。
> 含离线条款：快照中没有任何消息时 evidenceMessageIds 允许为空数组。

```text
你正在分析一条 Lark Ticket。Server 已在下面提供当前 Ticket 的固定、脱敏证据快照；只使用这些内容，不调用任何工具、Shell、文件、Skill 或外部 API。

当前 Ticket：
{{ticket_context}}

用户请求：
{{user_message}}

# 任务
识别用户意图（intentType + intentSubtype）、问题结果和客服质量。先判断意图，再判断结果，最后评估质量。意图判断只依据用户在快照中表达的真实诉求，不依据工单标题里的人工分类。

# 意图定义与判定边界
intentType 只能是以下 10 个值之一，intentSubtype 只能从所选 intentType 对应的子类型列表中选取：

1. access_request — 请求开通、变更或关闭账号/权限/角色
   子类型：grant_permission（授予权限）、modify_permission（权限变更/移除角色）、account_setup（开户/注册）、other
   示例："给Chris加一个expense的权限"、"SKU创建权限变更"、"将审批人AP角色去掉"

2. troubleshoot — 用户遇到异常或疑惑，请求排查，但尚未定性为系统缺陷
   子类型：data_inconsistency（数据对不上/报表不平）、integration_sync（未回传/未推单/未同步）、workflow_stuck（无法validate/没有按钮/流程卡住）、report_issue（报表打不开/筛不出/缺数据）、case_lookup（帮我查某个单据状态）、other
   示例："US现流表与BS表对不上"、"订单没有根据回传信息更新WMS quantity"、"检查有没有回传POD LINK"

3. how_to — 咨询操作方法或业务规则，不涉及异常
   子类型：usage_guidance（如何操作）、business_rule（为什么这么设计/规则解释）、where_to_find（在哪里查看）、other
   示例："采购单如何把数量改为3"、"为什么Branding可以直接创建出库单"

4. bug_report — 用户明确指出系统行为错误（如说"submit bug"、描述计算/显示/集成结果明显错误）
   子类型：configuration_master_data、integration、data_consistency、permission_access、usability_display、reporting、workflow_status、performance、vendor_third_party、regression_change_side_effect、other
   示例："红冲发票也产生了摊销分录"、"cannot download the customs Invoice"
   与 troubleshoot 的边界：用户已断言是系统错误 → bug_report；用户只是求助排查原因 → troubleshoot。

5. service_request — 请求新功能、功能增强、规则或流程配置调整，以及数据/产品信息运维操作
   子类型：new_feature（新功能）、enhancement（现有功能增强）、config_change（审批流/计算规则/流程配置调整）、data_maintenance（导入数据/改银行信息/冲算等数据运维）、product_info_maintenance（改价/产品资料维护）、other
   示例："WRB2C订单也要填delivery methods"、"21% BTW services计算规则与标准不一致需要调整"、"导入UK 2026年公共假期"

6. follow_up — 针对已有问题的后续跟进，不提出新诉求
   子类型：status_inquiry（进度追问）、reminder（催办）、reopen（问题未解决/要求重开）、other

7. confirmation — 确认收到或确认问题已解决
   子类型：confirm_resolved（确认已解决）、confirm_received（确认收到）、other

8. escalation — 要求升级处理、表达不满或要求转交负责人
   子类型：urgent（紧急升级）、complaint（投诉/不满）、handover（要求转负责人）、other

9. chatter — 寒暄、感谢等与工单无关内容
   子类型：greeting、thanks、smalltalk、other

10. other — 以上均不适用
    子类型：unclassified

# 判定规则
- 一条消息同时包含多个诉求时，按此优先级取主诉求：bug_report > access_request > service_request > troubleshoot > how_to。
- follow_up、confirmation、escalation、chatter 只在本条消息不含新诉求时使用。
- 权限不生效（有权限却用不了）是 bug_report.permission_access 或 troubleshoot，不是 access_request。
- intentSubtype 只能从所选 intentType 的子类型列表中选取，严禁自造新值。每个列表末尾的 other 是兜底项：当所有子类型都不匹配时使用它，同时把描述该诉求的原始短语放入 keywords，并将 confidence 降至 0.6 以下。
- 如果连 intentType 都不确定属于哪一类，intentType 选 other、intentSubtype 选 unclassified，confidence 不超过 0.5。
- confidence 反映你对意图判断的把握：边界模糊（如问答类既像 how_to 又像 troubleshoot）时应低于 0.7，不要默认给 0.9。

# 输出要求
返回且只返回一个 JSON 对象。不得使用 Markdown 代码块，不得在 JSON 前后输出解释。结构必须严格为：
{"version":"support-analysis-result-v1","analysis":{"segmentKey":"primary","intent":{"intentType":"troubleshoot","intentSubtype":"integration_sync","confidence":0.9,"summary":"脱敏后的问题总结","keywords":["integration_sync"],"evidenceMessageIds":["om_xxx"]},"result":{"resolutionStatus":"pending","solutionSummary":null,"solutionSteps":[],"resolverRef":null,"resolvedAt":null,"autoResolvable":false,"suggestedAutomation":null,"confidence":0.8},"quality":{"scores":{},"summary":"客服质量摘要","criticalIssues":[],"warnings":[]}},"summary":"给用户展示的简洁中文问题总结"}

resolutionStatus 只能是 resolved、pending、escalated、needs_info、auto_closed。evidenceMessageIds 只能引用当前快照中明确出现的 Message ID，不能引用标题、序号或自行生成 ID；快照中没有任何消息时允许为空数组。事实与推断必须分开：快照中没有明确证据的解决状态、根因、解决步骤、负责人和时间一律不要编造，对应字段填 null 或空数组。
```

## 配套运营建议

落库后定期捞出 `intentSubtype = 'other'` 或 `confidence < 0.6` 的记录人工 review，作为子类型枚举的迭代信号。
