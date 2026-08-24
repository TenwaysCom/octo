---
status: draft
owner: TBD
last_reviewed: 2026-08-12
scope: Octo 对 Lark Base、Meegle Work Item、GitHub Pull Request 的只读快照同步与演进设计
update_required_when:
  - 同步范围、触发方式或外部平台适配变更
  - 快照表、字段归属、清洗规则或增量游标变更
  - 同步 API、CLI、认证边界或可观测性变更
---

# IT Platform Sync

## 1. 目的与边界

Octo 从 Lark Base、Meegle 与 GitHub 读取指定范围的对象，持久化为 PostgreSQL 快照，供平台数据页、跨平台关联和分析使用。

本设计的边界：

- 同步默认只读外部平台、只写 Octo PostgreSQL；它不是 Lark、Meegle 或 GitHub 的回写通道。
- 外部平台仍是标题、状态、负责人、PR 内容等业务事实的权威来源。
- 创建 Meegle 工作项、更新 Lark Base、创建 GitHub 分支等业务动作属于独立 workflow，不是本同步任务的副作用。
- 不建立通用双向同步或自动状态推进；若未来需要写回，必须另立双向同步设计与冲突策略。

## 2. 当前实现（截至 2026-08-11）

### 2.1 对象、主键与写入方式

| 平台 | 对象 | 快照表 | 外部主键 | 当前写入 |
| --- | --- | --- | --- | --- |
| Lark | Base record / ticket | `lark_base_ticket_syncs` | `base_id + table_id + record_id` | UPSERT |
| Meegle | work item | `meegle_workitem_syncs` | `project_key + work_item_type_key + work_item_id` | UPSERT |
| GitHub | pull request | `github_pr_syncs` | `owner + repo + pull_number` | UPSERT |

每行保存用于展示的字段、原始 JSON 快照、`source_updated_at`、`synced_at`、`last_seen_at` 与 `stale`。重复同步会更新本轮实际拉到的对象并清除其 `stale` 标记；它不会清空表、物理删除本轮未出现的记录，也不会保护写入同一快照列的本地人工修改。

### 2.2 当前触发入口

| 入口 | 用途 | 外部平台写入 | Octo 数据库写入 |
| --- | --- | --- | --- |
| `POST /api/sync/*` | 单条或批量同步 | 否 | 是 |
| `pnpm --dir server platform:sync` | 按本地配置批量同步 | 否 | 是 |
| `pnpm --dir server platform:clean-meegle --apply` | 清洗历史 Meegle 快照 | 否 | 是 |

HTTP 路由如下。所有请求都可携带 `actionRunId`；Base ticket 可指定 `titleFieldName` 与 `statusFieldName`，未指定时才使用候选字段回退。

| 路由 | 作用 |
| --- | --- |
| `POST /api/sync/meegle/workitem` | 同步一条 Meegle work item |
| `POST /api/sync/meegle/workitems` | 批量同步指定 project/type 的 Meegle work item |
| `POST /api/sync/meegle/workitems/selected` | 同步多选 Meegle work item |
| `POST /api/sync/github/pull-request` | 同步一条 GitHub PR |
| `POST /api/sync/github/pull-requests` | 批量同步指定仓库的 GitHub PR |
| `POST /api/sync/github/pull-requests/selected` | 同步多选 GitHub PR |
| `POST /api/sync/lark-base/ticket` | 同步一条 Lark Base record |
| `POST /api/sync/lark-base/tickets` | 批量同步指定 Lark Base table |
| `POST /api/sync/lark-base/tickets/selected` | 同步多选 Lark Base record |

Web Integrations 还提供受 Web 会话保护的同步状态页：展示 Lark Ticket、Meegle User Story、Meegle Tech Task、Meegle Production Bug，以及 GitHub Odoo EU、GitHub Odoo UK、GitHub Odoo US。每个 GitHub 卡片对应一个明确仓库，最近同步时间只从该仓库快照计算，单项同步也只读取该仓库。Web 的单项同步固定为“同步后清洗”：只清洗本次成功写入的快照。服务端从 `platform-sync.local.json` 解析实际 target，并从 HttpOnly Web session 获取 `masterUserId`；浏览器不会接收或传递用户 ID、平台 token、Base/Table ID 或仓库标识；未配置来源在页面明确显示为“未配置”。Web 的 Lark Ticket、Meegle 工作项和 GitHub PR 列表每次最多读取最新 500 条快照。

Web Lark Ticket 列表默认按状态分组并按状态升序排列，提供“进行中”“未分类”“未同步”快速过滤；“进行中”包含状态不是 `Finish`、`Cancelled`、`Rejected` 的 Ticket。列表也支持切换为按 Issue 类型、需求人、负责人、紧急度分组或不分组，并可配置排序字段、排序方向和显示字段。

Web Meegle 工作项列表默认按状态分组，也支持切换为按类型、Sprint、Version、System、负责人分组或不分组，并可配置排序字段、排序方向和显示字段。两类列表的视图配置只保存在当前 Web 会话的页面状态中，不修改同步快照或外部平台数据。

本地 CLI 配置文件为 `server/config/platform-sync.local.json`，只提交 `.example`，不得保存 token。Lark 通过服务端保存的用户凭据读取；本地 Meegle 同步使用本机 `meegle` CLI profile；本地 GitHub 同步使用 `gh` CLI。HTTP GitHub 同步使用服务端 `GITHUB_TOKEN`。

### 2.3 Lark Ticket AI Sessions

