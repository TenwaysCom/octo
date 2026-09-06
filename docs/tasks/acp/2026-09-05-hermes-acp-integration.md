---
title: "Hermes ACP 接入改造"
module: acp
status: in_progress
requirement_version: 5
created_on: 2026-09-05
updated_on: 2026-09-06
closed_on: null
owner: TBD
related:
  - "../../research/2026-09-05-acp-agent-options.md"
  - "./2026-08-24-lark-ticket-ai-session-permissions.md"
  - "./2026-08-24-openacp-codex-migration-assessment.md"
  - "../../tenways-octo/it-platform-sync.md"
  - "https://hermes-agent.nousresearch.com/docs/user-guide/features/acp"
---

# Hermes ACP 接入改造

## v5 已确认设计

2026-09-06 用户确认逐文件设计“设计没问题”，随后要求先将设计落盘。本节是当前目标、方案及验收的有效版本；下方 v2–v4 方案均为 **superseded**，保留用于追溯，不作为当前实施和部署依据。

**当前实施授权（2026-09-06）：** 用户要求实现本任务，已从设计落盘进入 v5 代码改造与本地验证。真实 Kimi/Hermes 配置、数据库迁移执行、业务命令和部署仍未执行。Quick Actions 命令逐条核查保持暂停；`script execution via -e/-c flag` 只是能力示例，没有加入实际永久授权。

### v5 代码实施结果（2026-09-06）

- Hermes adapter 直接启动官方 `python -m acp_adapter`，生产路径已脱离 launcher/patch。新增共用 managed runtime；ownership 持久化 provider/native ID，新建即保存映射，Ticket/Sprint 关联完成后才开始 prompt。旧 Kimi 与旧带前缀 Hermes ID 兼容补齐，Kimi export 仅接收 Kimi native ID。
- 共用审批服务与 Web 回复接口、Ticket/Sprint 审批组件已接入。验证登录态、会话/action run/请求归属和原生 options；50 秒过期，拒绝/取消/断连清理，后台立即拒绝并取消、记录权限配置错误。失败或仍在等待的本轮不会被后续 done 标记为成功。审批组件默认单次允许，不写永久授权。
- 移除强制首条 Terminal fetch 指令和操作审计门槛。新 Quick Action 启动前要求源字段和完整非空、身份一致的聊天快照，Answer 复用已批准知识检索；补充原提示词缺少的解决方案、附件与业务字段，保留材料来源及同步时间。草稿身份校验、确认、正式写入/readback 流程保持。
- 没有改 DeepSeek 问题总结或 shadow summary，没有增加未来文档/答复 worker。Kimi 回调策略、审计和跨项目脚本保留。

