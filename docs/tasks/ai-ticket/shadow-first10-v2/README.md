# Shadow AI 120例：分类复核 v2

2026-10-23按会话确认的四分类标准，当前AI重新逐条阅读了120例冻结的十分钟消息，重点检查human与wait。**6条动作改判建议，114条保留原动作；人工gold仍为0**。原120个样本、十分钟模型输入、开发98/预留22的分组、v1标签及原历史对照文件全部保留。

## 查看新版

- [新版对照页](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v2-recheck-20261023/comparison.private.html)：120条均直接显示适用标准、本例依据、human/wait边界及原→复核分类；可展开消息证据原句，按分类或仅改判筛选，也可用编号定位。
- [合并复核CSV](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v2-recheck-20261023/comparison.private.csv)：每条依据、原/新分类、证据、阻塞/恢复条件、原Shadow及人工审核空列。
- [新候选标签JSONL](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v2-recheck-20261023/labels.ai-rechecked.private.jsonl)：`review.status=ai_rechecked`、`gold_eligible=false`。
- [逐条分类依据JSONL](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v2-recheck-20261023/classification-basis.private.jsonl)：每条标准代码、分类理由、边界解释、消息摘录和修订字段。
- [完整对照JSONL](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v2-recheck-20261023/comparison.private.jsonl)：保留旧候选、新候选、十分钟输入和隔离的历史参考。

2026-10-26用户要求将数据集放入`feat/add-evals`。本分支显式跟踪v1原件、原历史比较及本版复核三个目录内的17份交付文件，约5MB；准备草稿和截图仍保持忽略。样本可能包含业务信息和姓名；本机生成的0700/0600权限不是Git检出后的访问控制。模型继续只读[v1冻结输入](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v1/model-inputs.private.jsonl)，不能使用包含标签和历史分析的比较文件。所有冻结内容及既有哈希不变。

## 复核结果

| 动作 | 原候选 | 复核候选 |
| --- | ---: | ---: |
| answer | 4 | 2 |
| clarify | 22 | 23 |
| human | 64 | 68 |
| wait | 30 | 27 |

以下均为AI复核建议，不是人工签核，也不是被测模型成绩：

| 样本 | 原 → 复核 | 分类依据摘要 |
| --- | --- | --- |
| S10-001 | wait → human | 已有后台观察，但仍只是请求再查和权限猜测，没有覆盖状态矛盾的接手承诺。 |
| S10-014 | wait → human | 提出应登记的状态重置bug，不等于已经登记、排查或承诺修复。 |
| S10-019 | wait → human | 同一位用户继续问仓库命名，是待人工决定的新问题，不是处理人向用户索要前提。 |
| S10-083 | human → clarify | 虽有单号，但未给实际与期望交付数量，先补必要条件才知道是否有差异。 |
| S10-116 | answer → human | 只指出已有SKU列表，会遗漏清单准确性与SKU不可选的主要未解决请求。 |
| S10-117 | answer → human | 重复已有导航指引不能覆盖来源单据与账号可见性核查，尚无人明确接手。 |

另有不改变动作的修订：S10-068、093、104的主目的其实可辨，应属**处理前提不足**，而非主问题不清；S10-023把缺口细化为当前系统规则/能力缺可信依据。S10-043维持wait，但改成`no_open_request`：有人报告Done且没有新问题，不虚构必须等待的验收任务。S10-113仍为wait，但明确另一位只说me too的用户尚未提供单号，不能将首张单据临时处理推成所有人已恢复。

复核后的27条wait细分为：必要待答/确认13、明确处理承诺2、用户操作/恢复验证6、本轮无待答诉求6。原human中没有改为wait的案例；其中1条因关键用户条件尚缺而改为clarify。

## 分类标准与逐条依据

本次标准的权威结构化记录是[classification-criteria.json](classification-criteria.json)，页面也可展开查看：

- A01：当前问题有足够文字证据作有用且有边界的回答；不能只挑能答的小问题而遗漏主要未满足请求。
- Q01/Q02：分别处理主问题不清、必要处理前提不足；用户能补充且补充会改变下一步，同一有效问题已经问出则等待。
- H01/H02/H03：分别需要人工核查、授权/业务决策及实际变更、可信当前规则/功能核实，且没有已生效的等待步骤覆盖当前诉求。
- W01/W02/W03/W04：分别已有必要待答事项、明确接手/承诺、具体用户操作/恢复验证、本轮无待答诉求。