Lark Ticket 详情页可基于当前同步快照的标题、描述与资源创建 Kimi ACP AI Session。会话归属保存在 `acp_kimi_session_owners`：每条 Ticket Session 同时绑定 Lark `base_id + table_id + record_id` 与服务端解析出的 Lark 用户身份。它不向 Lark 回写消息或评论。

#### 会话存储边界

`acp_kimi_session_owners` 不是消息表。它只保存 `session_id`、Ticket 与用户归属、标题/时间，以及创建节点的 `runtime_host_name`、`kimi_work_dir`。后两个值仅由 Server 取得（分别为 `os.hostname()` 与传给 Kimi ACP 的工作目录），用于定位实际承载会话的运行节点；已有记录的这两个字段可为空。由快捷动作创建的 Session 还保存 `automation_action_key`、`execution_policy`、`skill_profile`、`skill_id`、`policy_version` 和 Ticket number，作为权限策略快照；旧会话这些字段为空时继续默认拒绝所有敏感 ACP 调用。

#### Support-QA 快捷动作与 ACP 权限

`server/src/modules/public-config/automation-actions.config.ts` 是 automation 的唯一逻辑定义：三个 Lark Ticket 快捷动作分别绑定稳定 `promptKey`、`skillProfile`、`skillId`、`executionPolicy` 和 `requiresConfirmation`。实际环境目录不写入 action，也不返回浏览器；统一由普通 Server 环境变量 `SUPPORT_QA_EU_WORKSPACE_DIR` 提供。该值在 `server/.env.example` 中说明，生产环境通过部署环境变量配置，不新增本地 JSON 配置文件。

| `executionPolicy` | 当前行为 |
| --- | --- |
| `read_only` | 不批准敏感 ACP 工具调用；这是未绑定 action 的默认行为。 |
| `shell` | 仅一次性批准当前 Ticket 的 Support-QA `fetch --json` 包装命令，以及指定 Skill/知识库目录和 `/tmp/support-qa/` 直接子级 JSON 的受限读取。 |
| `write+shell` | 在 `shell` 基础上，仅允许 Support-QA 文档目录写入、`/tmp/support-qa/` 直接子级 JSON 写入及使用该 JSON 的受限 `update` 包装命令。 |
| `full` | 预留给未来的逐次人工确认；当前没有确认桥接时仍拒绝，绝不自动放行。 |

每次 Kimi 发起 ACP `session/request_permission`，Server 都基于 Session 快照重新判断并最多选择 Kimi 提供的 `allow_once` 选项；不会使用 `allow_always`。Shell 命令含控制操作符、路径越出 workspace、动作/Skill/Profile 不匹配，均拒绝。临时 JSON 只允许位于 `/tmp/support-qa/` 第一层，扩展名必须为 `.json`；目录或目标文件是符号链接、文件越过该目录、嵌套子目录或 update 目标不是已有普通文件时均拒绝。此策略是授权拦截层，不替代生产环境的专用运行账号、受限工作目录和最小 Lark CLI 身份。

权限匹配必须兼容 Kimi ACP 的真实 `ToolCallUpdate`：新版 Kimi 可能不提供 `rawInput`，Shell 命令位于严格格式的 text `content`，文件写入目标位于 diff `content.path`；Server 只从这些已知结构提取命令或路径，并同时兼容旧版 `rawInput`。测试必须保留一组真实 Kimi permission shape fixture，不能只用人为构造的 `rawInput` 证明策略可用。

对话正文、思考过程和工具调用由 Kimi CLI 在运行 Server 的机器上持久化，默认目录结构如下：

```text
~/.kimi-code/
├── session_index.jsonl
├── workspaces.json
└── sessions/wd_<workspace-hash>/session_<session-id>/
    ├── agents/main/wire.jsonl   # 对话与 ACP 事件
    ├── state.json               # 会话状态
    └── logs/kimi-code.log       # 可选诊断日志
```

加载历史时，Octo 先根据数据库关联校验会话归属，再连接 Kimi 恢复会话；如果运行期没有重放完整转录，会使用 `kimi export` 读取 `wire.jsonl`，临时导出文件读取后删除。Octo PostgreSQL 不保存上述转录，也不向 Lark 回写 AI 消息或评论。

单实例部署必须持久化该 Kimi 会话目录。多实例部署中，`runtime_host_name` 和 `kimi_work_dir` 只是诊断元数据，不能自动把请求路由回原节点；仍须共享/持久化 Kimi 会话目录、实现按节点路由，或将转录另行写入 Octo 的持久化存储。

| 路由 | 作用 |
| --- | --- |
| `GET /api/web/lark-tickets/:recordId/ai-sessions` | 列出当前 Web 用户在指定 Ticket 下的 AI Sessions |
| `POST /api/web/lark-tickets/:recordId/ai-sessions` | 新建或继续 Kimi ACP 流式对话 |
| `POST /api/web/lark-tickets/:recordId/ai-sessions/:sessionId/load` | 加载一个已归属该 Ticket 的会话历史 |

三个路由都要求有效的 HttpOnly `octo_web_session`；浏览器只提交当前已加载 Ticket 的引用和用户输入，服务端解析用户身份、读取同步快照、校验会话归属并调用 Kimi ACP。浏览器不会接收 `masterUserId` 或 ACP 凭据。详情页按 ACP turn 合并流式 text chunk，并把同一回复的思考过程与工具调用收进可展开区块；无 `messageId` 的事件以用户消息作为新 turn 边界，避免跨轮回复拼接。

### 2.4 当前批量范围与限制

