---
status: draft
owner: TBD
last_reviewed: 2026-09-22
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
4. For new or refactored cross-layer actions, pass `actionRunId` to downstream logs/services.
5. Return typed result flags for partial success.
6. Keep idempotency key visible for create/apply actions.

Service should not:

1. Use raw `fetch` to third-party APIs.
2. Directly access browser/extension state.
3. Hardcode Meegle dynamic `field_*` as business semantics.
4. Convert all failures to `Error.message`.

For Kimi ACP callback execution, keep the tool sequence explicit and capability-scoped:

1. Bind each Session to one Server-owned, versioned permission profile. The action catalog may name the profile, but must not expose its path or command rules to the browser or model.
2. ACP file writes must be UTF-8 text no larger than 256 KiB. Revalidate traversal, real paths, symlinks and sensitive names for every callback. Answer may write its action-run scratch directory plus the explicitly configured query loop targets; Document may additionally write the allow-listed Support-QA knowledge targets, including only the specifically named state file and never `knowledge-index.jsonl`.
3. Operational commands must use ACP Terminal. Normalize a direct argv or `/bin/bash -lc` wrapper into a complete argv, reject shell expansion and control operators, match an action/profile/Ticket/cwd/script rule, and spawn the authorized executable with `shell: false`, a Server-owned environment and no stdin.
4. Treat Terminal completion and the Server operation audit as the evidence boundary. Permission-dialog labels, truncated summaries and model tool-call text are not execution proof.
5. External writes must be represented by a Server-stored effect draft bound to operator, Session, action run, Ticket, profile, snapshot and payload hash. Confirmation accepts only the draft identity; the Server performs and reads back the write. Unknown external outcomes are terminal and must not be retried automatically.
6. Browser-facing streams continue with the model's normal human-readable response. A scratch JSON file, dry-run result or generated model text is not proof that `ticket_ai`, the feedback table or the knowledge index was updated.

The `lark-ticket-support-qa-summarize` action and Lark Ticket shadow summary worker are exceptions to the ACP flow above: both are one-shot structured-output workflows using the shared Ticket Summary provider configuration. The Server must obtain the fixed, redacted Ticket snapshot before the provider call and validate the returned JSON and evidence IDs locally. The Quick Action calls `SupportTicketAnalysisService.update()` directly; the shadow worker only writes its independent `shadow_ai` projection. Both paths must resolve the same `LARK_TICKET_SUMMARY_PROVIDER` and `LARK_TICKET_SUMMARY_MODEL`; neither may create a reusable Session or expose workspace, shell, Skill, or internal signing capabilities to the provider. Answer and Document remain ACP-backed.

