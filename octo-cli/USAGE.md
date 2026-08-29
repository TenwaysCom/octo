# octo-cli 使用说明

`octo-cli` 是供本地 Agent 使用的只读命令行工具。它只访问 Octo Server 的 Agent API；不读取浏览器 Cookie，也不保存 Lark、Meegle、GitHub 或 Odoo 的平台凭证。

## Agent 使用顺序

Agent 应按以下顺序工作：

```text
skills list/read → schema → doctor → 任务命令 → JSON ok/error 判断
```

```bash
octo-cli skills list
octo-cli skills read octo-sprint-data
octo-cli schema sprint.tasks
octo-cli doctor --offline
```

除非用户明确要求切换，Agent 不应修改或删除 Profile。当前所有数据命令均为 `read`；CLI 不提供任意 HTTP、直接平台调用、任意 SQL 或 Odoo 表浏览。

## 1. 安装与构建

在 Octo 仓库根目录执行：

```bash
pnpm --dir octo-cli install
pnpm --dir octo-cli build
```

开发环境可用以下方式运行：

```bash
node octo-cli/dist/src/index.js --help
```

发布为 npm 包后可直接使用 `octo-cli` 命令。下文示例均使用该命令名。

## 2. 配置真实 Octo 服务

真实查询需要 Octo Server 提供 bearer-authenticated Agent API 和一个最小权限的 agent token：

```bash
octo-cli config set \
  --server-url https://octo.example \
  --api-token <agent-token>
```

配置默认保存在 `~/.octo-cli/config.json`。也可以只为一次命令设置环境变量；环境变量优先于配置文件：

```bash
OCTO_SERVER_URL=https://octo.example \
OCTO_API_TOKEN=<agent-token> \
octo-cli sprint tasks --project-key <project-key> --sprint-id <sprint-id>
```

检查当前配置时，token 会被隐藏：

```bash
octo-cli config show
```

### Profiles

同一台机器需要连接多个 Octo 环境时，为每个环境创建一个命名 Profile：

```bash
octo-cli profile add --name test --server-url https://octo-test.example --api-token <test-token>
octo-cli profile add --name prod --server-url https://octo.example --api-token <prod-token>
octo-cli profile use --name test
octo-cli profile list
```

`profile use` 会切换默认 Profile。单条命令可用 `--profile <name>` 或 `OCTO_CLI_PROFILE=<name>` 覆盖它；切换或删除 Profile 是本地状态变更，应由操作者显式执行。

对生产 Profile 可开启严格主机绑定：

```bash
octo-cli profile strict-mode on --name prod
octo-cli profile strict-mode --name prod
```

严格模式会拒绝 `OCTO_SERVER_URL` 将请求导向与该 Profile 配置不同的服务器。关闭时使用 `octo-cli profile strict-mode off --name prod`。服务地址必须为 HTTPS；仅 `localhost`、`127.0.0.1` 和 `::1` 可用于本地 demo 的 HTTP 地址。URL 不能包含凭据、路径、查询参数或 fragment。

> 当前仓库中的真实 Agent API 仍在迁移计划中。若服务端尚未部署 `/api/agent/v1` 和 token middleware，真实查询会失败；可先按第 5 节运行本地 demo。

## 3. 查询命令

| 场景 | 命令 | 所需服务端 API |
| --- | --- | --- |
| Sprint 燃尽数据 | `octo-cli sprint burndown --project-key <key> --sprint-id <id>` | `GET /api/agent/v1/projects/:projectKey/sprints/:sprintId/burndown` |
| Sprint 任务状态 | `octo-cli sprint tasks --project-key <key> --sprint-id <id>` | `GET /api/agent/v1/projects/:projectKey/sprints/:sprintId/tasks` |
| GitHub PR 关联的 Meegle 信息 | `octo-cli github pr --owner <owner> --repo <repo> --number <number>` | `GET /api/agent/v1/github/pull-requests/:owner/:repo/:number` |
| Lark Ticket 当前快照 | `octo-cli lark ticket --base-id <id> --table-id <id> --record-id <id>` | `GET /api/agent/v1/lark-tickets/:baseId/:tableId/:recordId` |
| Odoo DevOps 分支和构建状态 | `octo-cli odoo branches --environment <eu\|uk\|us>` | `GET /api/agent/v1/odoo/branches?environment=:environment` |

