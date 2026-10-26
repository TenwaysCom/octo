# Ticket AI Evals

单 Sheet Excel 人工标注 → 不可变数据集 → Server 业务服务 → DeepEval → Excel 报告。此目录的 CLI 与 `lark-ticket-ai/` 下原有 FE/SSE 集成评测独立。

## 准备

推荐 Python 3.11+、当前项目 Node 环境。所有 Python 包仅用于开发评测，不加入 Server 运行依赖。

```bash
pnpm --dir server build
python3 -m venv evals/.venv
evals/.venv/bin/python -m pip install -r evals/requirements.lock
```

`requirements.txt` 固定直接依赖，`requirements.lock` 固定已验证的依赖解析结果（macOS / Python 3.9 生成）。其他平台如需更新锁，先在独立虚拟环境安装并执行本目录测试，再更新锁文件。系统旧版 Python/LibreSSL 不推荐用于真实 API 调用。

所有命令从仓库根目录运行。下文 `python` 指 `evals/.venv/bin/python`。默认持久化目录 `evals/artifacts/`；可在子命令前加 `--artifacts /absolute/path`。

## 1. 导出

复制 `configs/export.example.json` 到忽略的 artifacts/configs，填写 `sourceLabel`、`baseId`、`tableId` 和 `limit`。显式指定数据范围，不默认扫描全部库。

通过进程环境提供 `POSTGRES_URI`（或 `DATABASE_URL`），不要写入配置文件、命令参数或提交 Git。连接必须能直接到达 PostgreSQL；需要隧道时先在外部建立。

```bash
python -m evals.cli export --config evals/artifacts/configs/export.json
```

输出 `export_id` 及根目录，导出包包含：

- `annotations.xlsx`：一张表，每张 Ticket 一行；原 Shadow 是参考，不是标准答案。
- `inputs.jsonl`：完整的脱敏消息窗口、Ticket 复合标识、来源、完整性和哈希。
- `manifest.json`：范围标签、规则、快照哈希及导出时数据库中的业务 Prompt。

导出使用 PostgreSQL 只读、可重复读事务，不初始化数据库、不触发同步、不运行模型。Server 现有脱敏是有限规则，并不保证移除全部业务敏感信息；产物仍按业务数据管理。

时间规则是线程根消息起算 `[t0,t0+5分钟)`。缺根消息、时间异常、不完整历史、窗口内已删除或窗口后编辑的消息，不进入正式评测。消息原文来自当前同步快照，并非严格历史版本。窗口仅含文本；含附件的行需要人工确认文本是否足够。

工作表按 Ticket 信息、消息、Shadow 参考、两个场景标注、隐藏标识排列。长消息分到同一行多个列，未截断。消息、隐藏标识、窗口时间属于只读信息；不在 Excel 修改模型输入。人工可筛选、排序、删掉不需要的行。

## 2. 标注和导入

分析和答复分别设置 `纳入=是`、`审核=已审核`。填写共同的审核人，以及：

| 场景 | 必填参考答案 | 可选规则 |
| --- | --- | --- |
| 分析 | 意图（下拉枚举）、问题摘要 | 必答点、禁止断言 |
| 答复 | 参考答复 | 必答点、禁止断言 |

参考答案必须符合前五分钟可知信息。后续已确认的根因不能倒灌成“当时模型必须知道”的答案。不要直接将未经核对的 Shadow 复制为 gold。

```bash
python -m evals.cli import --excel evals/artifacts/exports/EXPORT_ID/annotations.xlsx --validate-only
python -m evals.cli import --excel evals/artifacts/exports/EXPORT_ID/annotations.xlsx
# Excel 移动到别处时：
python -m evals.cli import --excel /path/annotations.xlsx --export evals/artifacts/exports/EXPORT_ID
```

导入对全部行校验；纳入但未审核、必填答案缺失、标识重复、输入不可用、公式或消息原文变化均拒绝整次导入，并指出行号。未纳入的场景排除，零 Case 不发布。导入不读当前数据库、不调用模型。

一张 Ticket 拆为 0～2 个 Case。`case_id` 基于 Ticket 复合标识和场景，版本由内容哈希区分；更改答案新建数据集，相同内容重复导入复用数据集。数据集复制标注、输入、Case 与导入报告，之后不依赖原导出目录。

## 3. 运行

配置示例：`configs/analysis.example.json` 和 `configs/reply.example.json`。模型必须明确指定。运行按以下顺序合并 Prompt：仓库默认 → 导出时数据库 Prompt → 本次 config.prompts。最终模板完整保存到 Run，实际渲染的请求保存在逐条结果中。

```bash
python -m evals.cli run --dataset DATASET_ID --scenario ticket.early_analysis --config evals/artifacts/configs/analysis.json
python -m evals.cli run --dataset DATASET_ID --scenario ticket.reply --config evals/artifacts/configs/reply.json
python -m evals.cli run --resume RUN_ID
```

