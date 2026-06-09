---
status: draft
owner: TBD
last_reviewed: 2026-06-09
scope: Coding rules for Octo server routes, controllers, services, adapters, workflows, platform metadata, errors, logging, and tests
update_required_when:
  - server route/controller/service layering changes
  - workflow orchestration changes
  - platform adapter or metadata resolver changes
  - error envelope changes
  - server test strategy changes
---

# Server Code Rules

本文档约束 server 端代码应该是什么样子。跨层边界见 `system-boundaries-and-code-rules.md`，技术对象 lifecycle 见 `../lifecycle/current-system-technical-objects.md`。

## 1. Core Positioning

Server 是 Octo 业务能力的权威来源。它负责：

1. page/action catalog。
2. public API route。
3. request validation。
4. identity/auth resolution。
5. workflow orchestration。
6. platform adapter 调用。
7. persistence。
8. error envelope 和 diagnostics。

Server 不应负责：

1. 浏览器 DOM 细节。
2. popup 展示状态。
3. 直接复用 extension 内部类型作为业务类型。
4. 在 workflow 中散落平台动态字段 ID。

## 2. Layering Rules

Server 内部分层：

| Layer | Directory examples | Responsibility | Should not do |
| --- | --- | --- | --- |
| HTTP route | `server/src/index.ts`, `server/src/http/`, route modules | register routes, middleware, controller wiring | business workflow |
| DTO/validator | `*.dto.ts`, `validators/` | validate request/response boundary | platform API calls |
| Controller | `*.controller.ts` | parse validated input, call service, shape response | multi-step business orchestration beyond thin coordination |
| Application service | `server/src/application/services/`, workflow services | business orchestration, identity/auth/workflow decisions | raw HTTP platform details |
| Adapter | `server/src/adapters/` | third-party API and persistence implementation | PM business rules |
| Store/repository | `server/src/adapters/postgres/` | persistence CRUD/query | workflow branching |

Rule of thumb:

- Route chooses controller.
- Controller validates and calls service.
- Service orchestrates.
- Adapter talks to external system.
- Store persists.

## 3. Route Rules

1. Public routes use current vocabulary, e.g. `lark-bug`, `lark-user-story`, `meegle-product-bug`, `meegle-user-story`.
2. Legacy routes must be either clearly supported or clearly removed.
3. Every new route should have:
   - DTO validation.
   - controller test.
   - structured success/error response.
   - route registration test when route compatibility matters.
4. Route should not parse platform-specific payload deeply; delegate to DTO/service.
5. Route should not swallow errors without normalized envelope.

Route naming:

| Good | Avoid |
| --- | --- |
| `/api/meegle/workitem/update-lark-and-push` | hidden extension-only route names |
| `/api/lark-base/create-meegle-workitem` | ambiguous `/api/a1/*` for new code |
| `/api/config/page` | duplicated page config route under extension terms |

## 4. Controller Rules

Controller should:

1. Validate input with Zod DTO.
2. Extract `actionRunId` from request if present.
3. Call one service function/class.
4. Convert service result into `{ ok, data, error }`.
5. Preserve typed error code and stage.

Controller should not:

1. Build Meegle field payload directly.
2. Refresh tokens manually unless it is the auth controller.
3. Contain page/action mapping that belongs in config service.
4. Contain retry loops for platform-specific constraints.

Recommended controller shape:

```ts
export async function someController(input: unknown): Promise<ApiResponse> {
  const request = dto.parse(input);
  return service.execute(request);
}
```

## 5. Service And Workflow Rules

Application service owns business orchestration.

Service should:

1. Receive typed request.
2. Resolve identity/auth through dedicated services.
3. Call adapters through injected deps where practical.
4. Pass `actionRunId` to downstream logs/services.
5. Return typed result flags for partial success.
6. Keep idempotency key visible for create/apply actions.

Service should not:

1. Use raw `fetch` to third-party APIs.
2. Directly access browser/extension state.
3. Hardcode Meegle dynamic `field_*` as business semantics.
4. Convert all failures to `Error.message`.

Partial success rules:

| Case | Required response detail |
| --- | --- |
| Meegle created but Lark writeback failed | include workitem id/link, failed stage, retry guidance |
| Lark updated but Meegle status update failed | include `larkBaseUpdated: true`, failed Meegle stage |
| message sent but reaction failed | include separate result flags |

## 6. DTO And Validation Rules

1. Validate API inputs with Zod DTO schemas.
2. Required identifiers must be explicit:
   - `masterUserId`
   - `projectKey`
   - `workItemTypeKey`
   - `workItemId`
   - `baseId`
   - `tableId`
   - `recordId`
3. Do not accept ambiguous `any` payloads at public route boundary.
4. Unknown platform payload should be normalized before entering workflow.
5. Validation errors should map to stable `INVALID_REQUEST` or more specific error code.

## 7. Identity And Auth Rules

