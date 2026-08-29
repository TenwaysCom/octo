---
title: "Octo CLI skills and API migration plan"
module: "cli"
status: planned
requirement_version: 1
created_on: 2026-08-29
updated_on: 2026-08-29
closed_on: null
owner: Codex
related:
  - "2026-08-29-octo-cli-bootstrap"
---

# Octo CLI skills and API migration plan

## Decision

`octo-cli` is an agent-facing reader of **Octo synchronized projections**. It must not become a second Lark/Meegle/GitHub client. Therefore, portable client patterns are configuration, commands, skill discovery/install, typed catalogues and diagnostics; platform credentials, browser cookies and raw third-party API escape hatches are not portable into the first release.

The Agent control plane follows the safe parts of `lark-cli`: `skills list/read` for discovery, a shared Skill for routing and failure handling, `schema` for typed API/risk inspection, Profiles for local environment selection, `doctor` for local/readiness checks, and `{ ok, data, meta }` / `{ ok, error }` JSON envelopes. Unlike `lark-cli`, `octo-cli` intentionally has no raw HTTP or SQL fallback.

## API inventory

| Existing Octo surface | Client value | Migration action | Target agent API / command | Preconditions |
| --- | --- | --- | --- | --- |
| `GET /api/web/platform-data/meegle-workitems` | Sprint membership, lifecycle fields, linked PR summaries | Adapt server-side; current endpoint is Web-session-only | `sprint tasks --project-key --sprint-id` → `GET /api/agent/v1/projects/:projectKey/sprints/:sprintId/tasks` | Agent token middleware; project/sprint DTO; `PlatformDataService` projection reuse |
| Sprint membership history + FE `buildMeegleSprintHistory` | Daily Scope/Started/Completed burn-down | Move calculation to a server domain/service function; do not have CLI infer it | `sprint burndown --project-key --sprint-id` → `GET /api/agent/v1/projects/:projectKey/sprints/:sprintId/burndown` | Server test fixtures for inferred/observed history, carryover and incomplete snapshots |
| `GET /api/web/platform-data/github-pull-request-preview` | Exact PR snapshot with linked Meegle work items | Reuse `PlatformDataService.getGitHubPullRequestPreview` behind agent auth | `github pr --owner --repo --number` → `GET /api/agent/v1/github/pull-requests/:owner/:repo/:number` | Reuse existing owner/repo/number DTO and snapshot-not-found semantics |
| `GET /api/web/platform-data/lark-tickets` | Current Ticket list snapshots | Add a single-record projection query to the store/service | `lark ticket --base-id --table-id --record-id` → `GET /api/agent/v1/lark-tickets/:baseId/:tableId/:recordId` | Composite Lark identity is mandatory; do not pretend `recordId` is global |
| `GET /api/web/platform-sync-sources` | Snapshot freshness and configured scope state | Adapt after the four read APIs | `sync status` → `GET /api/agent/v1/sync-sources` | Agent scope `platform_sync:read`; no sync trigger in v1 |
| `GET /api/web/odoo-devops-branches?environment=eu|uk|us` | Odoo.sh branch/build state | Reuse `OdooDevopsBranchesService.list` behind agent auth | `odoo branches --environment` → `GET /api/agent/v1/odoo/branches?environment=:environment` | Agent scope `odoo_devops:read`; keep Odoo.sh session server-side |
| EU/UK/US Odoo readonly PostgreSQL databases | Approved Odoo business-data reports | Add server-side, named report adapters | `odoo report <report> --environment` → `GET /api/agent/v1/odoo/reports/:report?environment=:environment` | Three server-only URLs, `odoo_data:read` scope, Zod parameters and a per-report column allowlist |
| Web platform sync triggers, Meegle/Lark write workflows, ACP actions | Mutating actions | Do not port in v1 | None | Explicit per-action authorization, preview/idempotency and audit design required |

## Skills inventory

| Source | Candidate | Decision | Reason |
| --- | --- | --- | --- |
| `lark-cli` command model | `config`, `skills list/read`, bundled resource install, help | Port now | These are local, platform-neutral ergonomics. `octo-cli` already supplies them. |
| `lark-cli` `doctor` / `profile` | `octo-cli doctor`, named Octo environments | Port in phase 3 | Useful after a real token endpoint exists; doctor must only test Octo identity/scope/snapshot connectivity. |
| `lark-cli` `schema` | typed Octo agent API catalogue | Port in phase 3 | Expose Octo’s stable DTOs and scopes, not third-party raw schemas. |
| `lark-cli` `api` raw HTTP escape hatch | Generic raw requests | Do not port | It would bypass Octo action ownership, DTO validation and audit controls. |
| `lark-shared`, `lark-base`, `lark-task`, `lark-event`, `lark-openapi-explorer` | Direct Lark auth/data/event skills | Do not copy | They need Lark credentials or direct platform access, contrary to the Octo snapshot boundary. |
| Odoo `query_deluxe` historical API | Generic read-only SQL endpoint | Do not reuse | Its controller route is absent in the current Odoo source; an arbitrary query API would be an unacceptable capability boundary. |
| Existing `story-prd-to-simplified` and `bug-support-to-tech-analysis` | Future Octo workflow skills | Adapt later | They map to server-owned AI workflows, but require explicit write/preview controls rather than a read-only CLI command. |
| New `octo-platform-data`, `octo-sprint-data`, `octo-github-pr-data`, `octo-lark-ticket-data` | Snapshot read skills | Port now | They are bundled with the CLI and explicitly distinguish snapshot state from live-platform state. |

