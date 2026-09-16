# Kimi / Hermes ACP 权限配置示例

配置样例生成于 2026-09-05，仅供审阅；Octo 不会加载本目录。任务决策、进展和验证以 [Hermes ACP 接入任务的当前设计](../../tasks/acp/2026-09-05-hermes-acp-integration.md#v5-已确认设计) 为准。以下样例仍为 v4 配置参考，未按 v5 生成最终 Quick Actions allowlist；v5 代码实施见任务，示例未应用到用户配置。

## 文件与适用范围

| 文件 | 用途 | 完整性 |
| --- | --- | --- |
| [kimi-answer.toml.example](./kimi-answer.toml.example) | 回答问题：当前 Ticket fetch、反馈草稿文件 | 原生规则模板；需替换占位符并验证当前二进制匹配行为 |
| [kimi-document.toml.example](./kimi-document.toml.example) | 生成文档：fetch、status/diff、update dry-run、本地 Eval、指定文档文件 | 原生规则模板；与 Answer 二选一，不合并权限 |
| [hermes.yaml.example](./hermes.yaml.example) | 保留原生危险命令审批，不启用 YOLO | 原生基础配置；不能实现清单外所有命令均审批 |
| [hermes-answer.env.example](./hermes-answer.env.example) | Answer 单个可写临时目录、fetch 快照输出目录 | 适用于本机单根实现；不适用于 Document 多个可写位置 |

这些是权限片段，不是包含模型和认证的完整配置。未来应用时保留已有 provider / model / authentication，按任务使用独立运行配置；不要覆盖个人配置，也不要把 Answer 与 Document 的预授权合并成所有任务的默认权限。

当前 Ticket 问题总结走 DeepSeek；三个 Sprint Quick Actions 只生成文本。这四个动作不使用这里的脚本预授权。

## 任务参数

`__...__` 是文档占位符，Kimi / Hermes 不会自动替换，也不是 shell 变量。必须在创建任务配置前替换；本次没有实现配置生成器。

| 参数 | 约束 |
| --- | --- |
| `__TICKET_NUMBER__` | 当前任务的 Ticket 编号，不使用 `*` 放行其他 Ticket |
| `__ACTION_DIR__` | 本次 action run 的规范化绝对临时目录；与 fetch 环境变量一致 |
| `__WORKSPACE__` | 已确认的工作区；本机为 `/Users/linyu/proj/odoo/eu`，ACP Session 的 cwd 也使用该目录 |
| `__QA_CARD_REL_PATH__` | 本次 QA Card 相对工作区的路径，位于 `docs/support-qa/qa-cards/` 且以 `.md` 结尾 |
| `__QA_CARD_ABS_PATH__` | 上一项在工作区中的规范化绝对路径，两者必须指向同一文件 |

没有 QA Card 的 Document 任务应删掉 Eval 与 QA Card 的三条规则。其他未使用的文档写规则也可从该任务配置中去掉。补充新允许文件时使用相同的精确路径规则，不扩大为整个仓库。

## Kimi 原生规则

两个 TOML 文件面向 **Kimi Code CLI** 的 `config.toml`，不是 Python `kimi-cli` 的配置格式。本机实际命令为 Kimi Code `0.40.1`；Python `kimi-cli 1.47.0` 不能作为它的运行证明。

规则按“明确允许 → 其他 Bash 请求审批 → 其他 Write/Edit 拒绝”排列。命令使用精确参数，不用 `bash *`、`node *` 或可吞入额外参数的命令通配符。Write/Edit 使用精确文件路径；通过脚本产生的文件写入不经过这些文件工具规则。

正式应用前需验证本机版本的命令匹配是否精确、路径如何归一化、额外参数和复合命令是否进入审批。这里不把 TOML 解析成功等同于权限已生效，也不宣称这些规则约束了所有进程的文件访问。

fetch 所需的环境变量由启动任务的宿主提供：

```dotenv
OCTO_SUPPORT_QA_ACTION_DIR=__ACTION_DIR__
```

这是现有业务脚本读取的变量，不是 Kimi 配置项。已有配置的宽泛 allow、恢复会话保存的权限模式和会话批准可能影响结果，运行验证应使用该任务的完整有效配置及新会话。

来源：[Kimi 配置与 permission.rules](https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/config-files#permission)、[Kimi ACP 接口](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp.html)。

## Hermes 原生配置的边界

`hermes.yaml.example` 对应 Hermes `config.yaml`；环境变量示例由宿主传入 Hermes 子进程。不要把 YAML 当作 Octo 的公共 ACP 配置。

本机 Hermes checkout 为 `43e566f77eaf01293086eb7cb99a21e240d60634`。其 `tools/approval.py::is_approved` 按危险模式的规范键或别名查集合，`command_allowlist` 并非 Kimi 式的任意命令模式列表。因此示例保留空列表，不填入实际不会匹配的 `bash ... fetch ...` 字符串。

| 已盘点的命令 | 本机原生配置处理 |
| --- | --- |
| `bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch <Ticket> --json` | 无需用“危险类别永久允许”预先放开；实际是否请求审批还取决于安全检查 |
| `git status --short` | 同上 |
| `git diff --no-ext-diff -- docs/support-qa` | 同上 |
| `bash .agents/skills/write-support-qa/scripts/write-support-qa.sh update <JSON> --dry-run --json` | 同上；必须保留 dry-run |
| `node .agents/skills/eval-support-qa/scripts/eval-support-qa.mjs --ticket-no <Ticket> --qa-card-path <Card> --json` | 同上；不增加 writeback / llm-eval / allow-external-ai |

`approvals.mode: manual` 表示危险命令需要审批，不表示所有其他命令都审批。无告警的命令可能直接执行；当前设计是否采用这类原生语义，以任务文档为准。本段只说明能力边界，不要求继续开发 v4 的“清单外审批”扩展。

本机 `agent/file_safety.py::get_safe_write_root` 将整个环境变量值作为单一路径解析。官网当前描述了多根支持，但这个 checkout 没有拆分多个根；不要使用 `目录A:目录B`，也不要为了覆盖多个目录而改成共同祖先目录。

- Answer 可以把单个 safe root 设为本次临时目录。
- Document 同时涉及临时目录、QA Card、FAQ、索引 Markdown；本机原生配置不能精确表达这些位置，因此本次没有生成可直接启用的 Document 写路径环境配置。
- safe root 只约束原生文件写入工具，不约束脚本或终端间接写入，也不直接表达仅允许 `.md`、排除 `knowledge-index.jsonl` 等规则。

来源：[Hermes 官方安全配置](https://hermes-agent.nousresearch.com/docs/user-guide/security/)、[本机版本的文件限制实现](https://github.com/NousResearch/hermes-agent/blob/43e566f77eaf01293086eb7cb99a21e240d60634/agent/file_safety.py)、[本机版本的审批实现](https://github.com/NousResearch/hermes-agent/blob/43e566f77eaf01293086eb7cb99a21e240d60634/tools/approval.py)。

## Quick Actions 与后台任务如何使用

同一任务类型使用同一预授权内容；宿主对未预授权请求的处理不同，需求以任务记录为准：

| 情况 | Quick Actions | 后续 shadow 任务 |
| --- | --- | --- |
| 命中预授权 | 自动继续 | 自动继续 |
| 需要审批 | 展示具体操作，等待用户决定 | 立即拒绝并终止任务；记录脱敏操作、原因和配置提示 |
| 明确禁止 | 拒绝 | 拒绝并记录错误 |

这不是可写入 Kimi/Hermes 的 `onApproval` 配置字段。ACP 客户端仍需实现交互或后台失败处理；Hermes 的 `cron_mode` / `unattended_mode` 也不能代替 Octo ACP 客户端处理。后台不能仅拒绝一个工具后允许任务被记为成功，不能自动改开 YOLO 或放大权限。

v5 代码已改为官方原生启动和共用审批；Kimi handler 按兼容路径保留。旧 patch 文件暂存但不被生产引用。此目录仅为配置参考，不证明文件隔离、未来后台文档/答复 worker 或真实业务已经验收。