| 平台 | 当前批量读取 | 当前过滤/限制 | 需要注意 |
| --- | --- | --- | --- |
| Lark | 全量初始化为全表分页；增量为源端时间过滤后分页，单页 100 | 全量初始化跳过终态；增量包含终态 | 增量依赖配置的 Bitable 最后修改时间字段 |
| Meegle | 全量初始化按 project/type 枚举；增量以 MQL 时间过滤后分页，再 `+batch-get` 详情 | 全量初始化跳过终态；增量包含终态 | 每个 type 必须配置 MQL 时间字段；详情时间才是 checkpoint 权威值 |
| GitHub HTTP | 读取 open PR | 跳过终态 | 只能覆盖开放 PR |
| GitHub CLI | `all` 依次读取 `closed` 与 `merged`，每类最多 100 | `closed` 结果会排除已合并 PR | 当前 `all` 不包含 open；命名与范围需在新版设计中统一 |

当前没有 scheduler 或 webhook 消费器。GitHub、Lark 和 Meegle CLI 均支持按 checkpoint 的源端增量拉取；Meegle 依赖每个 work item type 的 MQL 时间字段配置。

## 3. 代码与运行入口

| 层级 | 文件 | 职责 |
| --- | --- | --- |
| HTTP | `server/src/index.ts`、`server/src/modules/platform-sync/*` | 路由、DTO 校验、结构化响应 |
| Service | `server/src/application/services/platform-sync.service.ts` | Lark/Meegle/GitHub 单条、多选、批量编排；终态过滤与三平台清洗 |
| Store | `server/src/adapters/postgres/platform-sync-store.ts` | 三类快照 UPSERT、失联标记、清洗输入读取与清洗字段更新 |
| Run audit | `server/src/adapters/postgres/platform-sync-run-store.ts` | scope 级运行开始、成功/失败、计数与安全错误摘要 |
| Schema | `server/src/adapters/postgres/database.ts`、`schema.ts` | 表和索引 |
| CLI | `server/src/scripts/platform-sync.ts` | 本地配置、平台顺序、`gh` 调用与运行结果 |
| Meegle 历史清洗 | `server/src/scripts/clean-meegle-sync-snapshots.ts` | 项目 `4c3fv6` 的既有快照批量清洗；只写 `meegle_workitem_syncs` |

常用命令：

```bash
# 首次创建本地 scope 配置；此文件被 Git 忽略
cp server/config/platform-sync.local.json.example server/config/platform-sync.local.json

# 按本地配置依次运行三个平台
pnpm --dir server platform:sync

# 仅运行一个平台
pnpm --dir server platform:sync --only lark --user-id USER_ID
pnpm --dir server platform:sync --only meegle --user-id USER_ID
pnpm --dir server platform:sync --only github

# Meegle 历史快照：先预览，再明确写入同步表清洗字段
pnpm --dir server platform:clean-meegle
pnpm --dir server platform:clean-meegle --apply

# GitHub PR 与 Lark Ticket 历史快照：先预览，再写入对应同步表清洗字段
pnpm --dir server platform:clean-history
pnpm --dir server platform:clean-history --apply

# 修复历史 Lark ticket title：仅从已有 fields_json 读取 Issue Description，不访问源端
pnpm --dir server platform:backfill-lark-ticket-titles
pnpm --dir server platform:backfill-lark-ticket-titles --apply

# 回填历史 Ticket AI：仅从已有 Lark 同步快照读取 AI 字段，写入 Octo 本地表，不访问源端
pnpm --dir server platform:backfill-lark-ticket-ai
pnpm --dir server platform:backfill-lark-ticket-ai --apply

# 从已有 GitHub/Meegle 快照回填缺失的增量 checkpoint：先预览，再写入
pnpm --dir server platform:init-checkpoints
pnpm --dir server platform:init-checkpoints --apply

# GitHub 真增量：scope 必须已存在 checkpoint；同步后默认清洗本轮 PR
pnpm --dir server platform:sync --only github --mode incremental --scope TWS-lance/odoo_tenways
```

本地配置只包含同步目标，例如：

```json
{
  "meegle": [{ "projectKey": "PROJECT_KEY", "workItemTypeKeys": ["TYPE_KEY"] }],
  "github": [{ "owner": "OWNER", "repo": "REPO" }],
  "larkBase": [{
    "baseId": "BASE_ID",
    "tableId": "TABLE_ID",
    "titleFieldName": "Issue Description",
    "sourceUpdatedAtFieldName": "最后更新时间"
  }]
}
```

Meegle 的本进程读取限流由 `MEEGLE_MIN_REQUEST_INTERVAL_MS` 控制，HTTP 429 的重试次数由 `MEEGLE_RATE_LIMIT_RETRY_COUNT` 控制。`Commercial Usage Exceeded` 是调用额度耗尽，不应按短时频率限制自动重试。

## 4. 数据归属与写入规则（目标设计）

### 4.1 平台快照表：只保存源端事实

`github_pr_syncs`、`meegle_workitem_syncs`、`lark_base_ticket_syncs` 是平台同步的原始记录和源端变更记录。它们保存外部对象的最新快照、源端更新时间和原始 payload。

Octo 不得把自身业务数据、人工备注、AI 结果或本地状态写入这三张表，更不会通过同步把它们写回外部平台。同步程序对平台表唯一允许的本地写入是：

1. 将外部平台读取结果 UPSERT 为最新源端快照；
2. 保存同步元数据，例如 `synced_at`、`source_updated_at`、`source_hash`、`last_seen_at`；
3. 读取平台表作为清洗输入。

