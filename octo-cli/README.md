# Octo CLI

`octo-cli` is the local, read-only CLI for agent access to synchronized Octo data. It mirrors the useful agent-facing shape of `lark-cli`: Agent Quickstart, task commands, explicit configuration profiles, API schema discovery, diagnostics, discoverable bundled skills, and an agent installer. Unlike `lark-cli`, it deliberately has no raw HTTP or SQL escape hatch.

详细的安装、配置、命令、Odoo 数据边界和本地 demo 说明见 [USAGE.md](./USAGE.md)。

## Commands

```bash
octo-cli config set --server-url https://octo.example --api-token <agent-token>
octo-cli sprint burndown --project-key <project-key> --sprint-id <sprint-id>
octo-cli sprint tasks --project-key <project-key> --sprint-id <sprint-id>
octo-cli github pr --owner TenwaysCom --repo octo --number 42
octo-cli lark ticket --base-id <base-id> --table-id <table-id> --record-id <record-id>
octo-cli odoo branches --environment eu
octo-cli agent install --destination ~/.codex/skills
```

The CLI stores only `serverUrl` and the Octo agent API token in `~/.octo-cli/config.json` (or `OCTO_CLI_HOME/config.json`). Environment variables `OCTO_SERVER_URL` and `OCTO_API_TOKEN` override that file.

## Local demo

Run this in one terminal:

```bash
pnpm --dir octo-cli build
node octo-cli/dist/src/index.js demo serve --port 8788
```

Then, in another terminal:

```bash
OCTO_SERVER_URL=http://127.0.0.1:8788 OCTO_API_TOKEN=octo-demo-token \
  node octo-cli/dist/src/index.js sprint burndown --project-key demo-project --sprint-id demo-sprint-202608
```

The demo deliberately uses a fixed local token and fixture data. It demonstrates the CLI/API contract only; it is not an Octo server or a real platform integration.

## Agent API contract

The CLI expects Octo's read-only bearer-authenticated agent API to return `{ ok, data, error }` envelopes:

| Command | API |
| --- | --- |
| `sprint burndown` | `GET /api/agent/v1/projects/:projectKey/sprints/:sprintId/burndown` |
| `sprint tasks` | `GET /api/agent/v1/projects/:projectKey/sprints/:sprintId/tasks` |
| `github pr` | `GET /api/agent/v1/github/pull-requests/:owner/:repo/:number` |
| `lark ticket` | `GET /api/agent/v1/lark-tickets/:baseId/:tableId/:recordId` |
| `odoo branches` | `GET /api/agent/v1/odoo/branches?environment=:environment` |

These endpoints must read Octo's existing synchronized projections, rather than call third-party APIs from the CLI. They must accept an Octo agent token in `Authorization: Bearer …`; browser cookies and third-party tokens are deliberately out of scope.

`odoo branches` is the first Odoo read-only surface. It adapts the server-owned Odoo DevOps branch/build service for `eu`, `uk`, and `us`. The supplied EU/UK/US Odoo readonly PostgreSQL databases are a separate server-only source for future named report APIs. The CLI never receives database credentials, and the server will not expose generic SQL, ORM, or table browsing; orders, inventory, invoices, and partners each need a separate named, allowlisted report API.

## Development

```bash
pnpm --dir octo-cli install
pnpm --dir octo-cli test
```
