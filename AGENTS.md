# AGENTS.md

## Project Overview

Tenways Octo coordinates PM work across Lark, Meegle, GitHub, identity/auth, and PM analysis flows.

| Area | Responsibility |
| --- | --- |
| `extension/` | Thin browser client: page detection, context capture, auth triggers, UI, and action dispatch. |
| `fe/` | Vite + React web UI: platform views, user interactions, and server API consumption. |
| `server/` | Page/action catalog, identity/auth, business workflows, platform orchestration, persistence, and diagnostics. |
| `server/src/adapters/` | Third-party API calls, persistence implementations, and platform error normalization. |

## Working Scope

- Do exactly what was asked. Keep changes surgical and prefer editing existing files.
- Do not infer new capabilities, dependencies, configuration, or architecture from examples or similar features. If a choice expands scope, state the assumption and obtain confirmation before proceeding.
- Inspect the working tree before editing; preserve unrelated user changes.
- Write commit messages and PR descriptions casually and specifically, describing actual changes and verification.

## Reading Guide

Before non-trivial changes, read the relevant documents and sections for the affected layers:

| When | Read |
| --- | --- |
| Development, troubleshooting, or documentation work | [Development workflow](docs/ai-dev/rules/development-workflow.md) |
| Technical object or lifecycle changes | [Current technical objects](docs/ai-dev/lifecycle/current-system-technical-objects.md) |
| Cross-layer actions, auth, or API contracts | [System boundaries](docs/ai-dev/rules/system-boundaries-and-code-rules.md) |
| Extension changes | [Extension rules](docs/ai-dev/rules/extension-code-rules.md) |
| Server or adapter changes | [Server rules](docs/ai-dev/rules/server-code-rules.md) |
| FE changes or plugin-login verification | [FE guide](fe/README.md) |

## Hard Rules

1. Keep business workflows on the server. Extension and FE own client interactions and presentation.
2. Extension backend actions must use server `pageConfig.automationActions[].executor`, not popup hardcoded backend routes.
3. New or refactored cross-layer actions should carry one `actionRunId` through the flow and return or log `layer`, `module`, `stage`, and `errorCode`.
4. Do not scatter Meegle `field_*` keys in popup or workflow services; use a metadata resolver or documented fallback config.
5. Validate API inputs with Zod DTO schemas.
6. Keep services dependency-injected through explicit deps objects so they stay testable.
7. Preserve structured `{ ok, data, error }` responses where the module already uses them.
8. Do not add `console.log`; use `server/src/logger.ts` for server logging and `extension/src/logger.ts` for extension logging.
9. Never forward raw third-party browser cookies to the server. Treat auth codes as one-time credentials; keep platform tokens server-side. FE authentication uses the server-issued opaque HttpOnly Web session cookie.
10. Add dependencies as devDependencies unless explicitly requested otherwise.

## Route Naming

- Use registered public routes such as `/api/lark-bug/analyze` and `/api/lark-base/create-meegle-workitem`. Check [route registration](server/src/index.ts) and [route tests](server/src/index.test.ts) before documenting or calling an endpoint.
- `/api/a1/*`, `/api/a2/*`, `/api/lark-user-story/*`, and the old `/api/lark-bug/to-meegle-product-bug/{draft,apply}` routes are removed. Do not reintroduce them without an explicit compatibility plan.

## Commands And Verification

Run commands from the repository root, scoped to the package being changed. Script definitions live in each package's `package.json`; shortcuts live in [Makefile](Makefile).

| Package | Development | Usual verification | Other |
| --- | --- | --- | --- |
| Server | `pnpm --dir server dev` | `pnpm --dir server test`; `pnpm --dir server build` | `pnpm --dir server start` (build first) |
| Extension | `pnpm --dir extension dev` | `pnpm --dir extension test`; `pnpm --dir extension typecheck`; `pnpm --dir extension build` | `pnpm --dir extension package`; `pnpm --dir extension test:e2e` |
| FE | `pnpm --dir fe dev` | `pnpm --dir fe check` (test + build) | `pnpm --dir fe test`; `pnpm --dir fe build` |