这里的“源端修改记录”指源端对象的最新修改状态；当前实现不是完整的版本历史。若要保存每次源端变更的审计历史，应另加 append-only history 表，不能复用快照表。

### 4.2 Octo 自有表：独立维护、与源端一对一关联

Octo 需要维护的数据一律放入对应的 `_octo` 表。每张表以同一组外部主键关联其平台快照，只保存 Octo 自有的关联结果、AI 结果、人工备注和本地业务状态；不得保存从 `*_syncs` 复制出的平台字段或清洗结果。

| 平台快照表 | Octo 自有表 | 关联键 |
| --- | --- | --- |
| `github_pr_syncs` | `github_pr_octo` | `owner + repo + pull_number` |
| `meegle_workitem_syncs` | `meegle_workitem_octo` | `project_key + work_item_type_key + work_item_id` |
| `lark_base_ticket_syncs` | `lark_base_ticket_octo` | `base_id + table_id + record_id` |

`*_octo` 以复合主键与来源对象一对一关联，但只在 Octo 首次拥有本地数据时创建；本地字段与审计字段不能回写快照表。`lark_base_ticket_octo.shared_url` 是本地缓存：Server 显式取得或从旧快照迁移的 Ticket 详情共享链接会保存在这里，增量同步缺少该字段时不得将其清空。Ticket 详情页发现链接缺失时，会以当前 Web 会话的 Lark 用户授权调用 `batch_get(with_shared_url)` 按需补全，并只写入该本地字段。

`lark_base_ticket_octo.ticket_ai` 是唯一的 Ticket AI 写入入口，保存允许同步的 AI 字段和 Octo 写入时间。历史回填只从 `lark_base_ticket_syncs.fields_json` 提取这些字段，绝不修改 Lark。Support-QA Agent 产生新结果时只写入 `ticket_ai`；Web 和 CLI Lark Ticket 同步始终只读 Lark，不会反写任何 AI 字段。

Support-QA Agent 通过 `POST /api/internal/lark-ticket-ai` 更新该字段，不允许直连 Octo 数据库。接口复用 `server/src/http/internal-signed-request-auth.ts`：调用方只需声明 SSH namespace、预期 HTTP 方法/路径、请求头前缀、CIDR 和按 SSH 公钥指纹查找绑定用户公钥的函数。Ticket AI 实例只接受来自 `OCTO_TICKET_AI_ALLOWED_CIDRS` 的直接 TCP 来源（不信任 `X-Forwarded-For`），并要求请求体 SHA-256、时间戳和唯一 request id 由数据库 `user_ssh_public_keys` 中的 SSH 公钥签名。调用方**不传内部 id 或用户 ID**：服务端从 SSHSIG 内嵌的公钥计算 OpenSSH `SHA256:` 指纹，以该指纹找到用户绑定的活跃公钥，并用该公钥验证签名。`id` 仅是服务端生成的内部主键；`public_key_fingerprint` 是唯一认证索引，且 `master_user_id` 绑定 `users.id`。只有密钥和用户状态都为 `active` 时才会校验；五分钟内拒绝同一指纹/request id 重放。CIDR 或用户密钥绑定缺失时接口 fail closed。它只更新 allow-list 内的 AI 字段，绝不调用 Lark Base API。

`Integrations > SSH Key` 通过有效的 HttpOnly Web session 提供当前用户的公钥列表和新增操作；浏览器只提交单行公钥、可选 `label` 与 `actionRunId`，不能传入 `master_user_id`、内部 `id` 或任何私钥。`label` 仅用于用户识别密钥来源（如办公电脑、CI），不参与认证。服务端从 session 取得用户归属，计算公钥 `SHA256:` 指纹，并以数据库唯一索引做全局查重；重复绑定返回 `409 SSH_PUBLIC_KEY_ALREADY_REGISTERED`，不会泄露现有绑定人。该接口不允许匿名或替其他用户录入。`id` 为服务器生成的内部主键，数据库仍是授权来源。

录入前可用 `ssh-keygen -lf /secure/path/user-key.pub -E sha256` 核对输出中的 `SHA256:...` 指纹。建议每个用户使用独立 key；轮换时先从页面新增新 key，再由受控运维流程将旧 key 的 `status` 改为 `revoked`。下面 SQL 仅用于历史迁移、故障修复或撤销，不用于常规用户新增：

```sql
INSERT INTO user_ssh_public_keys (
  id, master_user_id, public_key, public_key_fingerprint, status, created_at, updated_at
) VALUES (
  'support-qa', 'usr_xxx', 'ssh-ed25519 AAAA... user@host', 'SHA256:...', 'active', now()::text, now()::text
);
```

展示或分析时：平台表提供源端事实，`*_octo` 表提供 Octo 自有数据；二者按外部主键关联。平台同步不会覆盖 `_octo` 表。

## 5. 目标增量数据处理

### 5.1 统一处理模式

三个平台都必须支持同一组处理模式：

| 模式 | 输入 | 处理范围 |
| --- | --- | --- |
| 单个更新 | 一个外部对象键 | 拉取一个对象，写入一个平台快照，按开关清洗该对象 |
| 多选更新 | 一组外部对象键 | 拉取选中的对象，逐项 UPSERT，按开关清洗成功对象 |
| full 批量 | 配置中的一个或多个 scope | 历史初始化；列举范围内对象、UPSERT，并清洗成功对象 |
| 增量批量 | 一个 scope | 从 checkpoint 起拉取变更对象，批量 UPSERT，并清洗变更对象 |
| 独立清洗 | 配置中的一个或多个 scope | 不访问源端，只从 `*_syncs` 快照重算清洗投影 |

