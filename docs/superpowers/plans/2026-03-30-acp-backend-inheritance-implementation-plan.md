# ACP Backend Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend ACP facade for PM analysis first, wrapping the existing legacy `pm-analysis.run` capability so we can validate session, follow-up, and streaming contracts before touching popup UI.

**Architecture:** Keep [`server/src/application/services/pm-analysis.service.ts`](../../../server/src/application/services/pm-analysis.service.ts) as the pure analysis engine and add a thin ACP facade around it. The new facade owns session lifecycle, rules-based follow-up, and SSE event ordering through a `SessionStore` abstraction so Redis can stay a pluggable persistence detail instead of leaking into business logic.

**Tech Stack:** TypeScript, Express 5, Zod, Vitest, Redis adapter, Server-Sent Events

---

## File Structure

This plan intentionally stops at the backend checkpoint. It does not touch popup UI or extension stream parsing yet.

### Create

- `server/src/modules/acp-pm-analysis/acp-pm-analysis.dto.ts`
  - ACP PM analysis request schema, session schema, event payload schema/types
- `server/src/modules/acp-pm-analysis/event-stream.ts`
  - Minimal SSE frame writer helpers shared by controller tests and runtime
- `server/src/adapters/acp/session-store.ts`
  - `SessionStore` interface and ACP session model
- `server/src/adapters/acp/in-memory-session-store.ts`
  - Test-friendly `SessionStore` implementation for service/controller coverage
- `server/src/adapters/acp/redis-session-store.ts`
  - Redis-backed `SessionStore` implementation for production wiring
- `server/src/application/services/pm-analysis-followup.service.ts`
  - Rules-based follow-up answer generation using a stored PM analysis snapshot
- `server/src/application/services/acp-pm-analysis.service.ts`
  - ACP facade service that wraps `runPMAnalysis()`, creates/loads sessions, and emits ordered ACP events
- `server/src/modules/acp-pm-analysis/acp-pm-analysis.controller.ts`
  - SSE controller that validates input, delegates to ACP service, and writes event frames
- `server/tests/acp-pm-analysis.dto.test.ts`
  - Contract coverage for request/session/event parsing
- `server/tests/acp-session-store.test.ts`
  - Contract tests shared by the in-memory and Redis-facing store behavior
- `server/tests/pm-analysis-followup.service.test.ts`
  - Follow-up behavior coverage for blocker/stale/unsupported prompts
- `server/tests/acp-pm-analysis.service.test.ts`
  - First-question vs follow-up orchestration coverage
- `server/tests/acp-pm-analysis.controller.test.ts`
  - Event streaming coverage using a mocked Express `Response`

### Modify

- `server/src/index.ts`
  - Register the ACP streaming route without the JSON `handleController()` wrapper
- `server/package.json`
  - Add the Redis runtime dependency if it is not already present
- `server/.env.example`
  - Document ACP Redis configuration
- `server/README.md`
  - Add ACP backend route and smoke-test instructions
- `docs/tenways-octo/17-acp-design.md`
  - Sync the implementation order with the backend-first checkpoint
- `docs/tenways-octo/14-v2-architecture-design.md`
  - Sync the recommended rollout order with the backend-first checkpoint

## Task 1: Lock the ACP request/session/event contract

**Files:**
- Create: `server/src/modules/acp-pm-analysis/acp-pm-analysis.dto.ts`
- Create: `server/src/modules/acp-pm-analysis/event-stream.ts`
- Test: `server/tests/acp-pm-analysis.dto.test.ts`
- Docs: `docs/tenways-octo/17-acp-design.md`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";
import {
  acpPMAnalysisChatRequestSchema,
  acpSessionCreatedEventSchema,
} from "../src/modules/acp-pm-analysis/acp-pm-analysis.dto";

describe("acp-pm-analysis dto", () => {
  it("accepts a first-question request", () => {
    const parsed = acpPMAnalysisChatRequestSchema.parse({
      operatorLarkId: "ou_xxx",
      projectKeys: ["PROJ1"],
      timeWindowDays: 14,
      message: "先给我分析当前项目风险",
    });

    expect(parsed.sessionId).toBeUndefined();
    expect(parsed.timeWindowDays).toBe(14);
  });

  it("shapes session.created payloads", () => {
    expect(
      acpSessionCreatedEventSchema.parse({ sessionId: "sess_pm_001" }),
    ).toEqual({ sessionId: "sess_pm_001" });
  });
});
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `cd server && npm test -- tests/acp-pm-analysis.dto.test.ts`
Expected: FAIL because the ACP DTO module does not exist yet

