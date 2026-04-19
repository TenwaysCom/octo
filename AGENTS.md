This file provides guidance to coding agents working in this repository.

## Project Overview

Tenways Octo is a cross-platform coordination assistant for PMs and requirement owners.
It consists of a browser extension plus a backend server that helps move work between Lark and Meegle, resolve identity and auth, and run PM analysis flows.

- The extension is a thin client for page detection, context capture, auth triggers, and UI.
- Business logic, workflow orchestration, identity resolution, and third-party API integration live on the server.

### Current terminology

| Old term | Current external name |
| --- | --- |
| `A1` | `Lark Bug` |
| `A2` | `Lark User Story` |
| `B1` | `Meegle User Story` |
| `B2` | `Meegle Product Bug` |

Notes:
- Public server HTTP routes use the new names such as `/api/lark-bug/*` and `/api/lark-user-story/*`.
- Old `/api/a1/*` and `/api/a2/*` routes remain as compatibility aliases.
- Extension message actions still use `a1/a2/b1/b2` naming in places to avoid breaking the existing protocol.

## Repository Layout

```text
tw-itdog/
├── extension/                  # WXT browser extension
├── server/                     # Express + TypeScript backend
├── docs/                       # Architecture docs and design specs
├── experiments/                # Prompt and workflow experiments
├── Makefile                    # Root helper commands
└── AGENTS.md
```

### Key directories

**Server**
- `server/src/index.ts` wires the app, env, controllers, and routes.
- `server/src/http/` contains HTTP route registration and request middleware.
- `server/src/modules/` contains controller/service modules such as `identity`, `meegle-auth`, `meegle-workitem`, `lark-auth`, `lark-base`, `pm-analysis`, `acp-kimi`, and `debug-log`.
- `server/src/application/services/` holds business orchestration and workflow services.
- `server/src/adapters/` contains external integrations and persistence layers, including `lark/`, `meegle/`, `postgres/`, and legacy `sqlite/`.
- `server/src/scripts/` contains migration and import utilities.
- `server/tests/README.md` is the current test guide.

**Extension**
- `extension/src/entrypoints/` contains WXT entrypoints such as `background`, popup HTML, content entrypoints, and page bridge hooks.
- `extension/src/background/` contains message routing, auth handlers, and config.
- `extension/src/content-scripts/` contains platform-specific page probes and context extraction.
- `extension/src/injection/` contains injected UI/bootstrap logic for Lark surfaces.
- `extension/src/popup-react/` is the current popup UI implementation.
- `extension/src/popup/` and `extension/src/popup-shared/` contain shared popup runtime and legacy Vue-side pieces that still exist in the tree.

**Docs**
- `docs/tenways-octo/04-architecture.md` covers the current system architecture.
- `docs/tenways-octo/11-extension-message-and-api-schema.md` documents the extension/server contract.
- `docs/tenways-octo/13-code-structure-and-validation-design.md` explains code structure and validation decisions.
- `docs/tenways-octo/14-v2-architecture-design.md` covers the newer ACP-oriented architecture direction.
- `docs/tenways-octo/18-user-identity-design.md` is the current identity design reference.
- `docs/superpowers/specs/` contains more recent implementation design docs for approved work.

## Development Commands

Prefer package-scoped commands from the package you are changing.

### Root helpers

```bash
make server-dev
make test-server
make ext-dev
make ext-dev-profile
make ext-dev-probe
make ext-build
make ext-test
make ext-typecheck
```

### Server

```bash
pnpm --dir server dev
pnpm --dir server test
pnpm --dir server build
pnpm --dir server start
pnpm --dir server db:migrate
pnpm --dir server db:reset
pnpm --dir server db:import-sqlite -- --sqlite ./data/tenways-octo.sqlite
pnpm --dir server kimi-acp:repl
pnpm --dir server kimi-acp:validate
```

### Extension

```bash
pnpm --dir extension dev
pnpm --dir extension run dev:manual
pnpm --dir extension run dev:profile
pnpm --dir extension test
pnpm --dir extension typecheck
pnpm --dir extension build
pnpm --dir extension package
pnpm --dir extension test:e2e
```

Build output for the extension is `extension/.output/chrome-mv3/`.

## Architecture Notes

### Runtime split

- The extension should stay thin. It detects page state, gathers context, triggers auth, and renders the UI.
- The server owns identity resolution, auth exchange, draft/apply workflows, API orchestration, persistence, and analysis.

### Auth and identity

Meegle auth uses an auth-code bridge:

```text
Extension / page bridge -> Meegle page/BFF -> auth_code
Extension background -> server /api/meegle/auth/exchange -> tokens
```

Critical rules:
- Never send raw browser cookies to the server.
- Treat auth codes as one-time-use credentials.
- `apply` flows prefer `masterUserId`; if absent, the server may fall back to `operatorLarkId`.

### Persistence

- PostgreSQL is the current runtime store.
- `POSTGRES_URI` must be set for migrations and normal runtime storage.
- `server/src/adapters/sqlite/` exists for legacy reads and one-time import, not as the primary runtime database.

## Environment Variables

### Server

```bash
LARK_APP_ID=
LARK_APP_SECRET=
LARK_OAUTH_CALLBACK_URL=
MEEGLE_PLUGIN_ID=
MEEGLE_PLUGIN_SECRET=
MEEGLE_BASE_URL=https://project.larksuite.com
POSTGRES_URI=
HOST=0.0.0.0
PORT=3000
```

## Key Patterns

1. All creation flows use a `draft` then `apply` pattern.
2. Validate API inputs with Zod DTO schemas.
3. Keep services dependency-injected through explicit deps objects so they stay testable.
4. Preserve the structured `{ ok, data, error }` error envelope where the module already uses it.
5. Keep public route naming aligned with the newer `lark-bug` and `lark-user-story` vocabulary unless you are intentionally touching compatibility aliases.
6. Do not use `console.log`; use the local `logger.ts` utilities.
7. Keep the extension/server boundary clean. Do not move workflow logic into the extension.

## Testing

- Tests are colocated with source in both `server/src/**/*.test.ts` and `extension/src/**/*.test.ts`.
- The server test guide lives at `server/tests/README.md`.
- Server verification usually means `pnpm --dir server test` and often `pnpm --dir server build` for compile safety.
- Extension verification usually means `pnpm --dir extension test`, `pnpm --dir extension typecheck`, and `pnpm --dir extension build`.
- Extension end-to-end coverage uses Playwright via `pnpm --dir extension test:e2e`.
- Vitest globals are enabled here. Use `describe`, `it`, and `expect` directly without importing them.
- Do not introduce dynamic `await import()` patterns in tests.

## Documentation

- Keep high-level design references in `docs/tenways-octo/`.
- Keep implementation-specific, date-stamped design specs in `docs/superpowers/specs/`.
- If behavior changes across both extension and server, update whichever architecture or protocol doc is actually affected instead of adding a new stray markdown file.

## Commit Messages

Write commit messages and PR descriptions as a humble but experienced engineer would. Keep them casual and specific. Briefly describe what changed and call out non-obvious implementation choices when that context helps the next reader.

Do not write robot copy, marketing fluff, or vague summaries.

# Tips for Claude Code

- Context7 MCP server available for library documentation lookup
- use-gunshi-cli skill available for gunshi CLI framework documentation
- do not use console.log. use logger.ts instead
- **CRITICAL VITEST REMINDER**: Vitest globals are enabled - use `describe`, `it`, `expect` directly WITHOUT imports. NEVER use `await import()` dynamic imports in test blocks.

# important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
Dependencies should always be added as devDependencies unless explicitly requested otherwise.
