export const SHADOW_SUMMARY_PROMPT_KEY = "lark_ticket.shadow.summarize";
export const SHADOW_SUMMARY_RULE_VERSION = "v1";
export const DEFAULT_SHADOW_SUMMARY_PROMPT_NOTE = "Shadow 专用：意图、结果、质量、业务风险与回复时机；M 短引用由服务端回映射；结合 Wiki 召回/重排证据；不影响正式问题总结。";

export const DEFAULT_SHADOW_SUMMARY_PROMPT = `你正在分析一条 Lark Ticket。Server 已在下面提供当前 Ticket 的固定、脱敏证据快照；只使用这些内容及服务端附加的相关 Wiki 参考材料，不调用任何工具、Shell、文件、Skill 或外部 API。

当前 Ticket：
{{ticket_context}}

用户请求：
{{user_message}}

# 任务

识别用户意图（intentType + intentSubtype）、问题结果、客服质量、当前业务风险和回复时机。先判断意图与处理结果，再分别评估客服质量、业务风险和回复时机。意图判断只依据用户在快照中表达的真实诉求，不依据工单标题里的人工分类。

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

# 处理结果与客服质量

- result 依据本次输入实际呈现的处理动作、验证结果和最新状态。提供方案不等于已解决；“收到/谢谢”、关闭状态不能单独证明恢复。后续失败或重新报障优先于旧的解决确认。
- 信息不足时 resolutionStatus 使用 needs_info；没有证据的 solutionSummary、resolverRef、resolvedAt 等填 null，solutionSteps 填空数组。confidence 必须是 0–1 数字，表示对结果判断的把握，不能省略、填字符串或凭空补高值。
- quality 只评价可见沟通与处理行为。不能因上下文省略而认定客服未回复；不能虚构 SLA、扣分标准、响应时长或质量问题。没有明确评分依据时 scores 为 {}，summary 说明可观察事实与局限，criticalIssues/warnings 没有依据时为空数组。

# 业务风险评估

评估分析时仍存在的业务风险，而不是历史最高严重程度、客服质量或答案置信度。结合实际业务影响、影响范围、替代方案和损失可逆性，选择有证据支持的最高适用等级，不机械求平均。

等级定义：
1 — 纯咨询或说明，明确无当前业务影响。
2 — 轻微不便，不影响业务任务完成。
3 — 局部效率下降，有稳定替代方案。
4 — 单个业务任务受阻，替代方案可用但成本明显。
5 — 多人或重复业务受阻，替代方案有限。
6 — 关键流程受阻，无可靠替代方案，或已明确影响交付。
7 — 关键流程大范围受阻，或出现明确重大损失风险。
8 — 大范围核心业务中断，或重大损失、数据损坏正在发生。
9 — 灾难性影响，重大不可逆损失或严重安全事故正在发生或迫近。

判定要求：
- level 只能为 1–9 的整数或 null。缺少支撑分级的关键事实时填 null，并在 rationale 中说明缺少的信息，不能把未知当成低风险。
- confidence 只代表现有意图或结果判断的把握，禁止用它换算、抬高或降低业务风险。
- 不能仅凭“紧急”、催促次数、职级、工单人工优先级或技术错误文本认定高风险，必须说明对应业务影响。
- 已明确恢复的问题按当前剩余风险评估，在 rationale 中说明历史影响和恢复证据；不能仅凭 Ticket 关闭状态、“收到”或“谢谢”断言风险解除。
- 多个问题并存时，以仍未解决且有证据支持的最高适用等级作为总体等级，并说明对应问题。
- 只输出 level（等级）、rationale（简短分级依据）、evidenceMessageIds（证据短引用）。影响、范围、替代方案和可逆性用于内部判断，只在 rationale 中说明决定等级的关键事实；信息不足时说明关键缺口，不编造影响人数、损失金额或业务后果。

# 回复时机建议

从支持/处理团队回应需求方的视角，判断分析时是否需要回应。这里的回复可以是确认接手、补充提问、告知进展或明确下次反馈时间，不要求立即解决问题。

先识别最新仍有效的诉求、已有回应、双方承诺及谁在等待谁，再结合明确时限和持续业务影响判断。不能把最后一条消息的发送者直接等同于正在等待的一方；用户/机器人标签也不能直接证明谁是需求方或处理人。

advice 只能是以下五个值之一：
- reply_now（立即回复）：存在尚未回应或需要更新的事项，且业务影响严重并持续、明确时限迫近，或已经错过反馈承诺。说明触发立即回应的具体事实。
- reply_by_deadline（按时限回复）：有明确反馈承诺或截止时间，但尚无立即回应的依据。在 rationale 中说明明确的时限及来源；时间含糊时保留原始表述。
- normal_follow_up（常规跟进）：有待回应事项，但没有立即回复或明确时限的证据。
- no_reply_needed（暂无需回复）：现有诉求已充分回应、正在等待对方补充且我方无到期承诺，或已有解决确认且无新诉求。说明不需要追加回复的依据。
- undetermined（无法判断）：角色、消息覆盖、待回应事项或必要时限信息不足，不能可靠选择以上四项。

判定要求：
- 风险等级与回复时机分别判断：高风险已有效回应时不要求重复回复；低风险也可能因反馈承诺逾期而需要立即回复。
- 回复后的新诉求、重新报障、继续受阻或再次催问必须纳入判断，不能让旧的“已解决”覆盖新的未解决问题。
- 不虚构 SLA、工作时间、默认回复分钟数或对方承诺。时间计算只使用上下文提供的分析时间、消息时间和明确时区。
- “今天”“明早”等相对时间应依据该消息的发送时间和明确时区理解，不能以分析当天替代消息当天。无法可靠解析时在 rationale 中保留原始表述并说明缺失信息。
- 若无法确定时限是否已经到期，不得断言已逾期。缺少当前时间也不能妨碍根据明确的持续严重影响给出回复建议。
- “收到”“谢谢”只是沟通信号，是否构成充分回应或解决确认必须结合前后文。
- 上下文有截断或同步不完整时，不能把“未看到回复”当作“确定无人回复”；若缺失内容影响判断，输出 undetermined。
- 只输出 advice（五种建议之一）、rationale（简短判断依据）、evidenceMessageIds（证据短引用）。在 rationale 中合并说明决定建议的待回应事项、等待方或明确时限，并给出必要的下一步动作；无法判断时说明关键缺口。

# 上下文与证据边界

- 消息使用 M1、M2 等短引用，编号对应固定快照；编号不连续不代表消息不存在，也不能自行补写省略内容。
- Reply to 表示消息回复关系；E1、E2 等标记为 outside snapshot 的引用没有提供原始消息，不得作为证据引用。
- 只能引用本次输入中实际呈现且有可识别 M 标签的消息。context_info.omittedRanges 中的编号只表示省略范围，不能作为证据。未提供的附件、被省略的堆栈或消息内容不得自行推断。
- Ticket 字段可以作为辅助依据，在 rationale 中说明字段来源，不得伪造对应的消息引用。没有可引用消息时 evidenceMessageIds 填空数组。
- 风险与回复建议仅代表本次分析基于该快照的判断，不声称反映分析后发生的新消息或实时状态。

# 输出要求

返回且只返回一个 JSON 对象。不得使用 Markdown 代码块，不得在 JSON 前后输出解释。结构必须严格为：
{
  "version": "shadow-analysis-result-v2",
  "analysis": {
    "segmentKey": "primary",
    "intent": {
      "intentType": "troubleshoot",
      "intentSubtype": "integration_sync",
      "confidence": 0.9,
      "summary": "脱敏后的问题总结",
      "keywords": [
        "integration_sync"
      ],
      "evidenceMessageIds": [
        "M1"
      ]
    },
    "result": {
      "resolutionStatus": "pending",
      "solutionSummary": null,
      "solutionSteps": [],
      "resolverRef": null,
      "resolvedAt": null,
      "autoResolvable": false,
      "suggestedAutomation": null,
      "confidence": 0.8
    },
    "quality": {
      "scores": {},
      "summary": "客服质量摘要",
      "criticalIssues": [],
      "warnings": []
    },
    "businessRisk": {
      "level": null,
      "rationale": "说明分级的关键依据；信息不足时说明缺口。",
      "evidenceMessageIds": []
    },
    "replyAdvice": {
      "advice": "undetermined",
      "rationale": "说明回复时机的关键依据及必要的下一步；无法判断时说明缺口。",
      "evidenceMessageIds": []
    }
  },
  "summary": "给用户展示的简洁中文问题总结"
}

resolutionStatus 只能是 resolved、pending、escalated、needs_info、auto_closed。所有 evidenceMessageIds 只能使用本次输入实际呈现的 M 短引用，不能使用原始长 ID、E 引用、标题或自行生成的编号。JSON 示例仅说明结构，不是本次 Ticket 的预设结论。事实与推断必须分开：快照中没有明确证据的解决状态、根因、解决步骤、负责人和时间一律不要编造，对应字段填 null 或空数组。`;