- [ ] **Step 3: Implement the minimal contract layer**

Create:
- `acpPMAnalysisChatRequestSchema`
- ACP session snapshot types
- event payload schemas/types for `session.created`, `analysis.started`, `analysis.progress`, `analysis.result`, `followup.result`, `error`, `done`
- a tiny `formatSseEvent(name, payload)` helper returning a compliant SSE frame string

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `cd server && npm test -- tests/acp-pm-analysis.dto.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/acp-pm-analysis server/tests/acp-pm-analysis.dto.test.ts
git commit -m "add acp pm analysis contract types"
```

## Task 2: Add the session-store abstraction before any Redis wiring

**Files:**
- Create: `server/src/adapters/acp/session-store.ts`
- Create: `server/src/adapters/acp/in-memory-session-store.ts`
- Test: `server/tests/acp-session-store.test.ts`
- Docs: `docs/tenways-octo/17-acp-design.md`

- [ ] **Step 1: Write the failing session-store contract test**

```ts
import { describe, expect, it } from "vitest";
import { InMemorySessionStore } from "../src/adapters/acp/in-memory-session-store";

describe("InMemorySessionStore", () => {
  it("creates and reloads a session snapshot", async () => {
    const store = new InMemorySessionStore();

    await store.save({
      sessionId: "sess_pm_001",
      operatorLarkId: "ou_xxx",
      projectKeys: ["PROJ1"],
      timeWindowDays: 14,
      analysisSnapshot: null,
      messageHistory: [],
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    });

    await expect(store.get("sess_pm_001")).resolves.toMatchObject({
      sessionId: "sess_pm_001",
      operatorLarkId: "ou_xxx",
    });
  });
});
```

- [ ] **Step 2: Run the session-store test to verify it fails**

Run: `cd server && npm test -- tests/acp-session-store.test.ts`
Expected: FAIL because the ACP session store files do not exist yet

- [ ] **Step 3: Implement the abstraction and test double**

Define:
- `ACPSessionRecord`
- a lookup shape or typed store error that lets the ACP facade distinguish `missing` from `expired`
- `SessionStore` methods for `create()`, `get()`, `save()`, `refreshTtl()`, `delete()`
- in-memory implementation used only by unit tests and local orchestration tests

Keep TTL as part of the interface so the ACP service never knows whether persistence is Redis or fake.

- [ ] **Step 4: Run the session-store test to verify it passes**

Run: `cd server && npm test -- tests/acp-session-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/adapters/acp server/tests/acp-session-store.test.ts
git commit -m "add acp session store abstraction"
```

## Task 3: Build the rules-based follow-up service on top of the existing PM analysis result

**Files:**
- Create: `server/src/application/services/pm-analysis-followup.service.ts`
- Test: `server/tests/pm-analysis-followup.service.test.ts`
- Docs: `docs/tenways-octo/17-acp-design.md`

- [ ] **Step 1: Write the failing follow-up test**

```ts
import { describe, expect, it } from "vitest";
import { answerPMAnalysisFollowup } from "../src/application/services/pm-analysis-followup.service";

describe("answerPMAnalysisFollowup", () => {
  it("answers blocker prioritization using the stored snapshot", async () => {
    await expect(
      answerPMAnalysisFollowup({
        message: "哪些 blocker 最需要今天推进？",
        analysisSnapshot: {
          blockers: [
            { id: "B2-1", projectKey: "PROJ1", status: "blocked", ageDays: 11 },
          ],
          staleItems: [],
          missingDescriptionItems: [],
          suggestedActions: ["1 个阻塞项需要优先跟进"],
          summary: "发现 1 个阻塞项",
          totals: {
            staleA1Count: 0,
            staleBItemsCount: 0,
            pendingA2Count: 0,
            reviewPendingPrCount: 0,
          },
          items: {
            staleA1: [],
            staleBItems: [],
            pendingA2: [],
            reviewPendingPrs: [],
          },
        },
      }),
    ).resolves.toMatchObject({
      basedOn: expect.arrayContaining(["blockers"]),
    });
  });
});
```

