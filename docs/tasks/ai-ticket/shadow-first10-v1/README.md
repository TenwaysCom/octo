# Shadow AI：前十分钟动作评测候选集 v1

2026-10-23已按确认标准逐条复核，最新入口见[分类复核v2](../shadow-first10-v2/README.md)：6条动作改判建议，新版对照页逐条展示标准、证据及human/wait边界。下文保留v1的原始候选统计和冻结记录，供追溯比较。

已准备 **120 个真实 Ticket / 120 个去重 thread**，每个样本在 thread 起始十分钟结束时判断下一步。证据范围经用户确认：**仅前十分钟聊天，不提供 Wiki 或后台查询结果**。标注全部为本次 AI 草案，人工 gold **0 条**，没有执行被测模型评估。

## 与原意图和问题分析一起看

新增[并排对照页](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1-comparison/comparison.private.html)、[合并CSV](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1-comparison/comparison.private.csv)和[合并JSONL](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1-comparison/comparison.private.jsonl)。按相同 `S10` 编号与Ticket对齐，左侧是当前十分钟的诉求/动作/理由/证据/阻塞及恢复条件，右侧展开原Shadow的意图、诉求描述、问题/分析总结、置信度和版本时间；下面可查看十分钟消息。

**111例有原Shadow分析，9例冻结导出缺失**，缺失时不从人工标题或其他AI字段补造。现有Shadow没有独立`question`字段：展示的原诉求描述取`intent.summary`，原问题/分析总结取顶层`summary`（FE当前“问题总结”展示字段），两者保留原含义，不生成新的旧问题标签。

原分析的输入窗口无法确认，可能已经包含后续消息与解决结果，**只供历史比较，不是十分钟评测输入或gold**。对照页的历史分析默认折叠，独立标注时先判断再展开。111/9是本地冻结导出覆盖，不是当前线上覆盖；本次未查询数据库、平台或重新调用模型。含历史分析的CSV/JSONL仅用于复核比较，模型仍只能读取下面单独的`model-inputs.private.jsonl`。

v1所有输入、标签、复核原件及冻结校验记录保持不变。新增结果和来源核对见[比较校验](comparison-verification.json)，生成入口：

```bash
python3 -B server/examples/shadow-action-eval/compare_shadow.py \
  --out evals/lark-ticket-ai/artifacts/shadow-first10-new-comparison
```

该脚本校验原v1代码/产物哈希与逐票源快照哈希后才关联历史字段，拒绝覆盖已有目录。抽取6项及历史对照4项合成单测共10项通过；新增对照不代表真实模型评估、人工签核或线上页面功能。

## 直接使用

材料最初只保存在本机gitignored目录。2026-10-26用户明确要求数据集入`feat/add-evals`，本分支因此显式跟踪本表对应的冻结文件及已交付比较版本；其他临时产物仍忽略。本机生成权限为目录0700、文件0600，Git检出权限不构成访问控制。材料经过原有prepared脱敏及附加联系方式处理，**仍可能含业务信息和姓名，不能当作完全匿名化的公开数据**。

| 文件 | 用途 |
| --- | --- |
| [120例阅读页](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1/review.private.html) | 按消息阅读，展开 AI 标注；浏览器查找可定位 `S10-001` 等 ID |
| [人工复核 CSV](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1/review.private.csv) | 输入、候选动作、完整标签 JSON、审核列；UTF-8 BOM，单元格保留真实换行 |
| [模型输入 JSONL](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1/model-inputs.private.jsonl) | 后续模型唯一输入来源；只有 `id` 和 `input`，不含答案或抽样提示 |
| [AI 候选标签 JSONL](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1/labels.ai-draft.private.jsonl) | `state`、`expected`、`review`；不可宣称人工 gold |
| [提取及来源 JSONL](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1/cases.private.jsonl) | 来源路径/哈希、thread 去重键、输入、分组及后续消息排除数量；不要发给模型 |
| [标注原稿](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1/label-notes.private.tsv) / [逐轮状态原稿](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1/state-notes.private.json) | 复现候选标注组装；前者用竖线分隔，扩展名保留准备阶段命名 |
| [冻结校验与安全 manifest](verification.json) | 120 条来源/输入哈希、产物哈希、统计与校验范围，不含聊天正文 |

本分支跟踪的选定文件会随Git检出分发；外部raw来源库、同级准备草稿和截图不纳入分支，也不作为正式v1输入。冻结文件内容及哈希保持不变。

## 数据来源和时点

只读 `/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/raw/transcripts/ticket-*.md`。3,964 份文件对应 2,055 个 Ticket，1,909 份为同票多版本；按 `ingested`、`source_updated_at`、文件名选择最新导出，最新不完整时不回退旧版。排除：完整性未确认 104、声明条数与解析不符 29、无消息 1、重复 thread/相同文本 24；最终候选池 **1,897**。这是本地导出范围，不是当前线上全量。

