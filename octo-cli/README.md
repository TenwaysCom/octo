# octo-cli

`octo-cli` 是面向人和本地 Agent 的 Octo 只读命令行工具。它读取 Octo 已同步的 Sprint、GitHub PR、Lark Ticket 与 Odoo DevOps 投影；不携带浏览器 Cookie，也不直接调用第三方平台或 Odoo 数据库。

[快速开始](#快速开始) · [Agent 快速开始](#agent-快速开始) · [能力](#能力) · [Skills](#agent-skills) · [升级](#升级) · [安全边界](#安全边界) · [完整使用说明](./USAGE.md)

## 为什么使用 octo-cli？

- **Agent 优先**：提供 `skills list/read`、`schema`、`doctor`、Profile 和机器可读 JSON 输出。
- **投影优先**：读取 Octo 快照，不让 Agent 以缺失快照为理由绕过 Octo 去调用 Lark、Meegle、GitHub 或 Odoo。
- **只读且受限**：没有 raw HTTP、任意 SQL、Odoo ORM 或表浏览入口。
- **可控环境**：Profile 支持严格主机绑定；远程服务地址必须使用 HTTPS。
- **可诊断**：成功与失败有稳定 JSON 信封；`doctor` 可分别检查本地配置和服务健康状态。

## 能力

| 领域 | 可读取的数据 |
| --- | --- |
| Sprint | 燃尽点、任务和工作项状态投影 |
| GitHub PR | PR 快照与关联的 Meegle 工作项 |
| Lark Ticket | 以 Base/Table/Record 复合标识定位的 Ticket 快照 |
| Odoo DevOps | EU、UK、US 的分支和构建状态 |
| Agent 控制面 | Profile、Schema、诊断、Skills 发现与安装 |

## 快速开始

### 前置条件

- Node.js 18+ 和 pnpm
- 真实查询需要已部署的 Octo Agent API 及最小权限 agent token

### 本地 demo

Demo 是可运行的 CLI → HTTP API → JSON 输出链路，不连接 Octo、Odoo 或第三方平台。

```bash
pnpm --dir octo-cli install
pnpm --dir octo-cli build
node octo-cli/dist/src/index.js demo serve --port 8788
```

在另一终端运行：

```bash
OCTO_SERVER_URL=http://127.0.0.1:8788 \
OCTO_API_TOKEN=octo-demo-token \
node octo-cli/dist/src/index.js sprint tasks \
  --project-key demo-project \
  --sprint-id demo-sprint-202608
```

### 真实 Octo 服务

```bash
octo-cli config set \
  --server-url https://octo.example \
  --api-token <agent-token>

octo-cli doctor
octo-cli sprint tasks --project-key <project-key> --sprint-id <sprint-id>
```

> 当前仓库只提供本地 demo 合同。真实调用要求服务端部署 `/api/agent/v1`、bearer token middleware 与对应的只读投影接口。

## Agent 快速开始

Agent 应遵循此顺序，而不是直接猜测命令或绕过 Octo：

```text
skills list/read → schema → doctor → task command → inspect ok / error
```

```bash
octo-cli skills list
octo-cli skills read octo-sprint-data
octo-cli schema sprint.tasks
octo-cli doctor --offline
```

当缺少服务地址或 token 时，向用户索取 Octo Agent API 的最小权限凭据；不要索取浏览器 Cookie、Lark/Meegle/GitHub token 或数据库密码。

## Agent Skills

| Skill | 用途 |
| --- | --- |
| `octo-shared` | 配置、Profile、诊断、Schema、错误与安全边界 |
| `octo-sprint-data` | Sprint 燃尽与任务状态 |
| `octo-github-pr-data` | GitHub PR 与 Meegle 关联 |
| `octo-lark-ticket-data` | Lark Ticket 快照 |
| `octo-odoo-devops-data` | Odoo EU/UK/US 分支与构建状态 |
| `octo-platform-data` | 跨平台投影的通用路由 |

查看和安装：

```bash
octo-cli skills list
octo-cli skills read octo-shared
octo-cli agent install --destination ~/.codex/skills
```

## 命令模型

`octo-cli` 使用两层受控命令模型，而不是 lark-cli 的 raw API 三层模型：

1. **任务命令**：面向 Sprint、PR、Ticket、Odoo DevOps 的稳定读取接口。
2. **Schema**：`octo-cli schema [name]` 输出 API 路径、参数、scope 与风险等级。

```bash
octo-cli sprint burndown --project-key <key> --sprint-id <id>
octo-cli sprint tasks --project-key <key> --sprint-id <id>
octo-cli github pr --owner TenwaysCom --repo octo --number 42
octo-cli lark ticket --base-id <base-id> --table-id <table-id> --record-id <record-id>
octo-cli odoo branches --environment eu
```

完整参数与 API 对照表请见 [USAGE.md](./USAGE.md)。

## 输出契约

成功结果写入 stdout，退出码为 `0`：

```json
{
  "ok": true,
  "data": { "...": "..." },
  "meta": { "profile": "default" }
}
```

失败结果写入 stderr，退出码非 `0`：

```json
{
  "ok": false,
  "error": {
    "errorCode": "SNAPSHOT_NOT_FOUND",
    "errorMessage": "..."
  }
}
```

Agent 应使用 `ok == true` 或进程退出码判断成功。`SNAPSHOT_NOT_FOUND` 仅说明 Octo 没有匹配投影，不代表源平台中的记录不存在。

## 升级

私有发布环境提供一个 HTTPS `latest.json` 清单和对应的 `.tgz` 制品。更新检查不会使用配置中的 Octo Server URL，必须显式提供清单地址或设置 `OCTO_CLI_UPDATE_URL`：

```bash
octo-cli upgrade --manifest-url https://releases.example.internal/octo-cli/latest.json
octo-cli upgrade --apply --yes --manifest-url https://releases.example.internal/octo-cli/latest.json
```

受保护的私有发布环境将读取 token 放入 `OCTO_CLI_UPDATE_TOKEN`，不会存入 Profile、配置文件或输出。`--apply --yes` 才会执行全局安装。CLI 会先下载制品、校验清单中的 SHA-256 与字节数，然后以 `npm install --global --ignore-scripts` 安装。

## 安全边界

- 所有当前数据命令都是 `read`，Schema 会标记 `risk: read`。
- 远程服务器必须使用 HTTPS；HTTP 仅允许本地 loopback demo。
- Profile 可启用严格主机绑定：`octo-cli profile strict-mode on --name prod`。
- CLI 不接受数据库 URL、SQL、浏览器 Cookie 或第三方平台 token。
- Odoo 只读数据库只能由服务端以命名报表方式访问，包含字段白名单、参数校验、分页与服务端 scope 校验。
- token 在配置输出中会被脱敏；不要提交、打印或放入 prompt。

未来如新增写操作，必须采用 `--dry-run → 显式确认 → --yes → actionRunId → read-back`，并由服务端再次强制执行。

## 开发

```bash
pnpm --dir octo-cli test
pnpm --dir octo-cli pack --dry-run
```

完整的安装、Profile、严格模式、Odoo 边界、故障排查和开发说明见 [USAGE.md](./USAGE.md)。