1. `masterUserId` is preferred for action workflows.
2. `operatorLarkId` may be fallback only where existing protocol requires it.
3. Auth refresh belongs to auth service/factory layer, not arbitrary workflow code.
4. Missing identity, missing binding, auth expired, and platform permission denied are different errors.
5. Meegle auth code is one-time credential; never log full value.
6. Server stores and refreshes real platform tokens; extension only triggers auth.

Recommended error codes:

| Error code | Meaning |
| --- | --- |
| `IDENTITY_NOT_FOUND` | cannot resolve master user |
| `MEEGLE_BINDING_REQUIRED` | resolved user lacks Meegle binding |
| `MEEGLE_AUTH_REQUIRED` | Meegle token missing/expired/refresh failed |
| `LARK_AUTH_REQUIRED` | Lark token missing/expired/refresh failed |
| `PLATFORM_PERMISSION_DENIED` | platform denied despite valid token |

## 8. Adapter Rules

Adapter should:

1. Own third-party request path, method, headers, pagination, and response parsing.
2. Normalize response shapes.
3. Convert platform errors to typed adapter/platform errors.
4. Preserve safe `rawStatusCode` and `rawResponseSummary`.
5. Accept injected token/client deps for tests where applicable.

Adapter should not:

1. Decide workflow next step.
2. Decide UI copy.
3. Know popup action keys.
4. Hide platform rejection details.

Error mapping rule:

| Platform behavior | Adapter/server error |
| --- | --- |
| auth expired | `MEEGLE_AUTH_REQUIRED` / `LARK_AUTH_REQUIRED` |
| field illegal | `MEEGLE_FIELD_NOT_WRITABLE_CREATE` or `MEEGLE_FIELD_NOT_WRITABLE_UPDATE` |
| field missing | `MEEGLE_FIELD_NOT_FOUND` |
| option invalid | `MEEGLE_OPTION_NOT_FOUND` |
| rate limit | `PLATFORM_RATE_LIMITED` |
| unknown platform rejection | `MEEGLE_PLATFORM_REJECTED` or platform-specific equivalent |

## 9. Meegle Metadata Rules

Meegle dynamic fields should be governed by a metadata resolver.

Rules:

1. Workflow uses semantic field keys.
2. Resolver maps semantic key to actual `field_key`.
3. Resolver input includes `projectKey` and `workItemTypeKey`.
4. Resolver validates create/update writability.
5. Resolver knows option values when field type requires option validation.
6. Hardcoded `field_*` is allowed only in fixture/fallback config/migration layer.

Semantic fields to standardize first:

| Semantic key | Current usage |
| --- | --- |
| `larkRecordLink` | Lark Base record link on Meegle workitem |
| `larkMessageLink` | Lark message/thread link on Meegle workitem |
| `larkUpdateMessage` | message content to push back to Lark |
| `larkUpdateStatus` | whether push already happened |
| `system` | GitHub repo/system mapping |
| `plannedVersion` | GitHub lookup display |
| `plannedSprint` | GitHub lookup display |

## 10. Config And Mapping Rules

1. Page/action catalog belongs in server config/controller/service.
2. Lark issue type -> Meegle workitem type mapping belongs in server config.
3. Workitem type/template mapping should be config-driven where possible.
4. Environment defaults are allowed, but must be documented and testable.
5. If mapping affects platform writes, add fixture or unit test.
6. Do not duplicate the same mapping in extension and server.

## 11. Error Envelope And Logging Rules

Every cross-layer action should use:

```ts
type OctoActionError = {
  layer: "server" | "adapter" | "platform";
  module: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
  actionRunId: string;
  rawStatusCode?: number;
  rawResponseSummary?: string;
};
```

Server logs use `server/src/logger.ts`.

Rules:

1. Do not use `console.log`.
2. Logs for action workflows include `actionRunId`.
3. Logs include `operation`, `stage`, and key object ids.
4. Logs do not include raw tokens, cookies, full auth codes, or full sensitive platform payloads.
5. Platform raw response is summarized and truncated.

## 12. Testing Rules

Server test types:

| Test type | Purpose |
| --- | --- |
| Unit | DTO, mapper, resolver, pure service branches |
| Service mock integration | workflow orchestration with mocked adapters |
| Route/controller | request validation and response envelope |
| Live smoke | only when real platform auth/seed data are available |

Rules:

1. Use package-scoped command: `pnpm --dir server test`.
2. Add focused tests for the module touched.
3. Mock integration tests must not be described as live E2E.
4. Adapter tests should cover platform error normalization.
5. Metadata resolver tests should cover different `field_key` by workitem type.
6. New tests follow project rule: Vitest globals are enabled; do not import `describe/it/expect` unless existing local style requires it.
7. Do not introduce dynamic `await import()` patterns in tests.

## 13. PR Checklist

Before merging server changes:

1. Is route/controller/service/adapter responsibility clean?
2. Are inputs validated by DTO?
3. Does the workflow accept/pass `actionRunId`?
4. Are errors typed and layer/stage-specific?
5. Are Meegle fields semantic or centrally resolved?
6. Are platform errors preserved as safe summaries?
7. Are partial success states explicit?
8. Are tests at the correct layer?
9. Did the change avoid `console.log`?