响应均为 JSON，并由 CLI 统一包装：

```json
{ "ok": true, "data": { "...": "..." }, "meta": { "profile": "default" } }
```

命令失败时，CLI 向 stderr 输出 `{ "ok": false, "error": { "errorCode", "errorMessage" } }` 并以非零退出码结束。Agent 必须用 `ok == true` 或退出码判断成功，不得把 `SNAPSHOT_NOT_FOUND` 当作外部平台记录不存在的证明。

## 4. Odoo 数据边界

`odoo branches` 查询的是 Octo 服务端持有的 Odoo DevOps 分支/构建状态投影，不是 Odoo 业务数据库查询。

EU、UK、US 的只读 PostgreSQL 数据库连接仅保存在 Octo Server 的环境变量中：

```bash
ODOO_READONLY_DATABASE_URL_EU=...
ODOO_READONLY_DATABASE_URL_UK=...
ODOO_READONLY_DATABASE_URL_US=...
```

这些 URL 和密码绝不能写入 CLI 配置、技能或命令参数。订单、库存、应收、合作伙伴等业务数据必须由服务端新增**命名报表 API**，包括固定的参数、字段白名单、分页上限和 `odoo_data:read` 权限；不会提供任意 SQL、任意模型或表浏览命令。

## 5. API 目录与诊断

`schema` 用于查看客户端支持的稳定 Agent API、参数和所需权限，而不发送数据请求：

```bash
octo-cli schema
octo-cli schema sprint.tasks
```

`doctor` 会检查当前 Profile 的服务地址、token 是否存在，并默认探测服务端的 `/health`：

```bash
octo-cli doctor
octo-cli doctor --offline
```

`--offline` 只检查本地配置，不发出网络请求。它不会验证 token 是否实际拥有某一 API scope；该验证要等服务端 Agent token middleware 部署后接入。

## 6. 本地 demo

Demo 用固定的本地 token 和样例数据验证 CLI 到 HTTP API 的完整链路，不连接 Octo、Odoo 或第三方平台。

终端一启动 demo：

```bash
node octo-cli/dist/src/index.js demo serve --port 8788
```

终端二运行任一查询，例如：

```bash
OCTO_SERVER_URL=http://127.0.0.1:8788 \
OCTO_API_TOKEN=octo-demo-token \
node octo-cli/dist/src/index.js odoo branches --environment eu
```

结束 demo 时按 `Ctrl-C`。Demo 默认只绑定 `127.0.0.1`，不会对局域网暴露。

## 7. 给 Codex 安装技能

查看随包提供的技能：

```bash
octo-cli skills list
octo-cli skills read octo-odoo-devops-data
```

`skills list` 会返回每个 Skill 的描述、阅读入口和依赖关系。除 `octo-shared` 外的领域 Skill 都依赖它；使用领域 Skill 前应先阅读共享规则。

复制到 Codex 本地技能目录：

```bash
octo-cli agent install --destination ~/.codex/skills
```

目标目录已有同名技能时默认拒绝覆盖。确认要覆盖时显式传入：

```bash
octo-cli agent install --destination ~/.codex/skills --force yes
```

## 8. 常见问题

| 现象 | 排查方式 |
| --- | --- |
| `Missing OCTO_SERVER_URL` 或 token 错误 | 执行 `octo-cli config show`，或检查本次命令的 `OCTO_SERVER_URL` / `OCTO_API_TOKEN`。 |
| `UNAUTHORIZED` | 确认使用的是 agent token，而不是浏览器 Cookie、Lark/Odoo/GitHub token。 |
| `SNAPSHOT_NOT_FOUND` | 对应数据尚未同步到 Octo，或项目、Sprint、Ticket 的复合标识不正确。 |
| Odoo 数据库连接超时 | 这是服务端网络/VPN/防火墙问题；CLI 不应直连数据库。先在部署 Octo Server 的网络环境确认三套只读库可达。 |
| 想查询订单或库存 | 先定义首个命名报表的业务口径、字段、筛选条件和权限；不要请求通用 SQL 接口。 |

## 9. 开发验证

```bash
pnpm --dir octo-cli test
pnpm --dir octo-cli pack --dry-run
```

测试会先编译 TypeScript，再执行 `octo-cli/test/` 中的 Node 测试。
