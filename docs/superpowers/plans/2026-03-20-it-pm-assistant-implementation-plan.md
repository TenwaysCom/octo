# Tenways Octo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shippable version of the Tenways Octo covering Meegle auth bridge, A1 -> B2, A2 -> B1, and PM instant analysis.

**Architecture:** The implementation is split into a Chromium extension and a TypeScript backend. The extension handles page detection, UI, and the Meegle auth bridge; the backend handles identity resolution, Meegle token lifecycle, A1/A2 workflow orchestration, PM analysis, and schema validation.

**Tech Stack:** TypeScript, Chromium Extension (MV3), Node.js backend, schema validation layer, test runner for extension/server modules

---

## File Structure

Assumption: the production code has not been scaffolded yet. This plan creates two top-level runtime modules under the repo:

- `extension/` for browser-side code
- `server/` for backend code

All file paths and commands below are expressed relative to the repository root so the plan remains valid even if the workspace directory is renamed.

Recommended file ownership:

- `extension/src/types/*` defines protocol contracts and shared extension models
- `extension/src/background/*` routes actions and calls backend APIs
- `extension/src/page-bridge/*` runs same-page auth bridge logic
- `server/src/modules/*` owns HTTP endpoints per business domain
- `server/src/application/services/*` owns cross-module workflow orchestration
- `server/src/adapters/*` owns platform API interactions
- `server/src/validators/*` owns DTO and agent-output validation

### Task 1: Scaffold Extension Protocol Layer

**Files:**
- Create: `extension/src/types/protocol.ts`
- Create: `extension/src/types/context.ts`
- Create: `extension/src/types/meegle.ts`
- Test: `extension/tests/protocol.test.ts`
- Docs: `docs/it-pm-assistant/11-extension-message-and-api-schema.md`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { protocolActions } from "../src/types/protocol";