HTTP 单个/多选接口保留可选的 `cleanAfterSync`。Web「立即同步」和 CLI incremental 固定为“同步后清洗”；Web 不会因为没有 checkpoint 而静默降级为全量。`--clean-after-sync` 只为兼容旧命令而保留。

```text
CLI full / incremental  同步成功后，对本次成功写入的对象执行对应平台清洗
CLI clean               不同步，只清洗配置 scope 内已有快照
```

清洗失败不得回滚已经成功的源端快照。清洗按对象隔离：一个对象的投影写入失败时，记录该对象的安全错误摘要并继续处理其余对象；本 scope 全部对象尝试完成后才汇总失败。只要存在清洗失败，该 scope 仍标记为失败、checkpoint 不推进，以便下次从旧水位幂等重试。

### 5.2 增量同步算法

1. 读取 scope 的 checkpoint。
2. 使用 `watermark_updated_at - overlap` 拉取；默认重叠窗口建议 5 分钟。
3. 按 `source_updated_at + 外部 ID` 稳定排序和分页；当前没有 `source_hash`，无可靠源端时间时必须拒绝推进 checkpoint。
4. 将增量候选对象 UPSERT 到平台快照表，并更新其 `last_seen_at`、清除 `stale`。基于 hash 的未变化跳写仍待实现。
5. CLI 同步默认将本次同步成功对象传给对应平台的清洗函数，更新对应 `*_syncs` 表的清洗字段；`--mode clean` 只清洗已有快照，不读取源端。
6. 所有枚举、快照写入和清洗成功后推进**该 scope** 的 checkpoint；任一对象清洗失败会使该 scope 不推进。一个 scope 失败不会中断同一命令后续 scope；命令会输出每个 scope 的结果并以非零状态退出。当前没有跨整轮的数据库事务。
7. 仅当 full scope 的完整枚举和清洗都成功后，才把本次运行开始前仍未被重新看见的快照标为 `stale`；不直接物理删除。增量同步与单条/多选同步不做删除识别，因为它们不能证明源端集合完整。GitHub 仅在 `--github-pr-state all` 的 closed 与 merged 两段均成功后才标记失联记录。
8. 读取范围必须包含终态变更。仅同步活跃对象会遗漏“活跃 -> 已关闭/已完成”的状态转换。

首次同步是 scope 内全量初始化；其后使用增量读取并保留周期性全量校验，以处理 webhook 漏失、权限变化和删除。

### 5.3 运行元数据

同步控制数据不是业务数据，可独立存放：

```text
platform_sync_checkpoints
- platform, scope_key                              # 唯一键
- watermark_updated_at, watermark_tiebreaker
- last_success_at, last_error, updated_at

platform_sync_runs
- run_id, platform, scope_key, mode, clean_after_sync
- started_at, completed_at, listed, skipped_inactive, synced, cleaned, stale
- failed, error_message
```

当前已实现 `platform_sync_checkpoints`、`platform_sync_runs`、`last_seen_at` 与 `stale`。CLI 的 full、incremental、clean 每个 scope 都会落一条运行审计；full 完整成功时才执行失联标记。`source_hash` 仍未实现。`platform:init-checkpoints` 只从 GitHub/Meegle 既有快照建立水位：GitHub scope 为 `owner/repo`，Meegle 为 `project_key`。Lark 不从历史快照派生 checkpoint，必须使用 5.4 的 reset 命令切换到新的源端最后修改时间语义。若 GitHub/Meegle scope 任一历史快照缺少 `source_updated_at`，不写 watermark，并在 `last_error` 标记为“首次增量前必须全量同步”；这避免以本地 `synced_at` 冒充源端更新时间而漏数据。

### 5.3.1 Web「立即同步」

Web 页面上的「立即同步」就是增量同步，不执行 full 初始化：读取相同 scope 的 checkpoint，源端过滤、UPSERT、清洗成功后才推进水位；失败会保留旧水位并写入 `last_error`。没有安全 watermark 时接口返回 `409 SYNC_CHECKPOINT_REQUIRED`，页面应提示先完成历史初始化，不能改为扫描全量。

| Web 卡片 | checkpoint scope | 实际增量范围 |
| --- | --- | --- |
| Lark Ticket | `baseId/tableId` | 该 Base 表中 `最后修改时间` 在水位后的记录 |
| Meegle 任一类型卡片 | `projectKey` | 该项目配置的**全部** work item types；这是为了避免单卡片推进项目共享水位后遗漏其他类型 |
| GitHub repository | `owner/repo` | 该仓库 `updated_at` 在水位后的全部 PR（含 open、closed、merged） |

Web Meegle 使用服务器上的 `meegle workitem query --mql` 与 `+batch-get`，而不是 HTTP `filterWorkitems`：后者不支持 `source_updated_at` 过滤。Web GitHub 使用 REST Search `updated:>=` 后再逐条读取 PR 详情。三种 Web 增量均默认清洗本轮成功快照。

### 5.4 Lark 历史时间回填（不用于增量）

历史 Lark 快照早期没有保存 API 的 `updated_time`。对于**已经存在且 `source_updated_at` 为空**的记录，使用原始 `fields_json` 中的精确字段 `状态记录时间`（毫秒时间戳）一次性回填；不改变原始 payload、`synced_at` 或任何 `*_octo` 表。先预览，再显式执行：

```bash
pnpm --dir server platform:backfill-lark-source-time
pnpm --dir server platform:backfill-lark-source-time --apply
```

