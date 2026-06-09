## Project Overview

Tenways Octo is a browser extension plus backend server for PM coordination across Lark, Meegle, GitHub, identity/auth, and PM analysis flows.

Core split:

- Extension stays thin: page detection, context capture, auth triggers, UI, and action dispatch.
- Server owns page/action catalog, identity/auth, workflows, platform orchestration, persistence, and diagnostics.
- Platform adapters own third-party API calls and error normalization.

## Route Naming

- Public HTTP routes use current names such as `/api/lark-bug/*` and `/api/lark-user-story/*`.
- Old `/api/a1/*` and `/api/a2/*` routes have been removed. Do not reintroduce them without an explicit compatibility plan.

## Commands

Prefer package-scoped commands from the package you are changing.

Server:

```bash
pnpm --dir server dev
pnpm --dir server test
pnpm --dir server build
pnpm --dir server start
pnpm --dir server db:migrate
pnpm --dir server db:reset
```

Extension:

```bash
pnpm --dir extension dev
pnpm --dir extension test
pnpm --dir extension typecheck
pnpm --dir extension build
pnpm --dir extension package
pnpm --dir extension test:e2e
```

## Hard Rules

1. Keep workflow/business logic out of the extension.
2. Backend actions should be driven by server `automationActions.executor`, not popup hardcoded backend routes.
3. Cross-layer actions should carry `actionRunId` and return or log `layer`, `module`, `stage`, and `errorCode`.
4. Do not scatter Meegle `field_*` keys in popup or workflow services; use a metadata resolver or documented fallback config.
5. Validate API inputs with Zod DTO schemas.
6. Keep services dependency-injected through explicit deps objects so they stay testable.
7. Preserve structured `{ ok, data, error }` responses where the module already uses them.
8. Do not use `console.log`; use server `logger.ts` or `extension/src/logger.ts`.
9. Never send raw browser cookies to the server. Treat auth codes as one-time credentials.
10. Dependencies should be added as devDependencies unless explicitly requested otherwise.

## Agent Reading Rules

For non-trivial changes, agents must read the relevant docs before editing:

- Technical object lifecycle: `docs/ai-dev/lifecycle/current-system-technical-objects.md`
- Cross-layer boundary rules: `docs/ai-dev/rules/system-boundaries-and-code-rules.md`
- Extension code rules: `docs/ai-dev/rules/extension-code-rules.md`
- Server code rules: `docs/ai-dev/rules/server-code-rules.md`

## Testing

- Server verification usually means `pnpm --dir server test` and often `pnpm --dir server build`.
- Extension verification usually means `pnpm --dir extension test`, `pnpm --dir extension typecheck`, and `pnpm --dir extension build`.
- Extension live E2E uses Playwright via `pnpm --dir extension test:e2e`.
- Vitest globals are enabled. Use `describe`, `it`, and `expect` directly without importing them.
- Do not introduce dynamic `await import()` patterns in tests.

## Logs

- Server logs: `server/logs/app.log`, `server/logs/api.log`.
- Extension client upload logs: `server/logs/popup-client.log` when enabled.
- Use `LOG_LEVEL=debug` for deeper server debugging.

## Documentation

- Keep high-level product/architecture references in `docs/tenways-octo/`.
- Keep AI/dev governance, lifecycle, rules, execution plans, and issue maps in `docs/ai-dev/`.
- If behavior changes across extension and server, update the affected architecture, lifecycle, protocol, or `docs/ai-dev` rule document instead of adding stray markdown files.

## Working Style

- Do exactly what was asked, nothing speculative.
- Keep changes surgical.
- Prefer editing existing files over creating new files.
- Write commit messages and PR descriptions casually and specifically; avoid robot copy and vague summaries.