describe("protocolActions", () => {
  it("includes the Meegle auth ensure action", () => {
    expect(protocolActions).toContain("itdog.meegle.auth.ensure");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension test tests/protocol.test.ts`
Expected: FAIL because `protocol.ts` does not exist yet

- [ ] **Step 3: Write minimal implementation**

Create the shared protocol/type files with:
- protocol action literals
- request/response envelope types
- `PageContext`
- `IdentityBinding`
- `MeegleAuthEnsureRequest`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension test tests/protocol.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/types extension/tests/protocol.test.ts
git commit -m "feat: add extension protocol types"
```

### Task 2: Build Extension Auth Bridge

**Files:**
- Create: `extension/src/background/router.ts`
- Create: `extension/src/background/handlers/meegle-auth.ts`
- Create: `extension/src/page-bridge/meegle-auth.ts`
- Test: `extension/tests/meegle-auth-handler.test.ts`
- Docs: `docs/it-pm-assistant/10-meegle-auth-bridge-design.md`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ensureMeegleAuth } from "../src/background/handlers/meegle-auth";

describe("ensureMeegleAuth", () => {
  it("returns require_auth_code when no reusable token exists", async () => {
    await expect(ensureMeegleAuth()).resolves.toMatchObject({
      status: "require_auth_code",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension test tests/meegle-auth-handler.test.ts`
Expected: FAIL because handler does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- Background router action dispatch
- `itdog.meegle.auth.ensure` handler
- Page bridge method for requesting `auth_code`
- A minimal in-memory auth flow result

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension test tests/meegle-auth-handler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/background extension/src/page-bridge extension/tests/meegle-auth-handler.test.ts
git commit -m "feat: add extension meegle auth bridge"
```

### Task 3: Scaffold Backend Identity and Auth Modules

**Files:**
- Create: `server/src/modules/identity/identity.controller.ts`
- Create: `server/src/modules/identity/identity.dto.ts`
- Create: `server/src/modules/meegle-auth/meegle-auth.controller.ts`
- Create: `server/src/modules/meegle-auth/meegle-auth.dto.ts`
- Create: `server/src/modules/meegle-auth/meegle-auth.service.ts`
- Create: `server/src/application/services/identity-resolution.service.ts`
- Create: `server/src/application/services/meegle-credential.service.ts`
- Test: `server/tests/meegle-auth.dto.test.ts`
- Docs: `docs/it-pm-assistant/13-code-structure-and-validation-design.md`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { validateMeegleAuthExchangeRequest } from "../src/modules/meegle-auth/meegle-auth.dto";

describe("validateMeegleAuthExchangeRequest", () => {
  it("rejects a request without authCode", () => {
    expect(() =>
      validateMeegleAuthExchangeRequest({
        requestId: "req-1",
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir server test tests/meegle-auth.dto.test.ts`
Expected: FAIL because DTO validator does not exist yet

- [ ] **Step 3: Write minimal implementation**

Create:
- DTO validators for identity/auth endpoints
- minimal controllers
- identity resolution and auth services with stubbed results

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir server test tests/meegle-auth.dto.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/identity server/src/modules/meegle-auth server/src/application/services server/tests/meegle-auth.dto.test.ts
git commit -m "feat: scaffold backend identity and auth modules"
```

### Task 4: Integrate Meegle Token Exchange and Refresh

**Files:**
- Create: `server/src/adapters/meegle/auth-adapter.ts`
- Create: `server/src/adapters/meegle/token-store.ts`
- Modify: `server/src/modules/meegle-auth/meegle-auth.service.ts`
- Test: `server/tests/meegle-auth.service.test.ts`
- Reference: `meegle_clients/clients/meegle_client.py`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { exchangeAuthCode } from "../src/modules/meegle-auth/meegle-auth.service";

describe("exchangeAuthCode", () => {
  it("returns ready when plugin token and auth code exchange succeeds", async () => {
    await expect(
      exchangeAuthCode({
        requestId: "req-1",
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        authCode: "auth-code",
        state: "state-1",
      }),
    ).resolves.toMatchObject({ tokenStatus: "ready" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir server test tests/meegle-auth.service.test.ts`
Expected: FAIL because Meegle auth exchange logic is not implemented yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- adapter wrapper around Meegle auth endpoints
- token store interface
- `auth exchange` and `refresh` flow
- normalized auth status response

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir server test tests/meegle-auth.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/adapters/meegle server/src/modules/meegle-auth/meegle-auth.service.ts server/tests/meegle-auth.service.test.ts
git commit -m "feat: implement meegle token exchange flow"
```

### Task 5: Implement A1 -> B2 Workflow

**Files:**
- Create: `server/src/modules/a1/a1.controller.ts`
- Create: `server/src/modules/a1/a1.dto.ts`
- Create: `server/src/application/services/a1-workflow.service.ts`
- Create: `server/src/validators/agent-output/execution-draft.ts`
- Test: `server/tests/a1-workflow.service.test.ts`
- Docs: `docs/it-pm-assistant/11-extension-message-and-api-schema.md`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { createB2Draft } from "../src/application/services/a1-workflow.service";

describe("createB2Draft", () => {
  it("returns a confirmable execution draft", async () => {
    await expect(createB2Draft({ recordId: "recA1_001" })).resolves.toMatchObject({
      needConfirm: true,
      draftType: "b2",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir server test tests/a1-workflow.service.test.ts`
Expected: FAIL because A1 workflow service does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- `a1/analyze`
- `a1/create-b2-draft`
- `a1/apply-b2`
- execution draft validation before adapter execution

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir server test tests/a1-workflow.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/a1 server/src/application/services/a1-workflow.service.ts server/src/validators/agent-output/execution-draft.ts server/tests/a1-workflow.service.test.ts
git commit -m "feat: add a1 to b2 workflow"
```

### Task 6: Implement A2 -> B1 Workflow

**Files:**
- Create: `server/src/modules/a2/a2.controller.ts`
- Create: `server/src/modules/a2/a2.dto.ts`
- Create: `server/src/application/services/a2-workflow.service.ts`
- Test: `server/tests/a2-workflow.service.test.ts`
- Reference: `docs/it-pm-assistant/03-prd.md`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { createB1Draft } from "../src/application/services/a2-workflow.service";

describe("createB1Draft", () => {
  it("returns a confirmable b1 draft", async () => {
    await expect(createB1Draft({ recordId: "recA2_001" })).resolves.toMatchObject({
      needConfirm: true,
      draftType: "b1",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir server test tests/a2-workflow.service.test.ts`
Expected: FAIL because A2 workflow service does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- `a2/analyze`
- `a2/create-b1-draft`
- `a2/apply-b1`
- shared draft/apply validation reuse from A1

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir server test tests/a2-workflow.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/a2 server/src/application/services/a2-workflow.service.ts server/tests/a2-workflow.service.test.ts
git commit -m "feat: add a2 to b1 workflow"
```

### Task 7: Implement PM Instant Analysis

**Files:**
- Create: `server/src/modules/pm-analysis/pm-analysis.controller.ts`
- Create: `server/src/modules/pm-analysis/pm-analysis.dto.ts`
- Create: `server/src/application/services/pm-analysis.service.ts`
- Test: `server/tests/pm-analysis.service.test.ts`
- Reference: `docs/it-pm-assistant/05-ai-agent-skill-design.md`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { runPMAnalysis } from "../src/application/services/pm-analysis.service";

describe("runPMAnalysis", () => {
  it("returns a structured analysis report", async () => {
    await expect(runPMAnalysis({ projectKeys: ["PROJ1"] })).resolves.toHaveProperty(
      "summary",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir server test tests/pm-analysis.service.test.ts`
Expected: FAIL because PM analysis service does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- DTO and controller for PM analysis
- service that aggregates Lark / Meegle / GitHub reads
- structured `AnalysisReport` output

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir server test tests/pm-analysis.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/pm-analysis server/src/application/services/pm-analysis.service.ts server/tests/pm-analysis.service.test.ts
git commit -m "feat: add pm analysis workflow"
```

### Task 8: Optimize PM Analysis Skills and Prompts Across 3 Rounds

**Files:**
- Modify: `server/src/application/services/pm-analysis.service.ts`
- Modify: `docs/it-pm-assistant/05-ai-agent-skill-design.md`
- Create: `server/tests/pm-analysis.prompt-iteration.test.ts`
- Create: `server/tests/fixtures/pm-analysis/cases.json`
- Create: `docs/it-pm-assistant/14-pm-analysis-prompt-iteration-log.md`
- Reference: `docs/it-pm-assistant/07-phase-1-rollout.md`

- [ ] **Step 1: Build the baseline test harness**

Create a repeatable test harness for PM analysis prompt evaluation with:
- fixed multi-platform sample inputs
- expected blocker / stale / missing-description outcomes
- a score sheet for completeness, actionability, evidence-grounding, and noise

Suggested initial test command:

Run: `pnpm --dir server test tests/pm-analysis.prompt-iteration.test.ts`
Expected: FAIL because the prompt iteration harness and fixtures do not exist yet

- [ ] **Step 2: Run baseline and record round 1 starting point**

Before changing prompt or skills:
- run the baseline PM analysis prompt against the fixed sample set
- write the baseline outputs and observed issues into `docs/it-pm-assistant/14-pm-analysis-prompt-iteration-log.md`
- explicitly identify the `round 1` optimization theme from test results

Round 1 focus:
- improve result completeness
- reduce missed blockers / stale items / description gaps

- [ ] **Step 3: Iterate round 1 until results are good enough**

Within round 1:
- adjust PM analysis prompt wording
- adjust skill ordering or skill input structure when needed
- rerun the prompt iteration test after each meaningful change
- append each attempt and score to the log

Exit rule for round 1:
- completeness and structure quality improve versus baseline
- the final round 1 output is stable across the fixed sample set

- [ ] **Step 4: Run round 2 with a new optimization idea**

After round 1 stabilizes:
- define a new idea for round 2 based on remaining weaknesses
- start from the best round 1 prompt, not the original baseline
- rerun tests and record every prompt revision plus result

Round 2 focus:
- improve prioritization and actionability
- make the suggested next steps easier for PM to execute directly

- [ ] **Step 5: Run round 3 with a third optimization idea**

After round 2 stabilizes:
- identify a third optimization direction from the latest test results
- continue the same loop of prompt revision -> test -> result logging

Round 3 focus:
- improve evidence-grounding and reduce noisy conclusions
- reduce unsupported inferences and generic advice

- [ ] **Step 6: Lock the final prompt set and verify**

At the end of round 3:
- freeze the selected PM analysis prompt
- document the final skill orchestration order
- summarize why this version won over the other attempts
- keep the iteration log and fixtures as regression assets

Run:
- `pnpm --dir server test tests/pm-analysis.prompt-iteration.test.ts`
- `pnpm --dir server test tests/pm-analysis.service.test.ts`

Expected: PASS and the iteration log contains baseline + three completed rounds

- [ ] **Step 7: Commit**

```bash
git add server/src/application/services/pm-analysis.service.ts server/tests/pm-analysis.prompt-iteration.test.ts server/tests/fixtures/pm-analysis/cases.json docs/it-pm-assistant/05-ai-agent-skill-design.md docs/it-pm-assistant/14-pm-analysis-prompt-iteration-log.md
git commit -m "feat: optimize pm analysis prompts"
```

### Task 9: Stabilization and End-to-End Validation

**Files:**
- Create: `server/tests/e2e/a1-to-b2.test.ts`
- Create: `server/tests/e2e/a2-to-b1.test.ts`
- Create: `extension/tests/e2e/auth-bridge.test.ts`
- Modify: `docs/it-pm-assistant/07-phase-1-rollout.md`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

describe("a1 to b2 e2e", () => {
  it("creates a confirmable draft and applies it", async () => {
    expect(false).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir server test tests/e2e/a1-to-b2.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Add:
- end-to-end test fixtures
- sample records and mocked adapter responses
- final rollout doc updates based on real implementation results

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir server test`
Expected: PASS for the implemented suites

- [ ] **Step 5: Commit**

```bash
git add server/tests/e2e extension/tests/e2e docs/it-pm-assistant/07-phase-1-rollout.md
git commit -m "test: add end-to-end workflow validation"
```

## Execution Notes

- Start with Task 1 through Task 4 before attempting any Meegle write path.
- `A1 -> B2` should be the first fully working vertical slice.
- `A2 -> B1` should reuse the same draft/apply and auth infrastructure.
- PM analysis can stay read-only until the write paths are stable.
- PM analysis prompt optimization should start only after Task 7 gives a stable baseline response.
- For the three PM optimization rounds, always keep the sample set fixed within the same round so comparison remains meaningful.

## Verification Checklist

Before claiming milestone completion, verify:

- Extension protocol types compile
- Backend DTO validation catches malformed requests
- Auth bridge can return `require_auth_code`, `ready`, and `failed`
- A1 and A2 both produce confirmable drafts
- PM analysis returns a structured response
- PM analysis prompt iteration log includes baseline plus three finished rounds with recorded test results
- End-to-end tests cover the main workflow and one failure path