`lark-ticket-wiki-qa` is a separate one-shot draft workflow. Its Ticket thread context uses snapshot-order M1/M2 aliases instead of long message IDs and omits the Allowed evidence Message IDs list. Reply references use those same aliases; references outside the snapshot use distinct E1/E2 aliases marked outside snapshot. The original fixed snapshot retains message IDs for tracing; content, roles, times, order and existing truncation limits remain unchanged. Summary and ACP contexts retain their original ID format. Extraction and answer use the shared Ticket Summary provider/model; rerank selects its protocol using `WIKI_QA_RERANK_MODE=general|rerank` (default `general`) and uses the independent `WIKI_QA_RERANK_URL`, `WIKI_QA_RERANK_MODEL` and `WIKI_QA_RERANK_API_KEY` configuration (defaults: the 智谱 Chat Completions endpoint and `glm-5.3-flash`). Only general mode at the exact default endpoint may fall back to `ZCODE_API_KEY`; dedicated/custom endpoints never inherit provider credentials. Dedicated mode requires an explicit full URL and model, sends `query/documents/top_n` with each document containing only title, environments and relevant Wiki content (no historical chat, file paths or management metadata), validates `results[].index/relevance_score`, and maps indices only to supplied candidates. Dedicated scores establish relevance only: the workflow retains the candidate raw evidence but marks it historical reference with unverified treatment prerequisites; it must not manufacture conditionsMatched=true from a score. General mode retains structured model-selected evidence and applicability checks. An optional `WIKI_QA_RERANK_TIMEOUT_MS` overrides the existing shared timeout, otherwise `LARK_TICKET_SUMMARY_TIMEOUT_MS` or 60000ms applies. Local retrieval returns at most 10 candidates; all retrieved excerpt/evidence bundles are sent to rerank, and returned IDs must belong to those supplied candidates. Its extraction, rerank and answer prompts live under `lark_ticket.wiki_qa.*`. The Server reads only the configured wiki root, validates canonical file paths, uses index/entities as navigation and concepts as distinct knowledge hits, then assigns at most three source numbers after validating the selected candidates and raw-evidence IDs. Draft/unknown scope, incomplete evidence and conflicting material must retain their applicability limits. Raw transcript Shadow AI sections are reference material, not primary evidence. Wiki snippets omit frontmatter and unrelated sections; complete sections and explicit prerequisite/exception sections are retained within the existing 2400-character body budget. The reader keeps original primary sources in a WeakMap keyed by the per-run candidates, without serializing them into dedicated rerank documents. After ranking, source selection first follows links in the related Wiki excerpt (falling back to the page’s associated sources when no inline links exist), then uses query-term matches, adjacent original messages, and prerequisite/result/correction rules. It returns original redacted text in source order, with M/P block ordinals scoped to the source path. It does not generate evidence summaries. Full selected contexts share a 2400-character budget per Wiki page; an over-budget context is omitted as a unit rather than truncated before a reversal. Missing/omitted evidence is explicitly limited and demoted to historical reference. This is conservative lexical selection, not semantic proof or a calibrated relevance threshold. General mode continues to receive its existing primary-evidence excerpts for verification. The answer call has no tools; it receives only the fixed Ticket context, related Wiki content and selected original evidence snippets. It must not invoke the old PostgreSQL approved-knowledge retrieval, ACP, knowledge-loop writes, or Ticket analysis writeback. FE displays a reviewable draft through the existing scoped one-shot run lifecycle. Wiki QA also emits `wiki_qa.progress` SSE events for extract/retrieve/rerank/evidence/answer, with started/completed/failed/cancelled status and actionRunId/layer/module/stage/message (safe errorCode on failure). Events contain fixed status text and candidate counts only, never prompts, raw evidence or model reasoning. Answer completion is emitted only after reference validation. Empty retrieval skips rerank/evidence. The existing run store retains these events; FE renders and updates one status row per run/phase, separately from copyable answer text. Stage transitions do not add periodic heartbeats or change proxy timeout behavior.

Wiki extraction diagnostics are opt-in via `WIKI_QA_EXTRACT_LOG_ENABLED=true` (default off). `WIKI_QA_EXTRACT_LOG_FILE` defaults to `./logs/wiki-qa-extract.log`, with the existing daily rotation and no automatic deletion. The extraction file writes rendered prompt input and model output text, validation status, model, elapsed time and `actionRunId`; model failures write safe error codes, never raw exceptions or HTTP authorization data. Text is redacted for existing support markers and common embedded credential forms. These are diagnostic business records: restrict file access and manage retention; regex redaction is not exhaustive anonymization. Logging failure must not fail QA. Disabled logging must not create the dedicated sink. Historical input/output cannot be recovered from summary-only app logs. Rerank diagnostics have a separate `WIKI_QA_RERANK_LOG_ENABLED=true` switch (default off) and `WIKI_QA_RERANK_LOG_FILE` path (default `./logs/wiki-qa-rerank.log`). They capture the actual serialized request body for either general messages or dedicated query/documents, plus successful HTTP response text before parsing, so malformed outputs are retained. A failed event records safe errorCode/statusCode, including response-validation failures; an output event alone does not establish successful validation. Records include mode, configured model, actionRunId and elapsed time. They exclude request URLs/headers and HTTP error bodies, share extraction text redaction and failure isolation, and are independent of the answer-stage sink. Answer generation diagnostics use `WIKI_QA_ANSWER_LOG_ENABLED=true` (default off) and `WIKI_QA_ANSWER_LOG_FILE` (default `./logs/wiki-qa-answer.log`, daily rotation). They record the rendered answer prompt and model text returned by the shared completion client, model, duration and actionRunId; this is not a raw HTTP transport trace. Output `valid` describes JSON/schema validation only; later citation validation failures have a separate `failed` event. Invalid JSON is retained with valid=false when returned by the completion client. Provider failures record a safe errorCode, without raw errors or invented output. Answer logs share existing redaction and failure isolation; disabled logging creates no sink.

