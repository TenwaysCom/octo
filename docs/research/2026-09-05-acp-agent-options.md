---
title: "ZCode、Hermes、OpenCode、OpenACP 接入方式调研"
document_type: research_reference
as_of: 2026-09-05
related:
  - "../tasks/acp/2026-09-05-hermes-acp-integration.md"
---

# ZCode、Hermes、OpenCode、OpenACP 接入方式调研

> 本文是截至 2026-09-05 的技术调研参考，覆盖四个产品。Kimi 仅作为 Octo 现有接入的比较基线。本文不代表这些方案已在 Octo 完成集成，也不直接授权开发或切换运行时。
>
> 项目选型、实施范围、进展及实测证据，以 [ACP 接入任务](../tasks/acp/2026-09-05-hermes-acp-integration.md) 为唯一记录。

## 1. 比较口径

评估需要分别回答三个问题：

1. **通信协议**：是否作为 ACP Agent 提供初始化、会话、消息、取消、恢复和权限请求？
2. **部署方式**：是否可由宿主直接启动 stdio 子进程，或另有 HTTP / WebSocket 服务接口？
3. **执行边界**：工具在 Agent 内部执行，还是委托 ACP 客户端执行？审批事件、工具展示和实际执行审计分别由谁产生？

原生 ACP 与独立 HTTP 服务是不同维度。Hermes 和 OpenCode 都可直接作为 ACP 子进程运行；支持 HTTP API 不意味着必须采用独立 HTTP 服务。

对 Octo 的比较基线是：Server 管理会话与业务身份，通过 ACP 通信，并以版本化权限 Profile、受控 Terminal / 文件操作和实际执行审计支撑业务验收。具体边界见 [现行 ACP 权限任务](../tasks/acp/2026-08-24-lark-ticket-ai-session-permissions.md)，不以旧版 PM Analysis ACP 设计作为当前 Ticket 权限契约。

## 2. 总体对比

| 产品 / 路线 | 协议与角色 | 通信层复用 | 执行控制差异 | 适用目标 |
| --- | --- | --- | --- | --- |
| ZCode 社区 ACP 桥接 | 社区 adapter 将原生 app-server 转为 ACP Agent | 高；增加协议转换层 | 已查桥接有权限字段和默认模式问题；Shell 仍由 ZCode 执行 | 需要使用 ZCode，并先验证 ACP 消息兼容性 |
| ZCode 原生 app-server | 宿主直接接入原生 JSON-RPC | 中；需自建事件与会话转换 | 原生权限信息更完整，但仍需处理实际执行边界 | 明确依赖 ZCode，愿意维护专用 adapter |
| Hermes ACP | 官方 ACP Agent，`hermes acp` | 高 | 原生工具由 Hermes 运行时执行；需对齐宿主操作控制和审计 | 直接替换 ACP Agent，或复用 Hermes 工具、技能与记忆能力 |
| OpenCode ACP | 官方 ACP Agent，`opencode acp` | 高 | Shell 内部执行；自定义工具覆盖提供扩展入口，但需验证委托链 | 希望保留 ACP，并使用 TypeScript 工具扩展 |
| OpenACP | ACP 客户端 / 会话桥接服务 | 不属于直接替换 Agent 的同一层 | 提供客户端文件、Terminal 和权限管理；能力仍依赖底层 Agent 是否委托执行 | 多聊天渠道、Agent 注册与独立会话管理 |

“高复用”仅指通信层。保持 Octo 现有完整权限与审计时，Hermes / OpenCode 都有中到高的适配工作；ZCode 还增加原生协议或社区桥接的维护工作。以上是源码差异判断，不是工期承诺。模型质量、费用、吞吐和稳定性缺少同条件实测数据，不据此排名。

## 3. ZCode：社区 ACP 与原生 app-server

### 3.1 ACP 能力与桥接方式