该历史命令不再初始化 Lark checkpoint。`状态记录时间` 与“最后修改时间”语义不同，不能用作增量水位。

**新同步记录不使用这个历史回退。** Lark adapter 将 Bitable record 的 `last_modified_time`（兼容旧响应中的 `updated_time`）规范化为 ISO UTC 后写入 `source_updated_at`；API 未返回该值时保持为空并报告为无法建立安全增量水位，不能改用本地 `synced_at` 或 `状态记录时间`。

历史快照不参与 Lark 增量时，先显式切换 checkpoint 到当前时刻前 5 分钟，再开始增量同步：

```bash
pnpm --dir server platform:reset-lark-incremental --scope BASE_ID/TABLE_ID
pnpm --dir server platform:reset-lark-incremental --scope BASE_ID/TABLE_ID --apply
pnpm --dir server platform:sync --only lark --mode incremental
```

`--apply` 会覆盖该 Lark scope 的旧 checkpoint，但不改动任何历史快照；5 分钟重叠用于覆盖切换期间发生的源端修改。首次增量仍会拒绝缺少 `last_modified_time` 的源端记录。

### 5.5 GitHub 增量同步 CLI

GitHub 使用源端 `updated_at` 筛选。GitHub 增量不依赖 `platform-sync.local.json`，而是直接由 `--scope` 指定一个已建立 checkpoint 的仓库。所有同步模式默认清洗成功写入的快照。

```bash
pnpm --dir server platform:sync \
  --only github \
  --mode incremental \
  --scope OWNER/REPO
```

例如同步并清洗 US Odoo 仓库：

```bash
pnpm --dir server platform:sync \
  --only github \
  --mode incremental \
  --scope TWS-lance/odoo_tenways
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--only github` | 是 | 本节 GitHub 增量必须指定；Lark、Meegle 增量见 5.6。 |
| `--mode incremental` | 是 | 明确使用 checkpoint，而非旧的配置式批量枚举。 |
| `--scope OWNER/REPO` | 是 | 与 `platform_sync_checkpoints.scope_key` 完全一致；格式必须是 `owner/repo`。 |
| `--clean-after-sync` | 否 | 兼容参数；同步默认已清洗本轮成功写入的快照。 |
| `--github-pr-limit N` | 否 | 本轮最大候选数，默认 `100`，上限 `1000`。达到该数时命令失败且不推进 checkpoint；调大后重跑。 |

前置条件：该仓库必须已经有 `platform='github'` 的 checkpoint，且 `watermark_updated_at` 与 `watermark_tiebreaker` 均非空。对历史快照执行过 `platform:init-checkpoints --only github --apply` 后通常即可满足；若历史数据缺少源端更新时间，必须先做一次完整的 GitHub 同步，不能以本地 `synced_at` 作为增量起点。

执行顺序：

1. 读取 `OWNER/REPO` 的 checkpoint，并将 `watermark_updated_at` 回退 5 分钟作为 GitHub 查询起点。
2. 查询 open、closed、merged PR，逐条读取 PR 详情；因此终态变更也会被纳入。
3. 对本轮变更 PR UPSERT 到 `github_pr_syncs`，随后仅清洗这些成功写入的 PR。
4. 所有详情读取、快照写入和可选清洗均成功后，按最大的 `updated_at + zero-padded pull_number` 推进 checkpoint，并清除 `last_error`。

失败时不会推进 `watermark_updated_at`：找不到 checkpoint、checkpoint 没有安全水位、GitHub 请求失败、PR 详情没有有效 `updated_at`，以及查询结果达到 `--github-pr-limit` 都会写入 `last_error` 后退出。已成功写入的快照不会回滚；下次会以旧水位加 5 分钟重试，因此 UPSERT 与清洗必须保持幂等。

### 5.6 Lark 与 Meegle 增量同步

现有 bulk sync 仅用于历史初始化，并保留其活跃状态筛选。增量命令不复用该筛选：终态记录同样会 UPSERT；每个 scope 扫描与清洗全部成功才推进自己的 checkpoint。多个 Lark Base 或 Meegle project scope 时，前一个 scope 失败会写入其 `last_error`，但不会阻断后续 scope；命令结束后整体以非零状态退出。

```bash
pnpm --dir server platform:sync --only lark --mode incremental
pnpm --dir server platform:sync --only meegle --mode incremental

# 只同步一个已配置的 Meegle work item type（例如 Tech Task）
pnpm --dir server platform:sync --only meegle --mode incremental \
  --meegle-work-item-type 66700acbf297a8f821b4b860
```

Lark 增量先将 checkpoint 回退 5 分钟，再使用配置中 `sourceUpdatedAtFieldName` 生成 Bitable `filter`，**由源端筛选后再分页**。默认字段名是 `最后更新时间`；它必须是覆盖所有已同步业务字段的 Bitable「最后修改时间」字段。随后 adapter 同时请求 Bitable 自动字段，并以 record 的 `last_modified_time`（兼容旧响应 `updated_time`）进行本地复核和推进水位。字段名配置错误、源端拒绝筛选公式、或任何返回记录没有最后修改时间时，命令失败且不推进 checkpoint。

```json
{
  "larkBase": [{
    "baseId": "BASE_ID",
    "tableId": "TABLE_ID",
    "sourceUpdatedAtFieldName": "最后更新时间"
  }]
}
```

Meegle 增量同样回退 checkpoint 5 分钟，但执行分为两层：先用 `meegle workitem query --mql` 对每个 work item type 的配置字段执行 `WHERE / ORDER BY / LIMIT`；再只对候选 ID 分批（50 条）执行 `meegle workitem +batch-get`。普通类型以 MQL 返回的 `updated_at` 作为源端时间：该字段在真实 `+batch-get` 详情中会缺失。Production Bug 则以详情 `work_item_attribute.update_time` 为唯一权威时间。