- [ ] **Step 2: Run the follow-up test to verify it fails**

Run: `cd server && npm test -- tests/pm-analysis-followup.service.test.ts`
Expected: FAIL because the follow-up service does not exist yet

- [ ] **Step 3: Implement the minimal rules-based follow-up**

Support these prompt families first:
- blocker priority
- stale-item recap
- suggested next actions

Return a structured payload like:

```ts
{
  answer: "优先推进 ...",
  basedOn: ["blockers", "suggestedActions"],
}
```

For unsupported prompts, throw or return a typed ACP error that the facade can translate to `ACP_UNSUPPORTED_FOLLOWUP`.

- [ ] **Step 4: Run the follow-up test to verify it passes**

Run: `cd server && npm test -- tests/pm-analysis-followup.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/application/services/pm-analysis-followup.service.ts server/tests/pm-analysis-followup.service.test.ts
git commit -m "add rules based pm analysis followup"
```

## Task 4: Add the ACP facade service that inherits the legacy PM analysis flow

**Files:**
- Create: `server/src/application/services/acp-pm-analysis.service.ts`
- Test: `server/tests/acp-pm-analysis.service.test.ts`
- Reference: `server/src/application/services/pm-analysis.service.ts`
- Reference: `server/src/application/services/pm-analysis-followup.service.ts`
- Reference: `server/src/adapters/acp/session-store.ts`

- [ ] **Step 1: Write the failing orchestration test**

```ts
import { describe, expect, it } from "vitest";
import { InMemorySessionStore } from "../src/adapters/acp/in-memory-session-store";
import { runAcpPmAnalysisChat } from "../src/application/services/acp-pm-analysis.service";

describe("runAcpPmAnalysisChat", () => {
  it("creates a session and emits analysis events for the first question", async () => {
    const store = new InMemorySessionStore();

    const events = await runAcpPmAnalysisChat(
      {
        operatorLarkId: "ou_xxx",
        projectKeys: ["PROJ1"],
        message: "先给我分析当前项目风险",
      },
      { sessionStore: store },
    );

    expect(events.map((event) => event.type)).toEqual([
      "session.created",
      "analysis.started",
      "analysis.progress",
      "analysis.result",
      "done",
    ]);
  });

  it("reuses an existing session for follow-up and emits followup.result", async () => {
    const store = new InMemorySessionStore();

    const firstTurn = await runAcpPmAnalysisChat(
      {
        operatorLarkId: "ou_xxx",
        projectKeys: ["PROJ1"],
        timeWindowDays: 14,
        message: "先给我分析当前项目风险",
      },
      { sessionStore: store },
    );

    const sessionId = firstTurn.find((event) => event.type === "session.created")?.data.sessionId;

    const secondTurn = await runAcpPmAnalysisChat(
      {
        sessionId,
        operatorLarkId: "ou_xxx",
        projectKeys: ["PROJ1"],
        timeWindowDays: 14,
        message: "哪些 blocker 最需要今天推进？",
      },
      { sessionStore: store },
    );

    expect(secondTurn.map((event) => event.type)).toContain("followup.result");
  });

  it("returns ACP_SESSION_NOT_FOUND when the session does not exist", async () => {
    const store = new InMemorySessionStore();

    const events = await runAcpPmAnalysisChat(
      {
        sessionId: "sess_missing",
        operatorLarkId: "ou_xxx",
        projectKeys: ["PROJ1"],
        timeWindowDays: 14,
        message: "哪些 blocker 最需要今天推进？",
      },
      { sessionStore: store },
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        data: expect.objectContaining({
          errorCode: "ACP_SESSION_NOT_FOUND",
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run the orchestration test to verify it fails**

Run: `cd server && npm test -- tests/acp-pm-analysis.service.test.ts`
Expected: FAIL because the ACP facade service does not exist yet

- [ ] **Step 3: Implement the facade service**

Implementation rules:
- first question without `sessionId` creates a new session and calls `runPMAnalysis()`
- follow-up with `sessionId` reloads the stored snapshot and calls `answerPMAnalysisFollowup()`
- missing or expired sessions become typed ACP error events, not generic thrown 500s
- refresh TTL after successful follow-up
- never move PM-analysis-specific rules into the generic session store
- keep the returned event sequence deterministic so controller tests do not need timing hacks

It is acceptable for the service to return an ordered `ACPEvent[]` in V1. The controller can stream that array as SSE frames without introducing a more complex async generator yet.

- [ ] **Step 4: Run the orchestration test to verify it passes**

Run: `cd server && npm test -- tests/acp-pm-analysis.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/application/services/acp-pm-analysis.service.ts server/tests/acp-pm-analysis.service.test.ts
git commit -m "add pm analysis acp facade service"
```

## Task 5: Expose the backend ACP route as SSE and keep legacy JSON routes untouched

**Files:**
- Create: `server/src/modules/acp-pm-analysis/acp-pm-analysis.controller.ts`
- Modify: `server/src/index.ts`
- Test: `server/tests/acp-pm-analysis.controller.test.ts`
- Reference: `server/src/modules/acp-pm-analysis/event-stream.ts`

- [ ] **Step 1: Write the failing controller test**

```ts
import { describe, expect, it, vi } from "vitest";
import { streamAcpPmAnalysisChatController } from "../src/modules/acp-pm-analysis/acp-pm-analysis.controller";