本次未确认到 ZCode 官方提供原生 `zcode acp` 入口；这是调研范围内的结论，不代表官方永远不支持。找到的 ACP 路线是社区项目 [william0wang/zcode-acp](https://github.com/william0wang/zcode-acp)。

检查快照：版本 `0.21.0`，commit `a8cc3146e36c4e0226f40b96a218d499a16e0649`。其启动入口为 `zcode-acp server`，另有兼容入口 `zcode-acp-server`；底层连接 `zcode app-server --stdio`。

```text
ACP Host → zcode-acp 社区 adapter → ZCode app-server → ZCode 工具运行时
```

该快照中的两个具体兼容问题：

- [会话创建](https://github.com/william0wang/zcode-acp/blob/a8cc3146e36c4e0226f40b96a218d499a16e0649/src/handlers/session.ts#L291)写入 `mode: "yolo"`。这是桥接实现的选择，不能推断成 ZCode 原生协议只能使用此模式。
- [权限转换](https://github.com/william0wang/zcode-acp/blob/a8cc3146e36c4e0226f40b96a218d499a16e0649/src/interaction/adapter.ts#L82)构造的 `toolCall` 包含 ID 和 `rawInput`，缺少 Octo 当前匹配依赖的 `title`；直接复用 Kimi 权限解析会出现拒绝。

此外，ZCode 自身执行 Bash，Terminal 输出通知不等于调用宿主的 ACP `terminal/create`。修复权限字段仍不足以完成 Octo 实际执行审计的适配。会话 ID、恢复与历史格式也需单独验证。

### 3.2 VS Code 插件如何接入

检查的插件是社区客户端，均不能据此称为官方 VS Code 插件：

| 插件 | 检查快照 | 接入方式与参考价值 |
| --- | --- | --- |
| [xhqing/zcode-vsce](https://github.com/xhqing/zcode-vsce/tree/6177cdfcdb83c7e8ef8fea5ec231d522871cb54f) | `0.1.6`，commit `6177cdfcdb83c7e8ef8fea5ec231d522871cb54f` | 直接驱动官方 agent runtime 的 app-server；可参考会话、事件订阅和编辑器 UI 转换 |
| [YuanyuanMa03/zcode-vscode](https://github.com/YuanyuanMa03/zcode-vscode/tree/5b10b5526fb88b36157361ad4851e904b7e2b475) | `0.4.1`，commit `5b10b5526fb88b36157361ad4851e904b7e2b475` | 同样走原生 app-server；权限 RPC 重复帧与回复关联处理值得参考，需复核对应 CLI 版本 |

共同的接入模式是：启动 app-server → `session/create` → `session/subscribe` → `session/send` → 接收事件并更新编辑器。原生协议还能提供权限请求、会话恢复、历史消息及事件序号等信息；原生权限可携带 `toolName`、输入、风险和选项。

适合借鉴的是协议 adapter 与 UI 的分层、订阅恢复、权限请求的关联和去重。需要避免直接照搬的具体问题：检查的 xhqing 快照中，权限事件被转交 UI 后，请求处理链仍可立即回复空结果，原始 RPC ID 没有完整交给后续批准流程；Yuanyuan 的 [协议客户端](https://github.com/YuanyuanMa03/zcode-vscode/blob/5b10b5526fb88b36157361ad4851e904b7e2b475/src/protocol/client.ts#L227)可作为请求关联的另一份参考。此处记录代码行为，真实 ZCode 运行时如何处理还需独立验证。

如果必须使用 ZCode，原生 app-server 适配能减少对社区 ACP 转换语义的依赖，但会增加专用协议维护。它并不自动解决“由谁执行命令”的问题。

## 4. Hermes：原生 ACP 与可选服务接口

### 4.1 原生 ACP

Hermes 官方提供 `hermes acp`、`hermes-acp` 和 `python -m acp_adapter`。均可由宿主作为子进程启动，通过 stdio JSON-RPC 通信；日志使用 stderr。[官方接入文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp)

```text
ACP Host → hermes acp 子进程 → Hermes AIAgent / 工具运行时
```

官方实现覆盖初始化、认证、新建 / 加载 / 列出 / 取消会话等方法，并把 Agent 回调转换为 ACP 事件。会话使用共享 SessionDB 持久化，可跨进程重启恢复；不能笼统归类为仅进程内会话。[ACP 内部机制](https://hermes-agent.nousresearch.com/docs/developer-guide/acp-internals)

检查的上游代码快照为 commit `377118af86872773777e13c9b38dac65377f7320`。需要注意：

- [server.py](https://github.com/NousResearch/hermes-agent/blob/377118af86872773777e13c9b38dac65377f7320/acp_adapter/server.py)中的 ACP 包装保留 Hermes 自身工具执行链，不能把宿主声明的 `clientCapabilities` 等同于文件 / Terminal 已委托宿主执行。
- [permissions.py](https://github.com/NousResearch/hermes-agent/blob/377118af86872773777e13c9b38dac65377f7320/acp_adapter/permissions.py)将危险终端操作审批转换为 ACP 请求。这不等于所有命令都经过 Octo 的完整 argv 白名单。
- [edit_approval.py](https://github.com/NousResearch/hermes-agent/blob/377118af86872773777e13c9b38dac65377f7320/acp_adapter/edit_approval.py)提供编辑审批挂钩，但编辑审批与使用宿主文件回调仍是两个层次；较旧安装版本的能力需要单独核对。
- 权限标题可能是描述或命令，不宜直接沿用 Kimi 的工具标题匹配。工具完成事件用于展示，不能替代宿主记录的执行结果。

因此，原生 ACP 的通信入口明确；完整适配的关键是收敛工具执行、权限映射和审计来源。Python 实现会带来跨运行时适配工作，但这不足以推断其整体不适合。

### 4.2 其他接口仅作为备选

Hermes 还提供 TUI Gateway（stdio / WebSocket）以及 HTTP API。HTTP 接口包括 OpenAI 兼容端点和原生 Runs API；Runs 可提交任务、读取状态和 SSE 事件、处理审批与停止运行。[程序化集成](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)、[API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)

TUI Gateway 的 stdio 模式也可以作为宿主管理的子进程，并不必然需要独立后台服务；它适合需要 Hermes 专有会话、命令和事件能力的客户端。HTTP 则适合独立服务接入。使用这些接口需要另一套任务标识和事件映射；选择 Hermes ACP 时无需引入它们。换协议或收到工具结果，都不意味着工具留给调用方执行。

### 4.3 工具扩展点补充核查（2026-09-05）

本节补充检查上游 commit `7b8cf4c6314fd29d734acf24aa70cf361743a693`，不替换前文的历史快照，也不代表本机 Hermes 已升级。

| 扩展点 | 能做什么 | 与宿主独占执行的差距 |
| --- | --- | --- |
| 插件 `register_tool(..., override=True)` | 替换同名内置工具；该快照要求配置显式允许插件覆盖内置工具 | 单独替换 terminal / 文件工具不能证明 delegate、execute_code 等入口被覆盖，也没有自动提供 ACP Client 连接 |
| `pre_tool_call` hook | 阻止、审批或修改工具调用 | 普通插件回调异常会被跳过；仅靠 hook 不能保证异常时停止执行 |
| `register_middleware("tool_execution", ...)` | 返回替代结果、跳过 `next_call`，可在保留原生 Agent 循环的同时接管工具执行 | middleware 自身在调用下游前异常，会继续其他 middleware 或原生执行；默认 fail-open，不是受控执行边界 |
| 原生 ACP Server | 连接宿主、发出审批与工具事件 | 检查的 `server.py` 未调用 ACP `create_terminal` / `read_text_file` / `write_text_file`，仍调用原生 `run_conversation` |

来源：[官方插件说明](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins)、[固定版本 middleware 契约](https://github.com/NousResearch/hermes-agent/blob/7b8cf4c6314fd29d734acf24aa70cf361743a693/docs/middleware/README.md)、[插件注册实现](https://github.com/NousResearch/hermes-agent/blob/7b8cf4c6314fd29d734acf24aa70cf361743a693/hermes_cli/plugins.py)、[ACP Server 实现](https://github.com/NousResearch/hermes-agent/blob/7b8cf4c6314fd29d734acf24aa70cf361743a693/acp_adapter/server.py)。

因此存在比覆盖整个工具分发函数更合适的扩展方向，但不能直接把默认 middleware 当成权限隔离机制。若用于宿主独占执行，需要额外的强制模式：扩展缺失、异常、超时或断连时拒绝执行，不能回退本地；并核实工具可见范围、特殊分支和 ACP 连接注入。这是设计推论，尚无该版本在 Octo 的运行验证。

## 5. OpenCode：原生 ACP 与工具覆盖扩展

OpenCode 官方支持 `opencode acp`，作为 stdio ACP Agent 子进程运行。检查版本为 `v1.18.29`，另外核对了当时的开发分支；以下源码链接固定到该发布版本。[官方 ACP 文档](https://opencode.ai/docs/acp/)、[版本记录](https://github.com/anomalyco/opencode/releases/tag/v1.18.29)

[ACP service](https://github.com/anomalyco/opencode/blob/v1.18.29/packages/opencode/src/acp/service.ts)声明协议版本 1，并实现会话创建、加载、列出、提示和取消等流程。标准会话 / 消息能力与 Octo 当前通信层较接近，但有三个差异：

1. [工具标题](https://github.com/anomalyco/opencode/blob/v1.18.29/packages/opencode/src/acp/tool.ts#L263)可能是实际命令或文件路径，不能继续把标题作为稳定工具标识。
2. [Shell 工具](https://github.com/anomalyco/opencode/blob/v1.18.29/packages/opencode/src/tool/shell.ts#L484)自行创建进程，未使用宿主 ACP `terminal/create`。[部分编辑审批](https://github.com/anomalyco/opencode/blob/v1.18.29/packages/opencode/src/acp/permission.ts#L84)会向客户端发送 `writeTextFile`，但不能据此断言所有文件操作受宿主独占控制。
3. [默认权限](https://opencode.ai/docs/permissions/#defaults)较宽松，多数操作为 `allow`。与宿主审批集成时需要明确运行配置，不能只等待权限事件。

OpenCode 的工程扩展入口较明确：[自定义工具可以覆盖同名内置工具](https://opencode.ai/docs/custom-tools/#name-collisions-with-built-in-tools)，另有插件执行前后挂钩。这使“替换工具并接回宿主控制链”成为可验证的路线，但并未证明覆盖一个 Shell 工具就能收敛全部执行路径。

OpenCode 还支持 [HTTP Server](https://opencode.ai/docs/server/) 和 SDK。它们是可选接入方式；复用现有 ACP 时可以继续直接启动 ACP 子进程。

## 6. OpenACP：宿主桥接层

[OpenACP](https://openacp.ai/)定位是连接聊天平台与多个 ACP Agent 的自托管桥接服务。其结构为：

```text
Telegram / Discord / Slack / API → OpenACP → ACP Agent → 工具运行时
```

它负责 Agent 注册与启动、会话、提示队列、权限交互和事件转发。这个角色更接近 Octo 的 ACP 客户端和会话服务，不是一个替代 Kimi 的模型 / Agent 运行时。

核对的 npm 发布包为 [`@openacp/cli@2026.518.2`](https://registry.npmjs.org/@openacp/cli/2026.518.2)。发布包 source map 中可读的核心实现包括：

- `src/core/agents/agent-instance.ts`：使用 `ClientSideConnection`，启动底层 Agent，声明客户端文件和 Terminal 能力，创建和恢复会话。
- `src/core/sessions/terminal-manager.ts`：管理客户端 Terminal 进程生命周期与输出。
- `src/core/sessions/permission-gate.ts`、`prompt-queue.ts`：权限交互和提示排队。
- API 插件与渠道 adapter：对接外部调用方和聊天平台。

可参考其 Agent 定义、会话状态、权限等待、事件转换和进程清理的拆分。直接引入则需要明确它与 Octo 谁持有身份、会话、权限和审计；它声明客户端能力也不能迫使底层 Agent 委托执行。

本次访问官网指向的上游 GitHub 仓库返回 404，因此上述实现核对使用公开 npm 发布包，没有将社区 fork 当作最新上游。官网 / README 的 MIT 描述与该包 `package.json` 的 `AGPL-3.0` 声明存在差异；如需复制或引入实现，应先确认对应版本的授权文件。该差异不影响对其 ACP 客户端角色的判断。

## 7. 对已有 ACP 宿主的参考结论

- 只替换聊天 Agent：Hermes ACP 和 OpenCode ACP 都有官方 stdio 入口，均可从现有通信层开始验证。
- 保留宿主的业务操作控制：先验证工具执行委托及真实审计，再评估会话 UI 与事件展示的完整性。
- 明确需要 ZCode：分别衡量社区 ACP 桥接的转换维护与原生 app-server 的专用适配成本；VS Code 插件是协议参考，不是可直接采用的完整实现。
- 需要多个聊天渠道与统一 Agent 管理：再评估 OpenACP 的桥接职责和已有系统的重叠。
- 更换 Agent 时，标准 `session/load` 也不保证不同产品的 session ID、上下文或历史格式可互换。

本文引用的代码版本、官方文档和包元数据可用于复核技术判断。真实命令检查、协议实验及业务验收证据集中记录在 [关联任务](../tasks/acp/2026-09-05-hermes-acp-integration.md#验证证据)，不能从文档或源码存在某接口直接推导运行成功。