- 通过本地 Node 子进程调用编译后的 Server 服务，不需要 HTTP Server 或 Web session。
- Shadow 使用共享 `analyzeTicketShadow`；评测入口只接收窗口消息，不读 Ticket 当前字段、不写 Shadow。早期场景使用专用的消息上下文呈现，线上 Worker 的候选筛选和写回不在本套件范围。
- Wiki QA 复用提问、检索、重排、证据选择和回答流程。运行前复制 `wikiWorkspace/docs/llm-wiki` 的 Markdown 文件，拒绝符号链接，使用固定知识和 Prompt；已识别同 Ticket 标识的候选被过滤。该过滤不保证消除间接泄漏，知识也不保证在历史当时已存在。
- `DEEPSEEK_API_KEY` / `ZCODE_API_KEY` / `WIKI_QA_RERANK_API_KEY` 仅从环境读取；config 不接受凭据字段。
- 串行运行；网络超时及请求失败最多重试两次，各次尝试保存。结构/引用无效直接记录 `invalid_output`，不重试“刷过”。
- 每条完成立即原子落盘。中断后恢复只执行缺失记录，已经失败的记录也保留；要重跑已完成 Case，创建新 Run。
- 恢复前核对代码、编译产物、输入、配置及知识。代码/构建变化时必须创建新 Run。
- `completed` 表示批次执行完，不代表所有 Case 成功。

## 4. 评分、报告、对比

```bash
python -m evals.cli score --run RUN_ID --config evals/configs/judge.example.json
python -m evals.cli report --run RUN_ID --score SCORE_ID
python -m evals.cli compare --baseline RUN_A --baseline-score SCORE_A --candidate RUN_B --candidate-score SCORE_B
```

裁判使用显式指定的 OpenAI 模型及 `OPENAI_API_KEY`。先检查模型可用性；示例模型仅是起始配置，建议使用与被测模型不同的裁判。真实评分会将窗口、实际输出、人工答案及答复引用证据交给该模型。

DeepEval 固定为 4.1.0，使用 `LLMTestCase` + `GEval` 的独立 `measure()`，不登录/上传 Confident AI；关闭 DeepEval telemetry。评分步骤、裁判、阈值及评分代码版本均记录。每次 score 产生新 ID，实际生成结果不重新运行。

- 结构和引用门禁由 Server 确定性校验；意图与人工枚举精确比较。
- 语义指标分别评估摘要、事实、信息不足，以及答复正确性、追问、可执行性。
- 0.7 是未校准初始阈值，不作为上线门禁，也不代表评测结论已得到人工验证。
- 区分 `generation_error`、`judge_error`、`quality_failed`、`passed`；报表显示计划数、生成成功数、评分成功数及错误。指标平均分有独立分母，意图混淆矩阵保存在 summary.json。
- 多份 Score 时 report 必须指定 ID；单份可省略。
- compare 只对输入、gold、场景版本、裁判及规则一致的 Case 计算指标变化，其余单列。每项变化保留分母；不混算新增、缺失或改答案的样本。

## 存储与 Git

```text
artifacts/
  exports/EXPORT_ID/{annotations.xlsx,inputs.jsonl,manifest.json}
  datasets/DATASET_ID/{annotations.xlsx,inputs.jsonl,cases.jsonl,manifest.json,import-report.json}
  runs/RUN_ID/
    manifest.json
    cases.jsonl
    inputs.jsonl
    knowledge/                 # 仅 Wiki QA
    cases/CASE_ID.json
    scores/SCORE_ID/{manifest.json,results.jsonl,report.xlsx,summary.json}
  comparisons/COMPARE_ID/{manifest.json,comparison.xlsx}
```

Git 只保存代码、规则、无凭据示例配置、依赖锁及合成测试；全部真实产物及虚拟环境忽略。将 artifacts 当作需要备份的数据资产，第一版没有共享权限或自动备份。

## 扩展与协议

`scenarios/__init__.py` 的注册定义包括场景 ID/version、Excel 前缀、参考答案字段/列名、Prompt keys、是否需要知识、输出字段和指标。通用导入、Run、Score、报告无需添加 Ticket 特判。新的业务流程需在 Server Zod 场景枚举及执行器中增加注册。

Node 协议：stdin 一个 `{operation,data}` JSON；stdout 一个 `{ok,data,error}` JSON。`run` data 严格限定 scenario、actionRunId、messages、config、exclusionTokens，不接受 expected、Shadow、Ticket 当前字段。逐条错误保留 layer/module/stage/errorCode，不存原始异常，避免凭据泄漏。

数据集 schema_version=1：Case 保存 case_id/scenario_id/scenario_version/input_ref/input_hash/expected/expected_hash/reviewer/notes；inputs 按 source_id 关联。Case 只在评分侧携带 expected，执行请求由白名单构造。

## 验证

```bash
evals/.venv/bin/python -m unittest discover -s evals/tests -v
pnpm --dir server test
pnpm --dir server build
```

Python 测试包括真实 DeepEval + 本地假裁判，不调用外部模型；Server 测试使用 mock 数据库和模型。生产数据导出、真实模型质量、真实知识检索结果及部署需要单独验收。