1. `t0` 为完整性标记为真的导出中第一条消息创建时间，作为 thread 起点代理；没有另行验证 Lark 根消息身份。
2. 窗口是闭区间 `[t0, t0 + 10min]`，决策时点固定为 `t0 + 10min`，相同时间按原导出顺序保留。
3. 纳入窗口的所有消息全文保留，不因某条显得更像问题而移后起点。原文已经截断的 3 条案例显式标记 `source_text_truncated`，不自行补全文。
4. 只提取线程段。Ticket 标题、状态、解决方案、事后分类、Shadow AI、Wiki、后续聊天均不作为模型输入。120 例共保留 **326 条消息**、排除 **1,007 条后续消息**。
5. 使用创建时间筛选，但导出缺编辑版本和当时接收时间。**不能证明消息文字在十分钟结束时就是当前版本，也不能声称严格历史在线重放**。`historical_edits_verified=false`、`prior_agent_state=null` 必须保留。
6. `M1` 等引用只在样本内有效；回复关系仅在导出具备原 ID 时回映射，未知时为 `null`，不能推测。平台 `sender_role=user` 不等于业务提问者，保留匿名发言者编号，不按编号强分客服与客户。
7. 91 例有不可读取附件，包括图片/富文本占位符。只据文字判断，不使用 OCR，不把附件缺失自动等同于主问题不清；链接、联系方式的隐藏也可能使案例无法定位，须遵守当前可见范围。

## 候选构成与覆盖

| 动作 | AI 草案数量 | 语义 |
| --- | ---: | --- |
| `answer` 回答 | 4 | 窗口内有足够文字证据回答当前问题；必须遵守 `answer_boundary`，不得扩展为修复/授权/根因已确认 |
| `clarify` 追问 | 22 | 一个尚未问过、用户可补充且有决策价值的必要问题 |
| `human` 需人工处理 | 64 | 需要技术核查、业务决策或有权限的实际操作，当前尚无明确等待中的下一步可复用 |
| `wait` 等待 | 30 | 已问待答、已有具体核查过程待反馈，或当前没有待答诉求；明确 `waiting_for` 与恢复条件 |

这些是按文字材料提出的标签建议，不是模型输出成绩，也不是线上动作分布。`answer` 仅评估有限解释/导航能力；不能用 4 例推断完整回答质量。主问题清楚 112、不清楚 8；追问 22 例中主问题追问 6、前提追问 16，另外 2 个主问题不清的案例因已经问过而标为等待。

已人工式逐例阅读并由当前 AI 写入问题历史 38 例、纠正/补充历史 16 例，23 例有未答或部分回答的问题。这里“纠正/补充”包括消除歧义和新增诉求，不全部是用户反驳。抽样阶段 `correction` 等字符串提示只用于筛选，不是这些语义标签。

初始 100 例按固定哈希种子及五类提示选取；分组在动作标注前锁定。额外 20 例是阅读材料后针对主问题不清、重复追问和有限回答补选，全部进开发组。随后按 manifest 固定成员与顺序，避免文本处理变化使 ID 与标注错配。最终 **开发 98 / 预留 22**，同 thread 不跨组。预留各类数量见 verification，**不是四分类均衡测试集，回答为0**。11 个开发 Ticket 曾出现在既有 RAG eval 的可索引样本文件中，预留与这些文件的 Ticket 交集 0；此检查不证明未被人或其他系统见过，也未覆盖所有历史实验。

## 标注判定顺序

先重建当前诉求，吸收窗口内补充和纠正，再判断缺口属于哪一类：

- `main_problem`：不知道具体要解决什么或做什么。例如只有单号与图片、只有“Type有误”。先问对象/动作/目标。
- `prerequisite`：已知道问题是什么，但缺必要的错误文本、实例编号、字段值或条件。只问能改变下一步判断的信息，避免完整表单式盘问。
- `investigation`：需要核对后台、接口回执、性能或真实账实；不能不断把核查责任转为用户补资料。
- `authority`：需要人员权限、财务/库存/主数据操作或业务批准；不把申请当已授权，不直接执行。
- `knowledge`：当前材料缺少可信的功能或规则说明；不能用模型自带知识冒充当前系统事实。
- `none`：当前回答有依据或没有新的待答诉求；仍可记录后续计划尚未完成，不代表整票已解决。

动作与缺口是两条轴。例如同样缺环境/错误信息，未问过时可能追问，已经问过则应等待；用户已补充则更新状态，不能继续沿旧问题追问。已有人的答复不自动意味着已接单；推荐某人处理也不等于对方正在排查。完整处理前提与主问题清晰度独立判断。

四类动作只表示下一步决策，不触发对外发言、派单或平台变更。`wait` 的 `no_open_request` 表示本轮不再发言，不推导定时器；其他等待必须注明等谁及何种新事实触发重判。不能仅凭十分钟没有新消息认定超时、拒绝服务或工单已关闭。