`sourceUpdatedAtMqlFieldNames` 必须为配置中的每个 type 指定可在 MQL 中查询的时间字段 key（从该 type 的元数据 `field_key` 取得，不是页面显示名）；缺少映射、MQL 返回时间为空、或 `+batch-get` 详情缺少规范源端时间，命令失败且不推进 checkpoint。例如：

```json
{
  "meegle": [{
    "projectKey": "PROJECT_KEY",
    "workItemTypeKeys": ["story", "PRODUCTION_BUG_TYPE_KEY"],
    "sourceUpdatedAtMqlFieldNames": {
      "story": "updated_at",
      "PRODUCTION_BUG_TYPE_KEY": "updated_at"
    }
  }]
}
```

即使两个类型在页面上都显示为“更新时间”，也必须分别配置各自的 MQL 字段 key；Production Bug 的最终水位仍来自其专用 `update_time`。

### 5.7 独立清洗 CLI

`--mode clean` 不读取任何外部平台，只针对本地 `*_syncs` 表中配置的 scope 重算清洗投影。可用于补跑历史数据或修复清洗规则后回填：

```bash
pnpm --dir server platform:sync --mode clean
pnpm --dir server platform:sync --mode clean --only github
pnpm --dir server platform:sync --mode clean --only meegle
pnpm --dir server platform:sync --mode clean --only lark
```

## 6. 三平台适配要求

### 6.1 Lark Base

- scope 为 `baseId + tableId`，可选 view 作为额外范围。
- 增量使用配置的 Bitable「最后修改时间」字段生成 `filter`，再以 record 的 `last_modified_time`（兼容旧响应 `updated_time`）作为候选源版本和 checkpoint 水位；两者都必须反映全部已同步业务字段的修改。
- 过滤公式由 adapter 作为 URL 查询参数编码；5 分钟重叠与本地时间复核防止分页边界、时钟精度和相同时间戳导致遗漏。hash 跳过未变化写入仍待实现。
- 标题、状态字段由配置指定；未配置时只使用明确的候选字段回退，不猜测业务字段。
- 权限丢失、记录删除、view 过滤变化只能标记失效，不能立即删除历史快照。

### 6.2 Meegle Work Item

- checkpoint scope 为 `projectKey/workItemTypeKey`；User Story、Tech Task 与 Production Bug 分别维护和使用自己的水位。新增类型只需初始化该类型的 checkpoint，不得复用旧项目级 checkpoint。
- 先读取类型/状态元数据，再读取 work item；动态 `field_*` 只可位于 metadata resolver 或明确的兼容映射层。
- 增量先按 `sourceUpdatedAtMqlFieldNames[workItemTypeKey]` 的 MQL 字段 key 筛选、排序、分页，再分批读取 `+batch-get` 详情。普通 Meegle work item 使用 MQL `updated_at`（详情未返回该字段）；Production Bug（由 `MEEGLE_WORKITEM_TYPE_KEY_PROD_BUG` 配置）使用 `fields.work_item_attribute.update_time`。adapter 将秒/毫秒时间戳规范化为 ISO UTC 后写入 `source_updated_at`；缺失时保持为空，不能用 `synced_at` 或其他业务字段补齐。
- 对历史空值可先预览、再回填并初始化空 checkpoint：`pnpm --dir server platform:backfill-meegle-source-time`，确认后追加 `--apply`。
- 已有历史快照升级到类型级 checkpoint 后，执行 `pnpm --dir server platform:init-checkpoints --only meegle --apply` 创建缺失的 `projectKey/workItemTypeKey` 记录；旧项目级 checkpoint 保留但不再读取。
- 若历史快照未返回 `updated_at`，该 project 的 checkpoint 仍不可作为安全增量水位；必须通过源端详情补拉取得 `updated_at` 后才可初始化。
- 详情补拉应只针对增量候选对象，并保留限流、429 重试和商业额度错误的区分。
- Sprint、Version、System、Bug 等展示关联字段属于清洗/投影层，不能覆盖原始源端 payload；现有 `field_*` 兼容映射集中在 `server/src/application/services/meegle-cleaning.config.ts`。

### 6.3 GitHub Pull Request

- scope 为 `owner + repo`。
- 范围必须明确包含 `open`、`closed`、`merged`；新版设计不得以含义不完整的 `all` 命名掩盖范围。
- 使用 PR `updated_at` 作为主增量版本，并在相同时间戳下使用 PR number 作为并列游标。
- 每个候选 PR 拉取详情后保存 `merged_at`、分支、描述和 Meegle ID 关联；`merged_at` 非空时展示状态规范化为 `merged`。
- 处理分页上限、归档 PR 的回补以及状态转换，不得只依赖当前 open 列表。

## 7. 清洗设计

清洗逻辑统一收敛到 `server/src/application/services/platform-sync.service.ts`。CLI 同步完成后必定调用每个平台独立的函数；`--mode clean` 复用同一组函数，不再读取外部平台。

```text
syncMeegle...  -> cleanMeegleWorkitems(...)
syncGitHub...  -> cleanGitHubPullRequests(...)
syncLark...    -> cleanLarkBaseTickets(...)
```

清洗函数规则：