## Phased implementation

### Phase 0 — local demo (complete)

- Keep the standalone TypeScript package and the five read commands.
- Keep the in-process demo server behind a demo-only bearer token, with fixed sample snapshots.
- Ship six bundled skills (including `octo-shared`) and `agent install` for Codex.
- Ship Agent Quickstart, `skills list/read`, Profile selection, `schema`, offline `doctor`, and stable JSON envelopes.
- Acceptance: the CLI can query five demo routes; absent/wrong token is rejected; no browser cookie or third-party token is used; Agent discovery and local diagnostics require no external credential.

### Phase 1 — server agent identity and access

- Introduce an Octo agent token store: token ID, owning user/service account, hashed secret, scopes, expiry, revoked time and audit timestamps.
- Add bearer middleware only below `/api/agent/v1`; preserve Web session and extension auth unchanged.
- Define `platform_data:read`, `platform_sync:read` and `odoo_devops:read`; reject absent, expired and under-scoped tokens with typed errors.
- Acceptance: controller tests prove isolation between agent token, Web cookie and extension `master-user-id`; logs expose token ID/scope but never the secret.

### Phase 2 — projection endpoints

- Build the five `agent/v1` read endpoints from existing stores/services, with Zod DTOs and `{ ok, data, error }` responses.
- Move Sprint history aggregation from the FE helper to a pure server/domain function shared by the agent endpoint and future FE adapter.
- Preserve source timestamps, membership-source/inference labels, pagination bounds and `SNAPSHOT_NOT_FOUND` behavior.
- Add the Odoo DevOps branch endpoint by adapting the existing three-environment service; return cache provenance and never expose Odoo.sh cookies.
- Add Odoo readonly report adapters only for named reports. Resolve `ODOO_READONLY_DATABASE_URL_EU`, `ODOO_READONLY_DATABASE_URL_UK` or `ODOO_READONLY_DATABASE_URL_US` on the server; do not expose an SQL input, a database URL or database credentials through the API.
- Acceptance: service/controller tests cover a current Sprint, past inferred Sprint, carried item, missing snapshot, composite Lark key, GitHub PR with no linked Meegle item, and EU/UK/US Odoo DevOps responses.

### Phase 3 — production Agent readiness

- Extend `doctor` from local configuration/public health to server-authenticated effective identity, token scopes and snapshot freshness.
- Keep named profiles (`local`, `test`, `prod`) local-only; do not switch them implicitly.
- Extend `schema` only when the server DTO and required scope are deployed; include each route's risk classification.
- For future writes, add preview and explicit confirmation gates before exposing a command.
- Package and publish only after a target environment read-back proves all four commands with a least-privilege token.
- Acceptance: no secret appears in `config show`, doctor does not mutate, packaging includes built CLI plus bundled skills, and every error preserves a typed error code.

### Phase 4 — explicitly approved write workflows

- Consider preview-first, idempotent commands for server-owned workflow actions one at a time.
- Each requires a dedicated skill, scope, `actionRunId`, typed partial-success envelope and audit/read-back tests.
- No generic `api` command, direct Lark/Meegle/GitHub credential import or browser-cookie bridge is introduced.

## Current demo mapping

| Demo route | Demonstrated contract |
| --- | --- |
| `/api/agent/v1/projects/demo-project/sprints/demo-sprint-202608/burndown` | Observed Sprint burn-down points and synchronization timestamp |
| `/api/agent/v1/projects/demo-project/sprints/demo-sprint-202608/tasks` | Sprint work-item and task status projection |
| `/api/agent/v1/github/pull-requests/TenwaysCom/octo/42` | GitHub PR to Meegle association |
| `/api/agent/v1/lark-tickets/base-demo/table-tickets/rec-demo-1001` | Composite-key Lark Ticket snapshot |
| `/api/agent/v1/odoo/branches?environment=eu` | Odoo EU/UK/US branch and build-status projection |

## Verification boundary

This plan was derived from the available Octo platform-data, platform-sync, Sprint-history and Lark CLI surfaces. The current checkout does not contain the newer Web platform-data server modules, so the plan references them as migration sources rather than claiming they are present or deployed here. The supplied Odoo databases are configured only through server-side environment variables. At the time of this update, the development host could not reach `192.168.0.7:18078`, so no schema or production database read-back has been claimed. Phase 0 is locally tested only; no production API/token/runtime proof exists.