describe("streamAcpPmAnalysisChatController", () => {
  it("writes event-stream frames in order", async () => {
    const writes: string[] = [];
    const res = {
      setHeader: vi.fn(),
      write: vi.fn((chunk: string) => writes.push(chunk)),
      end: vi.fn(),
    };

    await streamAcpPmAnalysisChatController(
      {
        body: {
          operatorLarkId: "ou_xxx",
          projectKeys: ["PROJ1"],
          message: "先给我分析当前项目风险",
        },
      } as never,
      res as never,
    );

    expect(writes.join("")).toContain("event: session.created");
    expect(writes.join("")).toContain("event: analysis.result");
  });
});
```

- [ ] **Step 2: Run the controller test to verify it fails**

Run: `cd server && npm test -- tests/acp-pm-analysis.controller.test.ts`
Expected: FAIL because the controller does not exist yet

- [ ] **Step 3: Implement the streaming controller and route**

Requirements:
- validate request with the ACP DTO before any write
- set `Content-Type: text/event-stream`
- stream events returned by the ACP facade service using `formatSseEvent()`
- bypass `handleController()` in [`server/src/index.ts`](../../../server/src/index.ts) because that wrapper always serializes JSON
- leave `POST /api/pm/analysis/run` unchanged as the legacy baseline

- [ ] **Step 4: Run the controller test to verify it passes**

Run: `cd server && npm test -- tests/acp-pm-analysis.controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/acp-pm-analysis/acp-pm-analysis.controller.ts server/src/index.ts server/tests/acp-pm-analysis.controller.test.ts
git commit -m "add acp pm analysis sse route"
```

## Task 6: Wire Redis persistence and stop at a backend review checkpoint

**Files:**
- Create: `server/src/adapters/acp/redis-session-store.ts`
- Modify: `server/package.json`
- Modify: `server/.env.example`
- Modify: `server/README.md`
- Modify: `server/src/application/services/acp-pm-analysis.service.ts`
- Modify: `server/src/modules/acp-pm-analysis/acp-pm-analysis.controller.ts`
- Modify: `server/src/index.ts`
- Test: `server/tests/acp-session-store.test.ts`

- [ ] **Step 1: Extend the failing session-store test with TTL behavior**

Add assertions that:
- `refreshTtl()` is called after a successful follow-up path
- the Redis-backed store serializes/deserializes the same session shape as the in-memory store
- an expired session path can still be translated to `ACP_SESSION_EXPIRED` in the ACP facade tests, either through a lookup result or a typed store error

If a real Redis server is not available in CI, inject a tiny fake Redis client into `RedisSessionStore` so the serialization and TTL contract can still be tested.

- [ ] **Step 2: Run the session-store suite to verify the new assertions fail**

Run: `cd server && npm test -- tests/acp-session-store.test.ts tests/acp-pm-analysis.service.test.ts`
Expected: FAIL because the Redis-backed implementation and TTL refresh path are not wired yet

- [ ] **Step 3: Implement Redis wiring**

Add:
- Redis client dependency in `server/package.json`
- `REDIS_URL`
- `ACP_SESSION_TTL_SECONDS`

Make the dependency plumbing explicit:
- export `configureAcpPmAnalysisServiceDeps({ sessionStore, sessionTtlSeconds })` from `acp-pm-analysis.service.ts`
- let `acp-pm-analysis.controller.ts` call the service with those configured defaults, while still allowing test overrides
- in [`server/src/index.ts`](../../../server/src/index.ts), choose `new RedisSessionStore(...)` when `REDIS_URL` exists
- when `REDIS_URL` is absent, fall back to `new InMemorySessionStore()` with a startup warning so local development is still usable

This keeps the repo aligned with the existing module-level configuration style instead of inventing a second DI pattern only for ACP.

- [ ] **Step 4: Run the backend ACP test suite**

Run:

```bash
cd server && npm test -- \
  tests/acp-pm-analysis.dto.test.ts \
  tests/acp-session-store.test.ts \
  tests/pm-analysis-followup.service.test.ts \
  tests/acp-pm-analysis.service.test.ts \
  tests/acp-pm-analysis.controller.test.ts \
  tests/pm-analysis.service.test.ts