- 只读取对应的 `*_syncs` 平台快照表。
- 只写入对应 `*_syncs` 表的专用清洗列；不得改写原始 `payload_json` 或覆盖未经清洗的源端字段。
- 接受单个对象键或对象键列表，因此与单个更新、多选更新、增量批量共用。
- 比较目标清洗列与本轮计算结果，未变化时跳过更新，支持幂等重跑。
- 当前实现中，清洗错误会使当前 platform/scope 命令失败；增量模式不会推进 checkpoint。逐条容错并汇总失败对象是待实现优化，不能作为当前行为假设。

`clean-meegle-sync-snapshots.ts` 仅保留为项目 `4c3fv6` 的旧历史清洗入口；日常使用 `pnpm --dir server platform:sync --mode clean --only meegle`。两者都只更新 `meegle_workitem_syncs` 的清洗字段，保留原始 payload。

三平台清洗的初始职责：

| 平台 | 清洗输入 | 写入 `*_syncs` 表的清洗内容 |
| --- | --- | --- |
| Lark | 标题、状态、共享链接、创建/更新时间与原始字段 JSON | 基础展示投影，以及 Ticket 编号、Issue 类型、需求人、负责人、紧急度、创建时间、详情描述、Meegle 链接、Lark 消息链接；需求人读取 Lark 字段 `需求人`，紧急度只读取 Lark 字段 `紧急度` |
| Meegle | 标题、类型/状态、子阶段、Sprint、Version、System、Bug、负责人 | 基础展示投影 |
| GitHub | PR 标题、状态、分支、Meegle ID、作者、合并人、requested reviewers、labels、创建时间 | 基础展示投影；合并人只读取 GitHub `merged_by.login`，`reviewers` 表示当前请求评审人，不推断已完成评审人 |

## 8. 认证、安全与可观测性

- 浏览器永不向 server 发送原始 cookie；授权码只能一次性使用。
- token 只保存在 server 受保护的存储中；本地 JSON 配置不得包含 token、cookie、密码或私钥。
- 当前 CLI 输出 `listed`、`skipped_inactive`、`synced`、`cleaned` 与失败摘要，不记录原始敏感 payload。
- `run_id`、`changed`/`unchanged`、`stale`、耗时持久化和统一安全错误码仍待实现。
- 失败重试、速率限制、认证过期与权限拒绝必须使用可区分的错误码。

## 9. API、CLI 与调度

- HTTP 接口使用 DTO 校验和 `{ ok, data, error }` 结构，提供单个、多选、批量同步和可选 `cleanAfterSync`；Web 平台同步卡片已接入基于 checkpoint 的增量模式。Web 运行审计 `platform_sync_runs` 仍待接入。
- CLI 保留 `--only`、`--user-id`、`--config`，并提供 `--mode full|incremental|clean`：full/incremental 默认同步加清洗；clean 只清洗本地快照。GitHub incremental 额外要求 `--scope owner/repo`；Meegle incremental 可选 `--meegle-work-item-type TYPE_KEY` 只运行该类型的独立 scope；clean mode 不接受 `--scope`。
- 定时任务应调用与 CLI/HTTP 相同的 service，而非复制平台请求逻辑。
- full 与 CLI incremental 模式均隔离各配置 target；某一 target/scope 失败后仍会继续其它 target。Web Lark 多 scope 同步会并行执行，每个 scope 独立记录 checkpoint 失败；失败 scope 不得推进自身 checkpoint。

## 10. 迁移、测试与验收

实施顺序：

1. 已完成：建立三个 `_octo` 表及一对一复合键；清洗结果只保存在同步表。
2. 已完成：将 `cleanMeegleWorkitems`、`cleanGitHubPullRequests`、`cleanLarkBaseTickets` 收敛到 `PlatformSyncService`，并由 `cleanAfterSync` 触发。
3. 已完成 HTTP：三个平台均有单个、多选、批量 DTO/API；Web 立即同步已使用 checkpoint 增量读取并默认清洗，运行审计仍待补齐。
4. 已完成：建立 checkpoint schema，并接入三平台的 CLI 增量代码路径；GitHub/Meegle 可从历史快照初始化 checkpoint，Lark 必须使用显式 reset 命令建立新的增量起点。Meegle 按 `projectKey/workItemTypeKey` 初始化三类独立 checkpoint；旧项目级 checkpoint 不再使用。GitHub 已完成本地测试，Lark 依赖源端返回 `last_modified_time`，Meegle 仍待真实授权环境验证。
5. 已完成：CLI full/incremental 默认清洗，`--mode clean` 支持在不访问源端的情况下重算已配置 scope 的本地清洗投影。
6. 待完成：run 审计、hash/seen/stale 元数据、scheduler/webhook 与周期性全量校验。

验收至少覆盖：

- 重复运行不改写未变化快照。
- 源端变更、终态变更、删除/权限丢失均可最终反映。
- `_octo` 表只包含 Octo 本地数据，平台清洗字段只存在于 `*_syncs` 表。
- 单个、多选与增量批量三种模式的同步/清洗结果可独立追踪。
- 中断、分页失败和重试不会漏数据或错误推进 checkpoint。
- 三个平台均有真实授权环境的端到端读取验证；mock 测试不作为外部平台连通性证明。

## 11. 待决策项

- Lark Base 与 Meegle 的更新时间筛选、排序和 webhook 能力。
- GitHub 使用 REST、GraphQL、CLI 还是 webhook 作为主要增量通道。
- 每个 scope 的频率、重叠窗口、全量校验周期与保留时长。
- 三张 `_octo` 表的首批字段、清洗版本策略与本地数据权限。
- `stale`、删除和权限丢失的展示与人工确认规则。