Kimi and Hermes share the TS ACP client; Hermes starts the official `python -m acp_adapter` without a production patch/launcher dependency. Persist provider and full native session ID separately from Octo's public ID before prompting. Restore using saved metadata; infer the legacy provider only when metadata is absent, and never strip an old Hermes native ID. Kimi export recovery receives only Kimi native IDs.

Hermes uses native risk approvals for commands and other non-preapproved operations. Do not auto-allow a request based on its Bash/Terminal title, or claim client capability flags constrain native tools. A Hermes `patch`/`write_file` request may receive automatic `allow_once` only when its structured `rawInput` names the supported edit tool, its single ACP diff agrees with the path and write payload, the final UTF-8 content is no larger than 256 KiB, and the existing versioned action/profile policy accepts the canonical path; replace patches must also still match the source content used to build the diff. Unverifiable patch modes and all out-of-policy edits continue through native approval. The shared service binds operator, public/native session, action run, request ID and native options. Interactive replies wait at most 50 seconds, below the verified native 60-second timeout. Explicit run cancellation and expiry clear pending requests. Request-bound ACP endpoints also cancel on disconnection; FE Ticket/Sprint streams only detach their observer on disconnection, so their interactive approvals remain pending until reply, cancellation or expiry. Background denial must cancel the run, persist a permission configuration failure and suppress later successful completion. Terminal and `execute_code` filesystem effects remain outside this edit auto-approval boundary.

FE Ticket/Sprint AI runs belong to the Server, independently of a drawer or HTTP connection. Their list/load APIs expose scoped run state and buffered history while the native runtime is busy; stop requires the current Web identity, full business reference and exact runId. A late stop cannot target a later turn. Only publish done after the business service, including postprocessing, succeeds. Native Session history remains durable; process-local run snapshots and browser reconnection do not promise automatic continuation after Server restart. See [FE AI Session lifecycle](../../tasks/acp/2026-09-06-fe-ai-session-lifecycle-discussion.md).

Ticket Quick Actions require source fields and a complete, nonempty fixed chat snapshot before calling the provider; Answer also requires the approved-knowledge query to succeed (zero hits is valid). Record history does not prove record comments were retrieved. Material failures prevent result acceptance. The first-Terminal-fetch instruction and operation-audit completion gate are removed; Kimi audit remains diagnostic. Effect drafts still require human confirmation and Server write/readback.

Support-QA Document also permits the fixed read-only `python3 -B docs/llm-wiki/scripts/entity-maintenance.py plan|check [--entity entities/...md ...] --json` command through the Kimi argv guard. The executable and script resolve through trusted paths; Answer, arbitrary scripts, root overrides, apply flags and shell composition remain denied. The external wiki SCHEMA and write-support-qa Skill define batch-end entity reconciliation and semantic review. Suggested blocks are applied through existing guarded file writes; this command neither grants cross-Ticket evidence access nor creates a Server-enforced completion gate. Hermes native terminal approval remains governed by its existing permission flow.

Partial success rules:

| Case | Required response detail |
| --- | --- |
| Meegle created but Lark writeback failed | include workitem id/link, failed stage, retry guidance |
| Lark updated but Meegle status update failed | include `larkBaseUpdated: true`, failed Meegle stage |
| message sent but reaction failed | include separate result flags |

### ACP-backed one-shot workflow rules

ACP-backed action workflows that only need one model turn, such as Meegle Story 研发Review, should run as controlled one-shot tasks rather than reusable chat sessions.

Rules:

1. Use a one-shot ACP helper that creates a runtime, runs one prompt, and closes the runtime in `finally`.
2. Do not register one-shot sessions in the reusable session registry.
3. Do not claim one-shot sessions in the ACP session ownership store.
4. Put workflow-specific concurrency limits in the owning application service, not in the extension.
5. Enforce a workflow timeout with `AbortSignal`; timeout must return a typed error and must not write platform data.
6. Limit rejection must happen before starting ACP and before platform writeback.
7. Successful one-shot workflows may emit ACP session events internally, but the session id is diagnostic only and must not be presented as a resumable chat session.
8. Workflow prompts that need operational tuning should live in PostgreSQL `workflow_prompts`, keyed by a stable `key` and documented with `note`.

Recommended one-shot ACP error codes:

| Error code | Stage | Meaning |
| --- | --- | --- |
| `ACP_CONCURRENCY_LIMITED` | `adapter.acp.queue` | workflow-specific ACP concurrency limit is full |
| `ACP_ANALYSIS_TIMEOUT` | `adapter.acp.prompt` | ACP prompt exceeded workflow timeout |
| `ACP_INITIALIZE_TIMEOUT` | `adapter.acp.initialize` | ACP process did not initialize in time |
| `ACP_PROCESS_EXITED` | `adapter.acp.process` | ACP subprocess exited before or during an operation |

Config defaults should be documented near the workflow service. For Meegle Story 研发Review, current defaults are `STORY_PRD_TO_SIMPLIFIED_ACP_CONCURRENCY_LIMIT=3` and `STORY_PRD_TO_SIMPLIFIED_ACP_TIMEOUT_MS=110000`.

The Meegle Story 研发Review prompt key is `meegle.story.prd_to_simplified`; the table row should keep a human-readable `note` explaining ownership or usage.

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
| `storySummary` | Meegle Story 研发Review输入 |
| `techSummary` | Meegle Story 研发Review覆盖写回 |
| `analysisSummary` | Lark Bug 分析摘要写回，Meegle input 时写回 Meegle Production Bug 字段 |

## 10. Config And Mapping Rules

1. Page/action catalog belongs in server config/controller/service.
2. Lark issue type -> Meegle workitem type mapping belongs in server config.
3. Workitem type/template mapping should be config-driven where possible.
4. Environment defaults are allowed, but must be documented and testable.
5. New database schema/store design is PostgreSQL-only; do not add new SQLite mirror schemas, stores, or compatibility branches.
6. Existing SQLite import code is legacy migration tooling, not a design target for new persistence.
7. If mapping affects platform writes, add fixture or unit test.
8. Do not duplicate the same mapping in extension and server.

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
2. Logs for new or refactored action workflows include `actionRunId`.
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
3. For new or refactored cross-layer actions, does the workflow accept/pass `actionRunId`?
4. Are errors typed and layer/stage-specific?
5. Are Meegle fields semantic or centrally resolved?
6. Are platform errors preserved as safe summaries?
7. Are partial success states explicit?
8. Are tests at the correct layer?
9. Did the change avoid `console.log`?


Wiki answer input uses a separate context: retain solution/status/business line/tags, omit management and attachment objects, keep up to three consecutive stack frames per error/cause, and remove standalone greetings only when no retained message references them. Original snapshots, extraction, Summary and ACP contexts remain intact. English matching uses stopwords and whole tokens; maintenance and resolution-template sections are omitted. Reranking receives up to10 recalled candidates and returns up to5 (`top_n=min(5, candidate count)` in dedicated mode). After reranking, keep only cards matching the specific error cause (when present) or a meaningful query term in title/knowledge/source text; take the first3 surviving cards in rank order and renumber citations. Ranks4/5 can fill positions left by filtered cards. Dedicated rerank applies `WIKI_QA_RERANK_MIN_SCORE` (default0.7, inclusive, configurable0..1) to Top5 before the relevance checks and final three-card limit. General mode has no numeric scores and ignores this setting. Invalid configured values fail the dedicated rerank stage. Logs retain raw provider scores and add a safe threshold/received/accepted-count event. The default is an initial cutoff, not a calibrated probability or relevance guarantee. This is conservative lexical filtering, not proof of applicability: equivalent wording can be missed, and matched historical evidence still requires prerequisites.

`WIKI_QA_ANSWER_REASONING_EFFORT=low|high|max|provider` defaults to low; provider omits the parameter. Wiki extraction and answer share this existing setting; reranking stays independently configured, and only the ZCode adapter for glm-5.3 / glm-5.3-flash sends it. Other providers/models keep their request parameters. Invalid values fail the requesting phase; no silent fallback. Answer traces add prompt/output character counts and optional numeric diagnostics (provider token usage, including reasoning tokens when available, responseHeadersMs and totalMs). Response-header time is not first-token time; absent usage is not estimated. ZCode transport failures log only allowlisted cause codes alongside actionRunId in app logs, never raw error/cause or reasoning text. No new timeout or retry policy is introduced.


Wiki extraction validates every keyword as a nonempty trimmed string of at most120 characters, then deduplicates case-insensitively in original order and keeps the first20. Distinct synonyms remain. Invalid elements beyond position20 still fail validation; other fields retain strict validation. Extraction traces retain the original model output; `valid` reflects acceptance after keyword normalization. Default extraction prompts request important terms first; database prompt overrides remain untouched.
