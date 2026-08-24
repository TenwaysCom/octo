# Lark Ticket FE AI Action 评测

本套件评测现有 FE 的 `streamLarkTicketAiSession()` 请求与 SSE 解析链路。它不会直接调用 Kimi ACP，也不会写入 Lark Base 或 Meegle。

## 覆盖范围

- `data/eval-dataset.csv`：基于证据的 Support-QA 回答与问题总结正常用例。
- `data/badcase-dataset.csv`：Prompt 注入、无证据根因断言、未经确认的写入声明等 badcase。
- 确定性门禁：必含/禁止输出文本、允许/必需工具标题、耗时预算。
- 可选 LLM 裁判：每个 case 的质量标准；仅在设置 `OCTO_EVAL_ENABLE_LLM_JUDGE=1` 时启用。

CSV 是唯一的数据集来源。多值条件在单元格中使用 JSON 数组，例如 `["待确认","下一步"]`，从而避免中文逗号或换行引起歧义。所有 case 默认禁用，也不包含真实 ID。启用前，应先将非生产的隔离 Ticket 同步到 Octo，并替换其三个 Ticket 标识；数据集文本必须保持脱敏。

## CSV 列定义

| 列 | 含义 |
| --- | --- |
| `id`, `enabled`, `action_key` | 稳定的 case ID、执行开关与 FE AI Action key。 |
| `base_id`, `table_id`, `record_id` | 隔离 Ticket fixture 的引用，禁止填写生产记录。 |
| `message` | 通过 FE API client 提交给 AI Action 的用户消息。 |
| `must_include`, `must_not_include` | 用于确定性输出检查的 JSON 字符串数组。 |
| `allowed_tools`, `required_tools` | 用于 FE 可观测工具标题检查的 JSON 字符串数组。 |
| `max_latency_ms`, `judge_criteria` | 耗时预算与可选的 DeepEval LLM 裁判标准。 |

## 本地准备

```bash
python3 -m venv .venv
.venv/bin/pip install -r evals/lark-ticket-ai/requirements.txt
.venv/bin/python evals/lark-ticket-ai/run_deepeval.py --validate-only
```

执行已启用 fixture 前，先启动本地 FE/Server 并按正常流程登录。仅通过进程环境变量传递不透明的 Web session cookie；不得把它写入 shell 历史、数据集、报告或 CI 日志。case 默认禁用，配置隔离 fixture ID 后将 `enabled` 设为 `true`。`--include-disabled` 仅用于已审阅 fixture 的明确本地覆盖。

```bash
export OCTO_EVAL_API_BASE_URL=http://localhost:3040/api
export OCTO_EVAL_WEB_SESSION_COOKIE='octo_web_session=REDACTED'
.venv/bin/python evals/lark-ticket-ai/run_deepeval.py --dataset happy-path
```

仅在环境中配置好 DeepEval 裁判凭据后，才设置 `OCTO_EVAL_ENABLE_LLM_JUDGE=1`。Kimi ACP 是被测系统，不应同时作为唯一裁判。

## 数据集规则

- 正常 case 验证用户可见的工作流与安全输出契约。
- Badcase 验证恶意或不支持的请求不会绕过 Skill、虚报写入或把无证据诊断当作事实。
- 工具标题检查仅限 FE 可观测范围；Server 的命令/路径 allowlist 仍由 `acp-kimi-permission-policy` 单元测试覆盖。
- 这是受控的 live 集成评测，不是确定性单元测试。在具备隔离 seed 记录与无敏感信息的测试账号前，不应设为 CI 的必过任务。