- Database scripts run compiled `dist/` code: build the server before `pnpm --dir server db:migrate` or `pnpm --dir server db:reset`. `db:reset` drops and recreates application tables; use it only for an explicitly authorized reset against the intended database.
- Choose checks appropriate to the change. For documentation-only changes, verify referenced paths, commands, and the diff; no application test suite is needed unless behavior also changes.
- Server and extension unit tests use Vitest globals: use `describe`, `it`, and `expect` without importing them. FE tests use `node:test` and `node:assert/strict`, following existing FE tests. Do not introduce dynamic `await import()` patterns in tests.
- Extension TypeScript config does not load Vitest global types. New tests using globals need `/// <reference types="vitest/globals" />`, as in existing toolbar tests; runtime `globals: true` alone does not satisfy typecheck.
- Extension live E2E uses Playwright. Confirm server URL, extension build/profile, platform authorization, and seed data before running it.
- Report static checks, unit tests, mock integration, live E2E, and deployed runtime verification separately. Record checks not run and their limits; local tests do not prove deployment.

## Local FE Plugin Login

Run each command in a separate terminal:

```bash
PORT=3040 LARK_OAUTH_CALLBACK_URL=http://localhost:4173/api/lark/auth/callback make server-dev
make ext-dev-profile
make fe-dev
```

- FE runs at `http://localhost:4173`; Vite proxies `/api` to `http://localhost:3040`. The server otherwise uses `PORT` or defaults to `3000`; `make server-dev` alone does not set `3040`.
- Select extension environment `dev` and set its custom `SERVER_URL` to `http://localhost:4173`, matching the browser-facing FE origin.
- `ext-dev-profile` defaults to `~/.config/octo-ext-profile/Default` (`EXT_PROFILE_DIR` overrides the profile root). Keep real Lark login in this dedicated profile; never read or export its cookies/tokens.
- Success requires `start -> approve -> complete` all returning `2xx`, followed by `GET /api/web/profile` reporting a logged-in state. The local server database must have the plugin user's active Lark authorization.

Extract only non-sensitive request fields; never output response bodies, cookies, tokens, or user profiles. Use `--no-filename` so multiple rotated files remain valid JSON input to `jq`:

```bash
rg --no-filename '"path":"/api/web/plugin-login/(start|approve|complete)"' server/logs/api.$(date +%F).* \
  | jq -r '[.time, .phase, .method, .path, (.statusCode // "")] | @tsv'
```

## Logs

- Default server logs: `server/logs/app.YYYY-MM-DD.N.log` and `server/logs/api.YYYY-MM-DD.N.log` (Pino daily rotation when started from the server package).
- Extension client upload logs: `server/logs/popup-client.YYYY-MM-DD.N.log` when enabled.
- Use `LOG_LEVEL=debug` for deeper server debugging. Log only safe summaries; never record raw credentials, full auth codes, or sensitive platform payloads.

## Documentation And Task Records

- Keep product/architecture references in `docs/tenways-octo/`; AI/dev governance, lifecycle, rules, plans, and issue maps in `docs/ai-dev/`.
- Update the affected architecture, lifecycle, protocol, or rule document when cross-layer behavior changes. Keep this file focused on rules, commands, and reading pointers.
- `docs/tasks/` is the sole authority for per-task goals, decisions, progress, and verification evidence. Follow the [task ledger](docs/tasks/README.md) and [template](docs/tasks/_template.md); search for an existing task before creating `docs/tasks/<module>/YYYY-MM-DD-brief-kebab-case.md`.
- Keep task status, progress, evidence, and verification boundaries current. For material requirement changes, update `requirement_version`, revise acceptance criteria, and reopen affected checks before continuing.
- Review closed tasks monthly: archive confirmed records older than 90 days; review stale open records, never auto-archive them. Full criteria live in the task ledger.

## Learning Ledger

Each fact has one authoritative record; other documents link to it.

- [.learnings/LEARNINGS.md](.learnings/LEARNINGS.md) holds durable cross-task rules only: `Context` + `Rule` (two short paragraphs) and a `source:` link to the originating task. Do not copy task outcomes or test counts.
- [.learnings/ERRORS.md](.learnings/ERRORS.md) holds reproducible failure signatures, indexed by exact error, failed command, or wrong assumption: `Error` + `Fix` + task link. One-off task-specific bugs stay in the task's progress log; do not put resolution status or test evidence in the error library.
- Record reusable incidents in ERRORS by default. Promote only generalizable rules to LEARNINGS, linking the ERR id instead of repeating the incident background.
- At the end of a complex task, review failures and near-misses. Update an existing rule or add one when it will prevent a repeat; do not duplicate rules to satisfy a quota.
- During monthly consolidation, merge near-duplicates and remove rules already enforced by a linter, CI check, or test, noting the replacement check.
- Never record secrets, raw credentials, cookies, tokens, sensitive payloads, or large unredacted logs in either ledger or task records.