## 输出契约与人工复核

候选标签是 `{id, split, state, expected, review}`。`state` 包含当前诉求、清晰度、缺口、问题历史、补充/纠正和缺失条件；`expected` 包含四类动作、理由、证据、阻塞与恢复条件、必要追问或有限回答边界、等待对象和禁止推论。业务证据引用只允许当前样本可见 M ID。

后续被测输出契约见 [prediction.schema.json](prediction.schema.json)，可用 [离线判定提示模板](evaluation-prompt.md)配合 `model-inputs.private.jsonl`，不把候选标签或抽样理由放入输入。它是未来动作设计用的数据契约，**不是现有 Shadow API 已支持的格式**。

人工先独立读窗口再展开候选，检查主问题、证据充分性、历史问答状态、纠正是否真正替代旧事实及下一步动作。复制 CSV 到另一个受限文件后审核，保留冻结原件。`review_status` 可填 `approved / revised / disputed / excluded`；每条填写真实 `reviewer`、`reviewed_at`、`notes`，在 `adjudicated_label_json` 放入经审定的完整标签，保留原始候选。分歧由业务与技术复核人员讨论；无法消除时保持 `disputed`，不计准确率分母。不得由 AI 代填人工身份或批量批准。

确认后另存新版本 `gold.private.jsonl`，逐条将 `review.status` 改为 `approved`、填实际审核信息并设 `gold_eligible=true`；修订结果及理由需保留。**本次未提供 CSV→gold 自动导入器或模型执行器**，防止把空白审核当通过。后续若增加时间点，同 thread 的所有变体必须沿用当前分组；预留案例不能用于提示调优或训练。

## 后续评估方式

人工 gold 成立后，以固定输入对比模型，保留提示/模型/代码版本、输入与输出哈希，先报告无效结构比例，再报告有效输出及端到端动作准确率、四类 precision/recall/F1、macro-F1、混淆矩阵和各组分母。无效输出在端到端准确率中计错，缺失类别显示 N/A，不当作满分。当前草案多数类基线为 64/120，单看总准确率容易奖励一律转人工。

另行人工核查：主问题/前提区分、引用是否支撑结论、是否重复询问已答或未答问题、是否忽略纠正、是否把猜测当事实、等待对象/恢复条件是否可执行。违规率使用对应可评案例为分母，必须报告分母；不能仅用问题文字完全相同来判“重复”，或用 evidence ID 合法来证明推理正确。理由/追问文案按语义评分，不做逐字相等。

本集是单个时间点的材料判断，能检查追问倾向及短历史状态，**不能单独证明不会无限追问**，也不覆盖新消息并发、过期结果、持续多轮状态或对外执行。下一批应补独立的回答案例和跨轮回放；先保持这 120 例与标签版本冻结，不以现有测试结果倒调标签。

## 复现与验证

从仓库根目录运行，Python 标准库即可，无新增依赖、模型请求、数据库连接或平台写入：

```bash
# 复查已交付的本地输入、标签、CSV及源快照，不改文件
python3 -B server/examples/shadow-action-eval/dataset.py validate \
  --out evals/lark-ticket-ai/artifacts/shadow-first10-v1 \
  --frozen-manifest docs/tasks/ai-ticket/shadow-first10-v1/verification.json

# 在全新目录重新抽取；来源更新后可能不同，须核对源/输入哈希
python3 -B server/examples/shadow-action-eval/dataset.py prepare \
  --out evals/lark-ticket-ai/artifacts/shadow-first10-new-extraction \
  --selection-manifest docs/tasks/ai-ticket/shadow-first10-v1/verification.json

# 合成材料抽取单测，不调用真实平台或模型
python3 -B -m unittest discover -s server/examples/shadow-action-eval -p 'test_*.py' -v
```

抽取和语义标注分开。重新组装需复制已冻结的两份 `*-notes.private.*` 到新的提取目录，再执行 `assemble --out <新目录>`；先核对 case ID/Ticket/输入哈希与本版相同，源数据变动时不能机械复用旧标签。脚本使用排他创建，拒绝覆盖已有产物。

静态核查：唯一性、时间范围、原始重新抽取一致、输入不含标签/事后字段、证据与回复引用可解析、动作条件字段、CSV回读、分组、文件哈希通过。6项合成材料单测覆盖十分钟边界、事后信息排除、最新快照不完整、去重、异常时间/条数、回复与附件、脱敏不吞相邻业务词。它们不验证标注语义正确性、历史文本未编辑、真实消息到达时间或模型能力。应用测试套件、mock/live E2E、部署验证和真实模型评估均未执行，本次没有应用行为变更。

- [任务与验收记录](../2026-10-22-shadow-first10-eval-dataset.md)
- [能力地图](../../../tenways-octo/ticket-ai-qa-agent-capability-map.md)
- [准备与校验脚本](../../../../server/examples/shadow-action-eval/dataset.py)