重点是等待事件的**提出者、内容和覆盖范围**。用户提出新问题、提及某个人、建档、建议登记bug或有人曾经回复，不自动构成wait；已回答或被纠正的问题也不能继续作为等待理由。部分事项已回复不能吞掉整票其他未满足请求。不自行新增等待时长、超时或升级规则。

120条的语义判断由本次AI逐条阅读完成，私有[复核原稿](../../../../evals/lark-ticket-ai/artifacts/shadow-first10-v2-recheck-20261023/recheck-notes.private.psv)保留。打包脚本只校验和组装已写明的判断，不通过关键词或问号自动判动作。每条记录包含具体依据和human/wait边界，消息摘录只来自当前十分钟输入，长消息标明摘录并可展开原消息核对。

## 历史参考与审核边界

原Shadow仍是111例可用、9例缺失；默认折叠，不纳入复核判定。新版打包在读取历史参考前先完成所有分类记录，再附上原历史字段。原数据没有独立question，沿用`intent.summary`和`summary`各自含义。没有读取后续消息、数据库或新模型结果来修订标签。

此处仍不能证明历史文本未被编辑、当时消息到达时间、不可读附件内容或持续多轮不会无限追问；边界沿用[v1说明](../shadow-first10-v1/README.md)。回答仅2例，预留组仍缺回答案例，不适合据此宣称完整四分类质量。

CSV人工审核列均为pending，审核人和时间留空。请复制CSV到新的受限文件再审核，分歧按语义复核，不能只看引用合法就认定结论正确。AI复核后的标签也不能自动晋升为gold。

## 验证与重放

- [复核校验及冻结哈希](verification.json)：120条完整覆盖、规则动作一致、证据引用与原句、条件字段、CSV回读、旧输入及历史版本未改动；所有候选按既有输出JSON Schema通过。
- 合成单测15项通过（原抽取/比较10项＋新复核打包5项），只证明数据和打包不变量，不证明120条语义全对。
- [本地浏览器验证](browser-verification.json)：实际打开本地HTML，120条依据可见，human筛选68、wait筛选27、仅改判6；编号搜索、改判跳转、历史折叠均通过。390px手机布局无横向溢出，页面错误0，外部HTTP请求0，桌面及手机已目检。
- 无应用行为改动；未运行完整Server/FE/Extension套件、平台live E2E、真实模型评估或部署验证。

浏览器初次在沙箱中因crashpad socket限制无法启动，随后经工具授权以隔离临时浏览器验证本地文件，禁止HTTP请求、不使用登录资料。该环境限制不算页面逻辑失败，见[既有错误条目](../../../../.learnings/ERRORS.md#err-20260903-003--sandbox-blocked-meegle-and-postgresql-diagnostics)。

```bash
# 全部抽取、比较和复核打包合成测试
python3 -B -m unittest discover -s server/examples/shadow-action-eval -p 'test_*.py' -v

# 复查原始冻结输入和旧标签未变
python3 -B server/examples/shadow-action-eval/dataset.py validate \
  --out evals/lark-ticket-ai/artifacts/shadow-first10-v1 \
  --frozen-manifest docs/tasks/ai-ticket/shadow-first10-v1/verification.json

# 在新的受限目录重组同一批复核原稿，不覆盖已交付版本
mkdir -m 700 evals/lark-ticket-ai/artifacts/shadow-first10-v2-replay
cp -p evals/lark-ticket-ai/artifacts/shadow-first10-v2-recheck-20261023/recheck-notes.private.psv \
  evals/lark-ticket-ai/artifacts/shadow-first10-v2-replay/
python3 -B server/examples/shadow-action-eval/recheck_actions.py \
  --out evals/lark-ticket-ai/artifacts/shadow-first10-v2-replay

# 本地HTML浏览器检查；最后一个目录须为新路径
node server/examples/shadow-action-eval/verify-recheck.browser.mjs \
  evals/lark-ticket-ai/artifacts/shadow-first10-v2-recheck-20261023 \
  evals/lark-ticket-ai/artifacts/shadow-first10-v2-browser-replay
```

- [任务记录（需求v3）](../2026-10-22-shadow-first10-eval-dataset.md)
- [复核打包脚本](../../../../server/examples/shadow-action-eval/recheck_actions.py)