**材料差异核对：** 已只读核对 EU `write-support-qa.sh` 及 `analyze_lark_ticket_knowledge.mjs`。它们获取 Base 字段、关联聊天，并尝试从 `base +record-history-list` 过滤评论。该命令描述为记录变更历史；[CLI 项目问题记录](https://github.com/larksuite/cli/issues/1915)也指出它不包含评论。因此前序“fetch 已获取记录评论”不是已验证事实。当前材料使用 PostgreSQL 源字段和固定聊天快照，额外字段已补入提示词；逐记录评论仍明确标记为不可用，不伪装成空评论或完整材料。没有扩大为整 Base 评论下载或猜测评论归属。

**原生协议发现：** 本机 Hermes 0.14 对不存在的 session/load 返回 None，但 Python SDK 将它归一化为空对象。Hermes adapter 因此先通过原生 session/list 验证存在性，找不到时返回 `ACP_SESSION_NOT_FOUND`。原生模型循环的部分异常仍被上游转成文本加 end_turn；v5 不再用补丁改写该逻辑，也不以文本匹配冒充结构化错误。权限拒绝/过期/后台失败由 Octo 独立终态控制，其他真实模型失败方式仍是业务验收边界。

**尚未完成：** 最终运行环境、Document 多位置与 Terminal 间接写入的隔离仍待确定；本轮已向用户询问环境和允许目录，尚未取得答复。未执行真实模型、Ticket Answer/Document、Sprint 或外部写回/readback，未执行真实数据库迁移和部署。旧补丁文件已停止生产引用，按本任务第 4 步保留，待文件边界与原生业务替代路径验证后删除。

### 目标与已确认边界

1. Hermes 使用官方原生 ACP stdio，复用模型、认证、会话、工具和风险审批；Octo 保留共用 TS ACP Client 和薄 provider adapter。不引入独立 Hermes 后台服务。
2. 用户接受 Hermes 原生风险检测及 `manual`/`smart` 审批，不再要求“精确清单内免审批、所有清单外命令必审批”。不为该旧要求补运行时扩展，也不继续强制全部 Terminal/fs 委托 Octo。
3. 初始建议使用 `manual`；`smart` 保留为原生选项，最终有效配置另行确认。不开 YOLO，Octo 不按 Bash/Terminal 标题自动批准原生风险请求。
4. Quick Actions 收到 ACP 审批请求时展示操作并等待用户；未来 shadow 文档/答复任务收到审批请求时拒绝、终止本轮、记录错误并提示配置权限。不得只拒绝一个工具，随后仍把任务记为成功。
5. 文件写入范围仍是独立要求：允许指定位置，其他位置不能任意写入。接受原生命令审批不代表同意扩大可写目录。本机 Document 多位置写入和脚本间接写入边界仍待解决，不能用提示词冒充强制隔离。
6. 保留 Ticket Answer/Document 和三个 Sprint Quick Actions 新会话使用 Hermes 的目标；旧会话按持久化归属恢复。Ticket 问题总结和现有 shadow summary 继续使用 DeepSeek，其他 Kimi 入口不全局切换。
7. Kimi 现有兼容路径按需保留，不为文件命名或目录对称做额外重构。业务材料及正式外部写入继续由 application service 负责。

### 原生权限事实及配置边界

以下是前序只读核查的版本快照：Hermes `0.14.0` / `43e566f77eaf01293086eb7cb99a21e240d60634`。不是所有版本的统一承诺，也不等于真实 ACP 业务验收。

| 能力 | 本机语义 | 设计处理 |
| --- | --- | --- |
| `approvals.mode: manual` | 对安全检查产生且未获授权的告警申请审批；无告警命令可直接执行 | 采用原生风险审批，不补清单外命令拦截 |
| `command_allowlist` | 匹配风险类别规范键或兼容别名，不是任意命令 glob/正则列表 | 仅用于预先接受某类风险，不宣称能精确绑定脚本、参数、Ticket、cwd 或文件路径 |
| `approvals.mode: smart` | 告警交模型判断，通过/拒绝/升级人工；本机通过后记录该类别的会话授权 | 不能承诺只批准当前完整命令；部署前核对实际版本 |
| 硬拦截与其他安全检查 | 与类别 allowlist 是不同控制点 | 类别免批不解除所有拦截；命令文本检测也不保证识别脚本内部所有危险行为 |
| ACP `request_permission` | Hermes 已有请求及结果映射，只有实际发出的请求经过宿主 | Octo 实现审批交互及后台终态，不重写风险分类 |
| `HERMES_WRITE_SAFE_ROOT` | 本机只解析单根，限制原生文件写入工具，不全面覆盖终端间接写入 | 保留路径待定项，不改成共同祖先目录来冒充精确限制 |

前序字符串匹配核查确认：`script execution via -e/-c flag` 是有效类别键；`python*` 和精确的 `python -c ...` 命令文本不能代替它。该类别涵盖匹配到的多种解释器内联执行形式，并非某一 Quick Action 的专用授权。已有命令候选保留在 [配置参考](../../research/acp-permission-configs/README.md)，本轮不重新盘点、不生成最终 allowlist。

来源：[固定版本 approval.py](https://github.com/NousResearch/hermes-agent/blob/43e566f77eaf01293086eb7cb99a21e240d60634/tools/approval.py)、[固定版本 ACP permissions.py](https://github.com/NousResearch/hermes-agent/blob/43e566f77eaf01293086eb7cb99a21e240d60634/acp_adapter/permissions.py)、[固定版本 file_safety.py](https://github.com/NousResearch/hermes-agent/blob/43e566f77eaf01293086eb7cb99a21e240d60634/agent/file_safety.py)、[官方安全说明](https://hermes-agent.nousresearch.com/docs/user-guide/security/)。官网与本机有差异时，以实施版本和真实验证为准。

### 运行流程与职责

```text
Ticket/Sprint application service
  → 准备材料、会话归属和运行方式
  → 共用 ACP 会话组件 → Kimi/Hermes 薄 adapter → 官方 ACP stdio
  ← 消息、工具事件、审批请求、结束/错误
  → Octo 处理审批、校验业务结果、记录任务终态
  → 正式外部写入仍走 effect draft 确认及 Server readback
```

**会话身份：** Octo 公开 `sessionId` 与原生 `agentSessionId` 分开。ownership 持久化 `agentProvider`、`agentSessionId`；原生 ACP RPC 使用原生 ID，Octo registry、SSE、审批和 Ticket/Sprint 引用使用 Octo 身份，映射在共用会话边界处理。保存的 provider 优先于当前 action catalog，不修改 Hermes ID 工厂。旧记录按已知历史规则兼容识别，保留 native ID 全文，尤其不能把已有 `hermes_<uuid>` 截成 UUID。两个元数据字段先可空，兼容读取后补齐；映射不能只存在内存。本轮不执行 migration。

**fetch 与业务材料：** 当前 `write-support-qa.sh fetch <Ticket> --json` 获取 Ticket Base 字段、关联聊天，并尝试从记录变更历史中提取评论，写入临时 JSON；它不检索历史知识文档。实施核查纠正了前序“已获取记录评论”的假设：变更历史不是已验证的评论来源，详见上方材料差异核对。`acp-kimi-operation-audit.ts` 是按 `sessionId + actionRunId + ruleId` 存状态和退出码的内存记录，不是文档库，`completed` 也不独立证明材料完整。

Ticket 服务已有聊天快照准备，Answer 已有已批准知识检索。v5 改为 application service 检查所需材料是否准备成功，取消“第一条操作必须通过 Octo Terminal 跑 fetch”及账本硬门槛。先对比现有材料和 fetch 的必需数据，缺什么再补什么；不假定二者完整等价，不把 Lark/Ticket 逻辑塞进 runtime。既有跨项目 skill 和业务脚本保留，不因取消硬门槛而删除。

**审批：** 共用服务关联 operator、Octo/native session、actionRunId、requestId 和原生 options。用户回复只能选择本请求提供的 optionId，需校验归属、有效期和取消状态。默认单次允许，不自动写永久授权；等待时间与原生超时协调，断连/取消/超时清理待审批状态。后台拒绝后取消本轮并记录权限配置错误，后续 `done/end_turn` 不得覆盖失败。Hermes 的 `cron_mode`/`unattended_mode` 不能代替 Octo ACP worker 的终态处理。

### 逐文件改动清单

以下为已确认的 v5 文件职责；代码实施状态和未完成删除项以上方结果及验收表为准。既有路径不为改名而整体迁移。

#### ACP 通信、启动及会话

| 文件 | 处理与具体功能 |
| --- | --- |
| [adapters/acp/acp-runtime.ts](../../../server/src/adapters/acp/acp-runtime.ts) | 保留 initialize/session/prompt、事件、取消及审批回调。Hermes 不强制使用 Octo Terminal/fs；Kimi 回调按兼容需要保留。能力声明不能作为原生工具全面禁用开关。 |
| [adapters/acp/process-lifecycle.ts](../../../server/src/adapters/acp/process-lifecycle.ts) | 保留子进程启动、超时、退出及幂等清理，不加入业务策略。 |
| [adapters/acp/spawn-config.ts](../../../server/src/adapters/acp/spawn-config.ts) | 保留共用 command/args/env 类型，不扩成任务策略引擎。 |
| [adapters/acp/managed-acp-runtime.ts](../../../server/src/adapters/acp/managed-acp-runtime.ts)（已新增） | 移入 provider 选择和原生会话身份适配；不访问 Ticket/Lark 数据。 |
| [adapters/hermes-acp/hermes-acp-runtime.ts](../../../server/src/adapters/hermes-acp/hermes-acp-runtime.ts) | 用已有 Hermes Python 启动官方 `python -m acp_adapter`，等价 `hermes acp`；准备环境并调用共用 runtime。删除自定义 launcher 依赖和 native ID 前缀校验。 |
| [adapters/kimi-acp/kimi-acp-runtime.ts](../../../server/src/adapters/kimi-acp/kimi-acp-runtime.ts) | 保留 `kimi acp` 默认入口、兼容导出及共用 ACP 通信。 |
| [adapters/kimi-acp/kimi-acp-config.ts](../../../server/src/adapters/kimi-acp/kimi-acp-config.ts) | 保留现有配置入口，不加入业务判断。 |
| [adapters/kimi-acp/spawn-config.ts](../../../server/src/adapters/kimi-acp/spawn-config.ts) | 保留参数、环境、PATH 和代理兼容。 |
| [adapters/kimi-acp/kimi-session-registry.ts](../../../server/src/adapters/kimi-acp/kimi-session-registry.ts) | 调整 live record 类型，区分 Octo 身份及原生 runtime，供恢复/审批关联。 |
| [adapters/kimi-acp/in-memory-kimi-session-registry.ts](../../../server/src/adapters/kimi-acp/in-memory-kimi-session-registry.ts) | 按映射兼容活动运行时、busy 和清理；不作为身份映射唯一存储。 |
| [adapters/postgres/acp-kimi-session-ownership-store.ts](../../../server/src/adapters/postgres/acp-kimi-session-ownership-store.ts) | 保存/读取 `agentProvider`、`agentSessionId`，保持用户归属和旧 ID 兼容。 |
| [adapters/postgres/schema.ts](../../../server/src/adapters/postgres/schema.ts) | owners 类型增加可空 `agent_provider`、`agent_session_id`，保留既有 `session_id` 及引用。 |
| [adapters/postgres/database.ts](../../../server/src/adapters/postgres/database.ts) | 增加字段兼容迁移与补齐策略；本轮不运行迁移。 |
| [application/services/acp-kimi-proxy.service.ts](../../../server/src/application/services/acp-kimi-proxy.service.ts) | 按持久化归属创建/恢复 runtime，注入运行方式与审批；在创建阶段保存关联，不等模型完成。 |
| [application/services/acp-kimi-session-history.service.ts](../../../server/src/application/services/acp-kimi-session-history.service.ts) | 按保存的 provider 加载/回放，向 UI 返回 Octo 身份。 |
| [adapters/kimi-acp/session-export.ts](../../../server/src/adapters/kimi-acp/session-export.ts) | 保留 Kimi 导出兜底，只传 Kimi 原生 ID，不用于 Hermes。 |

#### 审批、接口及前端

| 文件 | 处理与具体功能 |
| --- | --- |
| [application/services/acp-kimi-permission-policy.ts](../../../server/src/application/services/acp-kimi-permission-policy.ts) | Hermes 不走完整命令白名单或按工具名先自动允许的 handler；Kimi 兼容逻辑和仍使用的临时目录助手保留。 |
| [domain/acp-kimi-permission-profile.ts](../../../server/src/domain/acp-kimi-permission-profile.ts) | 保留 Action/Profile 关联，澄清适用方；其 terminal/fs 布尔值不代表原生 Hermes 的只读保证。 |
| [application/services/acp-permission.service.ts](../../../server/src/application/services/acp-permission.service.ts)（已新增） | 一处管理请求、归属、原生选项、回复及清理；交互等待，后台拒绝并触发本轮失败。 |
| [modules/acp-kimi/event-stream.ts](../../../server/src/modules/acp-kimi/event-stream.ts) | 增加审批请求/处理状态事件，包含请求身份、操作、风险及选项，与 effect draft 区分。 |
| [modules/acp-kimi/acp-kimi.dto.ts](../../../server/src/modules/acp-kimi/acp-kimi.dto.ts) | 增加审批回复 Zod DTO；operator 取登录态，不能信任请求自行声明。 |
| [modules/acp-kimi/acp-permission.controller.ts](../../../server/src/modules/acp-kimi/acp-permission.controller.ts)（已新增） | 接收审批回复，验证会话归属和请求有效性，调用服务，不执行命令。 |
| [server/src/index.ts](../../../server/src/index.ts) | 按现有 Web 鉴权注册审批回复接口，不扩大旧接口访问范围。 |
| [fe/src/components/ai-session/AcpPermissionPrompt.jsx](../../../fe/src/components/ai-session/AcpPermissionPrompt.jsx)（已新增） | 共用命令/风险说明、允许/拒绝及等待/过期展示；默认单次允许。 |
| [fe/src/services/acp/acp-permission-api.js](../../../fe/src/services/acp/acp-permission-api.js)（已新增） | Ticket/Sprint 复用已登录的审批回复请求，只发送本轮身份和 optionId。 |
| [fe/src/pages/LarkTicketDetailPage.jsx](../../../fe/src/pages/LarkTicketDetailPage.jsx) | Ticket 接入共用审批，保持正式业务草稿确认。 |
| [fe/src/pages/MeegleSprintPages.jsx](../../../fe/src/pages/MeegleSprintPages.jsx) | Sprint 接入同一审批组件，不复制权限逻辑。 |
| [fe/src/services/lark-ticket-ai/lark-ticket-ai-api.js](../../../fe/src/services/lark-ticket-ai/lark-ticket-ai-api.js) | Ticket 事件消费与审批回复接入，沿用登录请求，不允许回复替换待执行命令。 |
| [fe/src/services/meegle-sprint-ai/meegle-sprint-ai-api.js](../../../fe/src/services/meegle-sprint-ai/meegle-sprint-ai-api.js) | Sprint 使用同一审批契约，不另设授权语义。 |
| [fe/src/lib/ai-session-transcript.js](../../../fe/src/lib/ai-session-transcript.js) | 展示等待/批准/拒绝；等待或失败不能显示为成功完成。 |

#### 材料与业务结果

| 文件 | 处理与具体功能 |
| --- | --- |
| [application/services/lark-ticket-ai-session.service.ts](../../../server/src/application/services/lark-ticket-ai-session.service.ts) | 准备 Ticket/聊天/已批准知识并校验结果；取消 fetch 账本硬门槛，检查材料准备结果，保持草稿身份和 snapshot 绑定。 |
| [application/services/lark-ticket-thread-context.service.ts](../../../server/src/application/services/lark-ticket-thread-context.service.ts) | 复用快照准备；先核对 fetch 必需字段/评论，缺失在业务层补齐。 |
| [domain/support-ticket-analysis-update.ts](../../../server/src/domain/support-ticket-analysis-update.ts) | 删除强制第一条 fetch 的指令函数，保留分析 schema。 |
| [application/services/acp-kimi-operation-audit.ts](../../../server/src/application/services/acp-kimi-operation-audit.ts) | 不再作为 Hermes 结果门槛；Kimi 诊断按需保留，不为 Hermes 复制账本。 |
| [application/services/support-ticket-effect-draft.service.ts](../../../server/src/application/services/support-ticket-effect-draft.service.ts) | 保留草稿校验、人工确认、正式写入和 readback，不把工具批准当发布批准。 |
| [application/services/meegle-sprint-ai-session.service.ts](../../../server/src/application/services/meegle-sprint-ai-session.service.ts) | 保留 Sprint 材料和关联，适配共用会话/审批，不增加 Ticket fetch。 |
| [application/services/lark-ticket-shadow-summary.service.ts](../../../server/src/application/services/lark-ticket-shadow-summary.service.ts) | 当前 DeepSeek 总结保持；未来文档/答复 worker 复用后台权限错误规则，不在本次提前实现。 |

#### 退出补丁链及验证

删除项须在原生启动、会话、审批和业务替代路径验证后实施；本轮不删除文件。

| 文件 | 处理与具体功能 |
| --- | --- |
| [scripts/hermes-acp/launcher.py](../../../server/scripts/hermes-acp/launcher.py) | 移除生产依赖后删除，不再注入工具后端及 ID 工厂。 |
| [scripts/hermes-acp/runtime_patch.py](../../../server/scripts/hermes-acp/runtime_patch.py) | 删除源码校验、临时补丁及内存加载。 |
| [patches/client-tools.patch](../../../server/scripts/hermes-acp/patches/client-tools.patch) | 删除，不再修改原生工具执行链。 |
| [patches/manifest.json](../../../server/scripts/hermes-acp/patches/manifest.json) | 随补丁删除哈希清单。 |
| [patches/README.md](../../../server/scripts/hermes-acp/patches/README.md) | 随补丁删除，历史依据留在本任务。 |
| [upstream/agent/tool_backend.py](../../../server/scripts/hermes-acp/upstream/agent/tool_backend.py) | 删除强制后端。 |
| [upstream/acp_adapter/client_tools.py](../../../server/scripts/hermes-acp/upstream/acp_adapter/client_tools.py) | 删除工具转发实现。 |
| [scripts/hermes-acp/test_client_tools.py](../../../server/scripts/hermes-acp/test_client_tools.py) | 随自定义后端删除，不沿用为新设计验收。 |
| [scripts/hermes-acp/protocol_fixture.py](../../../server/scripts/hermes-acp/protocol_fixture.py) | 改为直接启动官方 ACP 的测试辅助，保留模型桩隔离，不成为生产入口。 |
| [scripts/hermes-acp/README.md](../../../server/scripts/hermes-acp/README.md) | 实施时改为剩余测试辅助说明；原生运行说明放 Server README。 |
| [hermes-acp-runtime.test.ts](../../../server/src/adapters/hermes-acp/hermes-acp-runtime.test.ts) | 改验原生参数、provider 和身份映射，不要求 native ID 带前缀。 |
| [hermes-acp-protocol.test.ts](../../../server/src/adapters/hermes-acp/hermes-acp-protocol.test.ts) | 改验未修改 Hermes 的初始化、流、恢复、审批、拒绝、取消及错误，删除强制工具委托断言。 |

相关 proxy/history、ownership、Ticket/Sprint、FE 及新审批服务测试随行为调整，覆盖身份隔离、过期/取消、后台失败不能被完成事件覆盖、材料失败不接受结果。旧补丁测试不算原生运行证据。

已同步 [lifecycle](../../ai-dev/lifecycle/current-system-technical-objects.md)、[Server 规则](../../ai-dev/rules/server-code-rules.md)、[Server README](../../../server/README.md)、[IT Platform Sync](../../tenways-octo/it-platform-sync.md) 及配置参考，区分现行代码、本地验证、未应用配置与待完成业务验收。

### 实施顺序与当前验收

1. 原生启动、共用会话及持久化映射 → 验证新建、重启恢复、旧 Kimi/Hermes 历史和身份关联。
2. 共用审批及 FE → 验证用户归属、单次批准/拒绝、过期/取消及后台失败终态。
3. Ticket 材料及结果校验 → 核对材料覆盖，验证缺失时失败、草稿确认及 readback。
4. 解决并验证写入位置，完成原生业务验收 → 再删除补丁链并更新运行说明；部署单独记录。

- [x] v5 设计获用户确认；逐文件职责、替代关系及未完成项已落盘。
- [x] 原生 Hermes 启动及未修改上游的协议验证通过（loopback 模型桩，非真实模型）。
- [x] provider/native session 映射、兼容 schema 及历史恢复验证通过（pg-mem；真实 migration 未执行）。
- [x] Quick Actions 审批与后台权限错误终态验证通过（服务/接口/FE 状态与原生协议测试；真实页面操作验收未执行）。
- [x] 材料准备取代强制 fetch 账本，缺失或身份不符时在调用模型前失败；评论来源缺口单独记录。
- [ ] 所需可写位置明确并验证；Document 多位置和间接写入未解决前不宣称路径隔离完成。
- [ ] 原生真实 Ticket Answer/Document 及 Sprint 业务验收完成，保留发布确认/readback。
- [x] Server/FE/Extension 包级检查及当前代码文档同步完成。
- [ ] 替代路径验证后删除补丁链。
- [ ] 部署节点及实际运行验收完成。

任务保持 `in_progress`：v5 代码与本地检查已实施，文件隔离、真实业务验收、补丁文件删除及部署仍待完成。具体 Quick Actions allowlist 留待后续，本次不扩充授权。

## v4 权限配置草案

**历史方案：superseded。** “清单外命令必审批”已由 v5 原生风险审批替代；以下保留配置草案和当时证据，不作为当前 Hermes 开发要求。

用户已要求暂停代码改造，并重新明确两项权限需求：允许修改指定路径内的文件；允许执行指定范围内的脚本。预授权范围内自动执行；其他可申请命令由 Quick Actions 提供用户审批，后续 shadow 文档/答复任务遇到审批需求则立即失败、记录脱敏操作及原因，并提示配置权限后重试。明确禁止的操作不因交互模式放开。

本轮仅授权生成配置参考，产物位于 [research/acp-permission-configs](../../research/acp-permission-configs/README.md)。没有修改运行代码、现有用户配置或数据库；没有实现审批 UI、后台文档/答复任务，也没有继续维护或移除 patch。v2/v3 的“全部工具交给 Octo 执行、沿用完整执行账本”属于既有实现记录，不作为本轮重新确认的需求。

- [x] Kimi Answer / Document TOML、Hermes YAML / Answer 环境变量示例完成语法与静态范围校验。
- [ ] 原生 Kimi/Hermes 对这些规则的真实 ACP 行为验收。
- [ ] Quick Actions 审批交互和 shadow 权限错误处理完成后续设计。

当前核查结论：Kimi Code 的原生规则模板可表达具体命令和文件工具的 allow/ask/deny，但本机 0.40.1 匹配行为尚未实测；Hermes 本机 `43e566f77eaf01293086eb7cb99a21e240d60634` 的 command_allowlist 按危险模式键匹配，safe root 只接受一个目录，不能直接套用官网多根写法或 Kimi 式命令清单。因此未生成误导性的 Hermes Document 多根配置，完整“其他命令均审批”仍是待解决的运行时能力缺口。

配置验证：使用已有 Python 3.13 的 tomllib / PyYAML 解析两个 TOML 和一个 YAML；校验 Answer 的 1 条、Document 的 5 条命令候选、审批/拒绝兜底顺序、无重复规则、脚本存在、占位符及单根环境变量。检查本地文档链接与空白格式。没有新增测试文件或依赖，没有启动 Agent、执行 Ticket fetch/Eval 或应用权限配置；这些检查不证明真实运行时权限生效。

以下为 v2/v3 已有实现与历史验证，已被 v5 替代，不作为新版本实施或部署指引。

## 历史目标（v2/v3，superseded）

采用 **Hermes 原生 ACP stdio** 适配现有 Octo ACP Client，并将原先使用 Kimi ACP 的 Quick Actions 新会话切到 Hermes。2026-09-05 用户将任务从选型文档推进至兼容适配实施，需求版本更新为 v2。随后用户要求补齐 Hermes 缺失的扩展接口并收敛适配层，推进为 v3。

四个产品的技术事实、版本快照和对比保留在 [调研参考](../../research/2026-09-05-acp-agent-options.md)。本任务保存当前方案、实施进展和验证证据；现行运行配置见 [Server README](../../../server/README.md)，[测试辅助说明](../../../server/scripts/hermes-acp/README.md)记录原生协议测试和已停用补丁的保留边界。

## 历史验收标准（v2/v3）

- [x] 四方案参考调研及 Hermes 原生 ACP 选型建档。
- [x] Ticket Answer / Document 与三个 Sprint Quick Actions 的新会话选择 Hermes；原有 DeepSeek Summary / shadow 路径保留。
- [x] 真实 Hermes 进程完成 ACP 初始化、新建、提示、流式输出与跨进程历史恢复；模型服务使用本地接口桩。
- [x] 受控 Terminal / 文件工具委托至 Octo，成功执行有真实进程审计，越权命令被拒绝。
- [x] 取消后等待子进程清理及审计终态；共享执行器的超时、非零退出、输出限制和关闭测试通过。
- [x] Hermes / Kimi 历史正确分流，恢复原权限快照；Hermes 不调用 Kimi export。
- [x] 包级测试与构建完成，记录结果。
- [ ] 部署节点准备 Hermes 环境并验证真实模型与真实 Ticket 的 Answer / Document 业务闭环。

当前代码交付与后续部署验收分开记证据；本任务因真实业务验收尚未完成而保持 `in_progress`。

## 历史实施范围（v2/v3）

| 动作 / 入口 | 新会话路径 | 约束 |
| --- | --- | --- |
| `lark-ticket-support-qa-answer` | Hermes ACP | `support-qa.answer.v1`，仍需当前 Ticket fetch 的真实完成审计 |
| `lark-ticket-support-qa-document-preview` | Hermes ACP | `support-qa.document.v1`，外部效果仍需 effect draft 确认 |
| `meegle-sprint-release-notes` | Hermes ACP | `acp.chat-readonly.v1`，仅使用 Server 注入的上下文 |
| `meegle-sprint-internal-summary` | Hermes ACP | 同上 |
| `meegle-sprint-confirm-gaps` | Hermes ACP | 同上 |
| Ticket 问题总结、shadow summary | DeepSeek | 独立结构化分析流程 |
| 未带 Quick Action 的新对话、Story / Bug one-shot | 现有 Kimi 路径 | 本次未将全部 ACP 入口做全局替换 |
| 已有会话继续 / 历史加载 | 按保存的会话 ID 选择 Agent | 不迁移或重新解释 Kimi 转录 |

没有数据库 migration、新增 npm 依赖或独立后台服务。FE Ticket / Sprint 对话中的 Kimi 固定文案改为通用 AI / ACP 文案，兼容两种历史会话。

## 既有实现（v3，待收敛）

```text
FE Quick Action
  → Server catalog 选择 hermes_acp，绑定 Action / Ticket / permission profile
  → 通用 TS ACP runtime + Hermes adapter 启动 launcher.py
  → 校验固定源码并在内存加载 Hermes 工具后端补丁
  → Hermes 原生 ACP Server / 会话库 / 模型循环
  → 工具分发委托标准 ACP permission、Terminal、fs 回调
  → Octo 校验完整命令 / 路径，以 shell:false 执行并记录实际退出
  → 复用现有 SSE、ownership、effect draft 和 Server readback 流程
```

### 原生 ACP 与兼容启动层

- 复用 Hermes 原生 ACP `HermesACPAgent`、SessionManager 和 AIAgent；由 Octo 管理 stdio 子进程，不引入 Hermes HTTP / Runs API 或 OpenACP daemon。
- 仓库启动层依赖已安装的 Hermes Python 环境，不修改全局 Hermes 源码；模型和认证取自 Hermes 配置。本机当前配置的模型为 `glm-5.3-flash`、provider 为 `zai`，仅检查非敏感配置字段，没有实际调用该模型。
- 验证基线：Hermes `0.14.0` / commit `43e566f77eaf01293086eb7cb99a21e240d60634`，Python ACP `0.9.0`，Octo JS ACP `0.17.1`。不同 Hermes checkout 即使版本字符串相同也需要重新验证内部接口。
- 只按 Client Capabilities 提供 terminal、read_file、write_file；只读 Sprint 会话不提供这些工具。规范化权限标题为 Bash、ReadFile、WriteFile，后续实际回调仍逐项校验，标题批准不能代替执行授权。
- Hermes 原生循环和工具分发继续运行；补丁在串行分支的所有特殊工具之前、并行 / 单工具入口处调用必需的工具后端。后端缺失、异常、超时或断连时返回失败，拒绝原生执行回退。禁用插件发现与 MCP 注册；原生工厂在创建 Agent 前关闭隐式 context、memory、soul 和 checkpoint。
- ACP Client 的策略错误通过 JSON-RPC `data.details` 保留 `ACP_*` 原因；不向模型转发任意 RPC 诊断细节。Hermes 模型循环的异常或结构化失败转换为 `ACP_AGENT_RUN_FAILED` RPC 错误，避免原生 `end_turn` 把失败标记为成功。
- 这是工具调用边界，不是 OS 沙箱；Hermes 仍读取配置、调用所选模型并保存自身会话。

### 会话和历史兼容

- Hermes 原生 SessionManager 通过注入的 `session_id_factory` 生成并保存 `hermes_<uuid>` ID；不再使用 Octo SessionManager 子类。Octo ownership 记录同一 ID，本次不引入双向 ID 映射或新增 provider 列。
- 保存的 ID 优先于新会话 provider 偏好。旧 Kimi ID 始终交给 Kimi；Hermes 会话加载自己的 `state.db`，无 Kimi export 回退。
- 历史加载恢复归属记录中的 cwd、权限 Profile、Ticket、action run，并将权限上下文放回 live registry。缺少版本化 Profile 的旧会话继续按现有规则限制执行。
- 会话列表以 ownership 记录补齐持久化会话；Kimi 发现失败时保留已归属的会话并记录诊断，不阻断 Hermes 历史列表。
- 多节点仍需对应 Agent 状态持久化及节点路由；现有 `runtime_host_name` 是诊断字段，不自动提供跨节点会话恢复。

### 真实执行和业务效果

沿用现行 [ACP 权限任务](./2026-08-24-lark-ticket-ai-session-permissions.md)的完整 argv、cwd、Ticket、真实路径与 Server 环境校验。每 Session 一个受控 Terminal，默认 60 秒、输出 256 KiB；文件 UTF-8 / 256 KiB、敏感路径和 symlink 限制保持不变。

取消与 finally 同时 close 时必须等待同一个清理 Promise。本次真实进程测试发现原 transport 会在第二次 close 提前返回，现已修复并添加回归测试，确保关闭返回时执行审计已经进入终态。

Answer / Document 仍要求当前 Session / action run 的 `support_qa.fetch` 实际完成；模型文本、权限批准及工具完成通知不能代替该证据。外部写入继续走 effect draft → 人工确认 → Server 执行 / readback。

## 历史设计复核与 v3 实施

用户要求“缺的是哪部分，自己把缺的部分补上”。v3 补齐 Hermes 的强制工具执行后端及创建前配置入口，并提取通用 TS ACP runtime。没有改用 HTTP 服务或引入 MCP。

**当前设计状态：待收敛。** 用户随后指出 `client-tools.patch` 和 `scripts/hermes-acp` 越来越重。该意见成立：v3 去掉了工厂与整段分发的替代实现，却新增启动时补丁构建、源码哈希清单和 import loader，形成项目维护的 Hermes 定制运行时。测试通过不能证明这套依赖维护方式更简单。当前代码保留供复核，尚未部署；不继续扩大动态补丁机制。

收敛判断分开处理：通用 TS runtime 可保留；若继续要求所有 Terminal / fs 由 Octo 执行，Hermes 侧工具后端缺口仍需补齐，但应作为正常构建的固定运行时依赖维护，消除请求启动时修改模块的机制。若直接使用未修改的 `hermes acp`，则需另行明确原生工具执行与现有权限 / 审计契约的差异，不能默默放宽要求。仅将 Python 文件迁出 scripts 不算减少维护成本。

### 方案取舍

| 设计 | 结论 |
| --- | --- |
| TS 直接连接未改动的 `hermes acp` | 标准聊天 / 会话可用，但原生工具不自动委托 Octo，不满足当前执行与审计契约 |
| v2 完整 bridge | 已证明协议与操作链，但替换了 SessionManager、工厂和整段分发；v3 已替换该实现 |
| **通用 TS runtime + Hermes 强制工具后端** | **本次实施**：保留原生工厂、会话与循环，在实际工具入口补上不可回退的后端接口 |
| Server 预取所有材料、模型只生成草稿 | 可简化固定生成流程，但改变 Agent 主动 fetch 与审计契约，本次未采用 |

上游新版本提供 `tool_execution` middleware，但默认扩展失败后会继续原生执行，不能直接承担本任务约束。详细源码版本与事实见 [调研补充](../../research/2026-09-05-acp-agent-options.md#43-工具扩展点补充核查2026-09-05)。本次使用本机已验证版本的显式补丁，没有升级至上游 main。

### 代码职责

| 部分 | 所属文件 | 职责 |
| --- | --- | --- |
| 通用 ACP Client | [acp-runtime.ts](../../../server/src/adapters/acp/acp-runtime.ts) | stdio、初始化、会话、流式事件、Terminal / fs、取消清理；启动配置由 adapter 显式注入 |
| Kimi adapter | [kimi-acp-runtime.ts](../../../server/src/adapters/kimi-acp/kimi-acp-runtime.ts) | Kimi 默认启动配置与旧 import 的兼容出口；现有导出恢复仍在 Kimi adapter |
| Hermes adapter | [hermes-acp-runtime.ts](../../../server/src/adapters/hermes-acp/hermes-acp-runtime.ts) | Python 启动配置、会话身份检查，直接使用通用 runtime |
| 启动与补丁加载 | [launcher.py](../../../server/scripts/hermes-acp/launcher.py)、[runtime_patch.py](../../../server/scripts/hermes-acp/runtime_patch.py) | 源码校验、临时构建补丁、内存模块加载、创建原生 ACP Agent；原 `bridge.py` 已删除 |
| Hermes 缺失接口 | [client-tools.patch](../../../server/scripts/hermes-acp/patches/client-tools.patch) | 工具后端注入、创建前配置、原生分发调用、ACP 连接与取消、模型失败终态 |
| ACP 工具后端 | [client_tools.py](../../../server/scripts/hermes-acp/upstream/acp_adapter/client_tools.py)、[tool_backend.py](../../../server/scripts/hermes-acp/upstream/agent/tool_backend.py) | 三类标准工具与 Client RPC 转换、失败关闭；不保存 Action / Ticket 策略或执行脚本 |

业务权限、完整 argv / 路径校验、操作审计与 effect draft 继续在 TS Server。没有通过拆文件继续覆盖整段 `_execute_tool_calls`，没有复制配置与 provider 工厂，也没有给实例挂载替换方法。

### 补齐的契约

- `HermesACPAgent` / `SessionManager` 接收 `tool_backend`、`require_client_tools`；必需后端缺失时拒绝创建。原生工厂将绑定 Session / cwd 的后端交给 AIAgent，并在构造前设置受控工具集和 context / memory / checkpoint 开关。
- AIAgent 保留原生循环与串行 / 并行调度；真正执行前调用 `invoke_backend`，覆盖 terminal、文件及 delegate / execute_code / todo / memory 等特殊分支。后端异常只产生失败结果，不进入原生 handler。
- `AcpClientToolBackend` 从初始化接收能力和事件循环，从连接回调接收 ACP Client，按能力暴露 terminal / read_file / write_file。未知或关闭的工具拒绝，RPC 超时取消 future，取消时释放受控 Terminal。
- 模型循环异常、结构化失败及 executor 失败转换成 `ACP_AGENT_RUN_FAILED`。不解析模型回复文本猜测是否成功。
- 启动检查九个关键源码文件的 SHA-256；固定基线为 `43e566f77eaf01293086eb7cb99a21e240d60634`。五个原生文件应用小范围 diff，两个新增模块提供后端；其余循环代码不改。补丁由项目维护，尚未提交或获得上游接纳。
- 补丁先在临时目录校验 / 应用，再由标准 Python import loader 从内存加载；临时目录在导入 Agent 前即清理。没有写入全局 Hermes 源文件。目标节点需要 `git` 用于 `git apply --check` / `git apply`。

### 会话身份的范围决定

设计讨论曾提出增加 `agentProvider` / `agentSessionId` 列。本次补齐执行接口无需该 migration：使用显式 `session_id_factory` 注入即可保留已有完整 `hermes_<uuid>` 原生 ID，并去掉自定义 SessionManager。旧 Kimi ID、现有 Hermes DB ID、ownership / Ticket / Sprint 引用和审计关联均不变；不要截掉已保存 Hermes ID 的前缀。身份元数据迁移保留为后续独立设计，不属于本次尚缺实现。

## v5 本地业务排障（2026-09-06）

### 数据库迁移与测试范围

用户授权使用本地开发数据库迁移并选择 Ticket 实测。实际目标来自 `server/.env`：PostgreSQL `192.168.0.7:18078/tenways_octo_ly_0901`，SSH 关闭；这是本地开发环境配置的数据库，不是本机 loopback PostgreSQL。

先读回确认 `acp_kimi_session_owners.agent_provider` 与 `agent_session_id` 已存在且均为 nullable text，再在事务内执行仅这两个字段的 `ADD COLUMN IF NOT EXISTS`（`lock_timeout=5s`）并读回。DDL 实际执行但为幂等无变化；没有运行全库 reset、同步或业务数据迁移。

### Quick Actions 无回答的根因与修复

用户在 Ticket **1971**（`recvrzEXFyMG4E`）执行 Answer / Document 后只看到自己的消息。12:43 的两个请求均到达 Server、启动官方 Hermes ACP 并完成 prompt RPC，HTTP SSE 返回 200；日志显示实际模型为 `glm-5.3-flash`，provider `zai`，配置地址为 `https://open.bigmodel.cn/api/paas/v4`。模型请求返回 **401 / 令牌已过期或验证不正确**。上游将 AuthenticationError 记录后仍返回 `stopReason=end_turn`，没有 assistant 文本。Hermes SQLite 中这两个 native session 都只有一条 user message；原有 Octo 逻辑据此误记为 completed。

- Managed ACP chat 现在要求 Hermes 本轮至少产生非空 `agent_message_chunk` 文本，才接受 `end_turn`。空白、仅思考或仅 usage 更新返回 `ACP_EMPTY_RESULT`、保存 failed 并关闭运行时，不发送 done；不解析 stderr 或模型文字来推测认证状态。
- Ticket FE 显示执行未完成、具体错误及重新执行；失败会话重新打开仍显示错误。移除“答案已保存”的无条件断言，重试创建新的受控 Action 会话。
- 仅按 Ticket、provider、精确 sessionId / actionRunId 及原 completed 状态，将用户最初两个已证实为空的会话修正为 failed；事务实际更新 2 行。没有修改 Ticket 字段或提交任何外部操作草稿。

| 用途 | public session | actionRunId | 结果 |
| --- | --- | --- | --- |
| 原 Answer（12:43） | `hermes_7245bd3e-2a19-4fbe-afad-7081db000a0a` | `b25a2890-e7f0-4b4f-9144-af5c6c1b109f` | native 只有 user 消息；已修正 failed / ACP_EMPTY_RESULT |
| 原 Document（12:43） | `hermes_b786a05d-50e2-4340-a8f0-61bd901cd3ad` | `fa65e96f-f342-420c-9b1b-de49e7f8ab1f` | native 只有 user 消息；已修正 failed / ACP_EMPTY_RESULT |
| 修复后 Answer（12:55） | `hermes_5f489f2e-c38f-47b2-ba74-ce5c7e45785f` | `70d39081-857c-4349-8b70-d29c09d1d4b3` | Chrome 真实 Quick Action 显式失败；数据库读回 failed / ACP_EMPTY_RESULT |
| 修复后 Document（12:58） | `hermes_bb06c13c-55ed-4031-8e80-5c04fbf40957` | `2eee2c6a-09f7-416a-bcab-2b80aa85f906` | Chrome 真实 Quick Action 显式失败；数据库读回 failed / ACP_EMPTY_RESULT |

运行证据：`server/logs/app.2026-09-06.2.log` 与 `api.2026-09-06.2.log`，12:43、12:55、12:58。这里只记录非敏感错误摘要，不保存凭据或完整业务 prompt。

**当前阻断：** 认证尚未恢复，未产出真实答案或文档。拟用现有 GLM 密钥向智谱 Coding 与 Z.ai 通用/Coding 三个官方地址做各一次最小连通请求；自动审批拒绝，原因是未明确授权这些具体凭据目的地。已向用户提出该精确范围的确认，未执行探测，未切换模型或修改 Hermes 认证配置。生成和人工确认后的外部写回仍分别待验收。

## 进展记录

| 日期 | 版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-05 | v1 | planned | 四方案调研建档，用户选择 Hermes ACP stdio。 | 当时未改造运行时。 |
| 2026-09-05 | v2 | in_progress | 实施五个 Quick Actions 切换、仓库 Python 启动层、会话 ID 分流和权限恢复。 | 不是全局替换 Kimi；没有部署。 |
| 2026-09-05 | v2 | in_progress | 原生模型循环 + 本地 HTTP 桩验证 ACP 工具委托；发现 SDK 隐藏策略错误，已保留 `ACP_*` 原因。 | 模型桩只证明协议 / 执行链，不证明回答质量。 |
| 2026-09-05 | v2 | in_progress | 取消实验暴露并修复重复 close 提前返回；新增等待清理回归测试。 | 真实业务脚本的完整外部链路待验收。 |
| 2026-09-05 | v2 | in_progress | Server 全量 / build、Extension typecheck / 全量重跑、FE build 通过；模型失败终态适配通过 Python 回归测试。 | 剩余真实模型与目标节点业务验收；未部署。 |
| 2026-09-05 | v2 | in_progress | 设计复核：对比直接原生连接、现有 bridge、通用 TS runtime + 工具委托扩展及 Server 预取方案；新增上游 middleware 调研。 | 当时推荐方案尚未实施；官方扩展的默认异常回退不能承担现有执行限制。 |
| 2026-09-05 | v3 | in_progress | 用户授权补齐缺失接口；已提取共享 TS runtime，删除完整 bridge，落地固定版本强制工具后端补丁。 | 源码与本地协议已验证；真实模型 / 业务写回与部署仍待验收。 |
| 2026-09-05 | v3 | in_progress | 用户质疑动态 patch 与脚本目录复杂度；重新区分必要的工具后端和额外的运行时补丁加载机制。 | 设计待收敛，当前实现未部署；本轮未进一步改动运行时代码。 |
| 2026-09-05 | v4 | in_progress | 按用户澄清生成 Kimi/Hermes 配置参考。已只读核对六份数据库提示词、Action catalog 与 Odoo EU 脚本；发现并排除无当前调用需求的 analysis-update 预授权。 | 只生成参考文件；原生审批、文件范围及后台失败处理未做业务运行验证。 |
| 2026-09-06 | v5 | in_progress | 用户确认原生风险审批和逐文件设计，要求先落盘。记录原生启动、会话元数据、共用审批、材料准备及补丁退出计划，标记旧方案 superseded。 | 仅更新文档和相关索引；未继续命令逐条核查，未应用 allowlist，未改运行代码、配置或数据库。 |
| 2026-09-06 | v5 | in_progress | 用户要求实施；生产路径改为官方 ACP，持久化 provider/native ID，接入共用审批与创建阶段业务关联，替换 fetch 审计门槛为材料校验。原生进程、持久化兼容、审批终态和包级验证见下表。 | 未修改真实配置、执行数据库迁移或部署；文件隔离、真实业务和补丁删除仍待完成。 |
| 2026-09-06 | v5 | in_progress | 开发库两列幂等迁移及读回完成；实测定位模型 401 被原生空 end_turn 隐藏，补上空结果失败、页面错误与重试，修正两条误标完成会话。 | 两个真实 Quick Actions 已验证失败可见及持久化；认证修复与成功生成尚未通过。 |

## 验证证据

| 检查 | 结果 | 证据与边界 |
| --- | --- | --- |
| v5 空结果回归 / Server 全量 | 通过 | 先验证 2 个空输出用例在旧逻辑失败，再修复至定向 10 / 10；全量 151 个文件、749 项通过，1 项可选协议测试跳过，Server build 通过。覆盖空白、仅思考与正常文本，以及失败状态、清理和不发送 done。 |
| v5 排障 FE 测试 / build | 通过 | 152 / 152，build 通过；新增 HTTP 200 SSE 携带 ACP_EMPTY_RESULT 时错误保留、不产生 done 的回归。Chrome 实测两个按钮，均显示执行未完成、具体错误和重新执行；失败状态由开发库读回确认。 |
| v5 Server 全量 / build | 通过 | `pnpm --dir server test`：151 个文件、746 项通过，1 项可选协议测试默认跳过并另行启用验证；`pnpm --dir server build` 通过。覆盖审批身份/归属/选项、过期/取消/后台终态、失败写库异常仍清理运行时、创建阶段关联与并发保护、材料缺失和身份不符。 |
| v5 原生 Hermes 进程协议 | 1 / 1 通过 | `HERMES_ACP_TEST_PYTHON=/Users/linyu/.hermes/hermes-agent/venv/bin/python pnpm --dir server test src/adapters/hermes-acp/hermes-acp-protocol.test.ts`。未修改的 Hermes `43e566f77eaf01293086eb7cb99a21e240d60634`：原生初始化、工具实际执行、单次批准/拒绝、跨进程 list/load/replay/续聊、取消及不存在的会话错误。使用临时 HOME/HERMES_HOME 和 loopback 模型桩，测试内关闭可选下载，未改真实配置或调用真实模型。 |
| v5 会话持久化兼容 | 通过 | ownership store 的 pg-mem 测试验证 provider/native ID 写入和读取、旧 ID 补齐及跨用户/改映射拒绝；history/proxy 测试验证恢复分流和创建时业务关联。这不是对真实 PostgreSQL 执行迁移的证据。 |
| v5 FE 测试 / build | 通过 | `pnpm --dir fe test`：151 / 151；`pnpm --dir fe build` 通过。审批回复只发送绑定身份和原生 optionId；拒绝/等待不显示成功，流中断返回错误。真实 Ticket/Sprint 页面操作尚未验收。 |
| v5 Extension 测试 / typecheck / build | 通过 | `pnpm --dir extension test`：45 个文件、282 / 282；`pnpm --dir extension typecheck`、`pnpm --dir extension build` 均通过。没有真实扩展登录或业务 E2E 验收。 |
| v5 文档与差异 | 通过 | 7 份任务/架构/运行说明的 85 个本地链接与代码围栏检查通过，`git diff --check` 通过。 |
| v5 设计落盘（实施前） | 完成 | 当时三份任务/参考文档的 77 个本地链接、代码围栏、版本/日期、历史标记及空白检查通过；逐文件清单包含 48 项既有/拟新增文件。当时仅为文档验证，代码验收以上述 v5 实施结果为准。 |
| v3 启动检查 | 通过 | `launcher.py --check`；验证关键源码哈希、补丁应用和必需后端构造，不调用模型。 |
| v3 Python 扩展测试 | 16 / 16 通过 | [test_client_tools.py](../../../server/scripts/hermes-acp/test_client_tools.py)：真实原生串行 / 并行 / 特殊分支、后端缺失 / 异常 / 断连 / 超时、模型失败、创建前配置及恢复、补丁不写安装文件与版本不匹配拒绝；无模型 / 外部 API。 |
| v3 Server 全量 / build | 通过 | `HERMES_ACP_TEST_PYTHON=... pnpm --dir server test`：150 个测试文件、730 项通过，包含本地模型桩的真实 ACP 进程测试；`pnpm --dir server build` 通过。仅为行为证据，不作为动态补丁设计合理性的证明。 |
| v2 ACP / 服务定向测试 | 38 / 38 通过 | Hermes router / protocol、共享 Terminal runtime、history / proxy、Ticket / Sprint service 与 catalog 测试。 |
| v2 真实进程协议测试（历史） | 通过 | 当时的协议测试验证了模型桩、Octo 工具回调及审计、越权拒绝、跨进程恢复和取消；此测试现已改写为 v5 原生工具路径，下述历史结果不证明原生 Hermes 文件隔离。 |
| v2 Server 全量测试 / build | 通过 | `pnpm --dir server test`：729 通过、1 跳过（可选原生协议测试已另行启用并通过）；`pnpm --dir server build` 通过。 |
| v2 Extension 测试 / typecheck | 通过 | `pnpm --dir extension typecheck` 通过；全量单独重跑 282 / 282 通过。首次与其他包并行时 3 个 lazy chat 渲染测试未找到元素；隔离 HEAD 同文件 9 / 9 通过、当前全量重跑通过，未修改这些测试或运行逻辑。 |
| v2 FE build | 通过 | `pnpm --dir fe build`；仅 Ticket / Sprint 对话提示文案调整。 |
| 文档与差异 | 通过 | 26 个本地文档链接与代码围栏检查通过，`git diff --check` 通过。 |
| 真实模型 / Ticket / 外部写回 | 生成被阻断 | Ticket 1971 两个 Quick Actions 已真实调用配置模型，均被 401 认证阻断；错误展示与失败持久化已验证。尚无成功答案 / 文档或外部写回证据。 |
| 数据库迁移 / 部署 | 开发库迁移完成；未部署 | `192.168.0.7:18078/tenways_octo_ly_0901` 两个可空元数据字段已存在； scoped 幂等 DDL 已执行及读回，无新增列变化。没有生产或测试服务器发布。 |

## 历史部署与业务验收指引（v2/v3，已失效）

以下只解释旧补丁实现的历史部署要求，不用于 v5 发布；当前步骤以“v5 已确认设计”为准。

1. 在目标节点准备上述 Hermes Python 环境、模型认证以及现有 Support-QA workspace；按 [启动说明](../../../server/scripts/hermes-acp/README.md)执行依赖检查与本地协议测试。
2. 发布时保留整个 `server/scripts/hermes-acp/`（含 `patches/` 和 `upstream/`），准备 `git` 并持久化 Hermes `state.db`，再启动新 Server。单独复制 `dist` 不足以运行此适配器。
3. 选择明确的测试 Ticket，验证 Answer / Document 真正 fetch 审计、草稿、人工作业确认、Server 执行和 readback；另验证一个 Sprint Quick Action 的真实模型输出。结果追加本任务后再关闭验收项。

## 复盘

**v5 真实模型排障复盘：** 协议模型桩通过不能覆盖真实 provider 的认证失败语义。原生 Agent 可能吞掉模型异常并正常结束 RPC，应用必须验证本轮实际产物，并在页面刷新 / 恢复后保留失败状态；相关空结果行为已由回归测试约束，不再新增重复 Learning 规则。端点或密钥错误尚未区分，不能把 401 直接断言为密钥一定过期。

**v5 实施复盘：** 旧 fetch 的“评论”来自记录变更历史过滤，前序设计把命令执行成功误推为材料来源完整。实施时核对脚本及 CLI 契约，补齐源字段提示词，并将评论保持为显式不可用。另发现原生 session/load 的 None 会经 SDK 变成空对象，恢复前改为原生 list 存在性检查。审批失败状态写库异常也必须继续关闭运行时；对应失败路径已补回归测试。

**v5 设计复盘：** 前序将业务权限目标扩大为“全部工具委托 Octo 并复刻执行账本”，使 provider adapter 承担了运行时改造。当前改为按用户确认的原生风险审批语义接入，业务材料验收和会话归属在 Octo 处理。原生命令审批、文件路径边界及业务发布确认分别记录，不能把一项范围放宽推导为其他项自动放开。

以下为 v2/v3 的历史实现复盘，不作为恢复强制工具委托的理由。

**根因：** ACP 消息一致不等于执行位置一致；上游 Hermes 串行工具分支直接调用原生 handler，仅替换单个工具入口会漏掉分发路径。另一方面，取消与 finally 共用 close 时，布尔式幂等标记只能阻止重复启动，不能保证所有调用方等待清理完成。

**处理：** v2 先完整接管工具分发验证调用链；v3 补齐原生工具后端接口，让原生调度继续运行，并在异常时停止执行。将关闭状态改为共享 Promise，并检查真实进程退出后的审计终态。跨任务规则只记录到 Learning Ledger，本任务保存具体证据。

## 关联

- [四方案技术调研参考](../../research/2026-09-05-acp-agent-options.md)
- [现行 ACP 权限与真实执行边界](./2026-08-24-lark-ticket-ai-session-permissions.md)
- [IT Platform Sync](../../tenways-octo/it-platform-sync.md)
- [系统边界规则](../../ai-dev/rules/system-boundaries-and-code-rules.md)