```

Expected: PASS, including the legacy PM analysis suite

- [ ] **Step 5: Smoke-test the streaming route manually**

Run:

```bash
cd server && npm run dev
```

In another terminal:

```bash
curl -N -X POST http://localhost:3000/api/acp/pm-analysis/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "operatorLarkId":"ou_xxx",
    "projectKeys":["PROJ1"],
    "timeWindowDays":14,
    "message":"先给我分析当前项目风险"
  }'
```

Expected:
- the stream begins with `event: session.created`
- later includes `event: analysis.result`
- ends with `event: done`

Then restart the server and reuse the returned `sessionId`:

```bash
curl -N -X POST http://localhost:3000/api/acp/pm-analysis/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId":"<session_from_first_turn>",
    "operatorLarkId":"ou_xxx",
    "projectKeys":["PROJ1"],
    "timeWindowDays":14,
    "message":"哪些 blocker 最需要今天推进？"
  }'
```

Expected:
- the second stream includes `event: followup.result`
- no new `session.created` event is emitted
- the request still succeeds after the server restart as long as the Redis TTL has not expired

- [ ] **Step 6: Commit**

```bash
git add server/src/adapters/acp/redis-session-store.ts server/package.json server/.env.example server/README.md server/tests/acp-session-store.test.ts server/tests/acp-pm-analysis.service.test.ts
git commit -m "wire redis backed acp sessions"
```

## Parallel Track: Validate configurable Kimi ACP startup from Node

This is a parallel validation track. It does not change the PM Analysis ACP V1 scope, sequence, or backend contract. Use it to prove that a Node/TypeScript ACP client can launch `kimi acp`, complete the baseline ACP flow, and make the subprocess startup configurable before any backend bridge work begins.

Goals:
- verify a minimal Node/TypeScript ESM client can launch local `kimi acp`
- verify the baseline ACP flow: `initialize` -> `session/new` -> `session/prompt`
- make the `kimi acp` startup shape configurable through environment variables

Boundaries:
- do not implement an Express bridge yet
- do not wire the extension or popup yet
- do not implement frontend broadcast/routing yet
- do not treat Kimi ACP as part of the PM Analysis ACP V1 scope

Suggested files:
- `server/examples/kimi-acp-client/`
  - keep this as an isolated experiment directory for the validation script and notes
  - do not expand it into production backend code in this plan

Config surface:
- `KIMI_ACP_COMMAND`
- `KIMI_ACP_ARGS_JSON`
- `KIMI_ACP_ENV_JSON`

Default values:
- `KIMI_ACP_COMMAND=kimi`
- `KIMI_ACP_ARGS_JSON=["acp"]`
- `KIMI_ACP_ENV_JSON={}`

Implementation constraints:
- only use `spawn(command, args, { env })`; do not use a shell string
- `args` must parse as a JSON array of strings
- `env` must parse as a JSON object of string pairs
- runtime requests must not override `command`, `args`, or `env`

### Task 7: Validate configurable Kimi ACP startup from Node

**Files:**
- Create: `server/examples/kimi-acp-client/client.ts`
- Modify: `server/package.json`
- Docs: `server/examples/kimi-acp-client/README.md`

- [x] **Step 1: Write the minimal validation script requirements**

Capture the exact validation target in comments or notes before writing code:
- launch `kimi acp` from a Node/TypeScript ESM script
- connect using `@agentclientprotocol/sdk`
- complete `initialize`
- create a new session via `session/new`
- send one prompt via `session/prompt`
- print streamed updates and the final stop reason

- [x] **Step 2: Install and confirm `@agentclientprotocol/sdk`**

Add the ACP TypeScript SDK to the Node workspace that will host the experiment and confirm the package can be imported from a TypeScript ESM script.

- [x] **Step 3: Launch `kimi acp` with configurable startup values**

Read:
- `KIMI_ACP_COMMAND`
- `KIMI_ACP_ARGS_JSON`
- `KIMI_ACP_ENV_JSON`

Then launch the subprocess with:

```ts
spawn(command, args, { env })
```

Validation rules:
- fail fast before launch if `KIMI_ACP_ARGS_JSON` is not valid JSON array input
- fail fast before launch if `KIMI_ACP_ENV_JSON` is not valid JSON object input
- merge `process.env` with the parsed ACP env overrides

- [x] **Step 4: Complete ACP initialization**

Use the SDK client connection to:
- connect over stdio
- send `initialize`
- print the negotiated protocol version and capabilities

- [x] **Step 5: Complete `session/new`**

Create one ACP session and print the returned `sessionId`.

- [x] **Step 6: Complete `session/prompt`**

Send one simple prompt against the created session and wait for the turn to finish.

- [x] **Step 7: Print streamed updates and the final stop reason**

At minimum, print:
- content updates as they arrive
- tool or approval events if Kimi emits them
- final stop reason for the completed prompt turn

- [x] **Step 8: Verify subprocess cleanup**

Ensure the script kills or releases the `kimi acp` subprocess on:
- normal exit
- initialization failure
- uncaught exception
- `SIGINT`

- [x] **Step 9: Verify env-based overrides**

Run the script with:
- default values
- an absolute `KIMI_ACP_COMMAND`
- custom `KIMI_ACP_ARGS_JSON`
- custom `KIMI_ACP_ENV_JSON`

Confirm all overrides are honored without changing source code.

- [x] **Step 10: Record troubleshooting notes**

Document at least these failure cases:
- default config cannot find `kimi`
- `initialize` fails
- `session/new` fails
- `session/prompt` emits no streamed updates
- invalid `KIMI_ACP_ARGS_JSON`
- invalid `KIMI_ACP_ENV_JSON`
- Node exits but leaves an orphan subprocess

Validation cases that must pass:
- default config can launch `kimi acp` when incompatible shell proxy variables are not injected
- `initialize` returns protocol version and capabilities
- `session/new` returns a `sessionId`
- `session/prompt` produces streamed updates
- overriding `KIMI_ACP_COMMAND` with an absolute path still works
- invalid `KIMI_ACP_ARGS_JSON` fails before launch
- invalid `KIMI_ACP_ENV_JSON` fails before launch
- missing `kimi` binary returns a clear startup error
- Node exit leaves no orphan subprocess

## Backend Checkpoint Exit Criteria

Do not start popup integration until all of these are true:

- `POST /api/acp/pm-analysis/chat` works end-to-end from `curl`
- first question and follow-up both produce the documented event order
- Redis-backed sessions survive a server restart within TTL
- legacy `POST /api/pm/analysis/run` still passes its existing test suite unchanged
- the service/test surface feels stable enough that the popup can consume it without inventing new server contracts

## Follow-up Planning Note

Once this backend checkpoint is green, write a separate popup plan for:

- `extension/src/types/acp-pm-analysis.ts`
- `extension/src/popup/pm-analysis-chat.ts`
- `extension/src/popup` integration and stream parsing

That second plan should treat the backend SSE contract as fixed unless the backend checkpoint reveals a real usability issue.
