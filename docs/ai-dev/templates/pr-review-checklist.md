---
status: draft
owner: TBD
last_reviewed: 2026-06-10
scope: PR review checklist for Octo extension/server/platform boundary, tests, Meegle metadata, diagnostics, and docs
update_required_when:
  - PR review expectations change
  - extension/server/platform boundary rules change
  - testing strategy changes
---

# PR Review Checklist

Use this checklist for non-trivial PRs. Lead with blockers and correctness risks, then tests and documentation. Do not use it as a mechanical approval form; use it to find boundary violations and missing verification.

## 1. PR Summary

- PR title:
- Reviewer:
- Request / ticket:
- Main changed layers:
  - [ ] Extension
  - [ ] Server
  - [ ] Adapter
  - [ ] Platform
  - [ ] Docs only
- Main changed workflows:

## 2. Boundary Review

- [ ] Extension remains thin: no workflow/business orchestration moved into popup/background/content script.
- [ ] Server owns page/action catalog, identity/auth, workflow orchestration, and platform coordination.
- [ ] Adapters own third-party API calls and platform error normalization.
- [ ] Platform constraints are not hidden as generic workflow errors.
- [ ] New or refactored cross-layer action carries or plans `actionRunId`.

Findings:

- 

## 3. Action And Page Config

- [ ] Backend actions are driven by server `automationActions.executor`.
- [ ] Popup does not add new hardcoded backend route branches.
- [ ] Server and extension action types are aligned.
- [ ] Page/action mapping is not duplicated unnecessarily.
- [ ] Server-unavailable fallback remains conservative.

Findings:

- 

## 4. Server Review

- [ ] Public inputs are validated with Zod DTOs.
- [ ] Controller stays thin and delegates workflow to service.
- [ ] Services use explicit deps where testability matters.
- [ ] Responses preserve `{ ok, data, error }` where the module already uses it.
- [ ] Errors include stable `errorCode`; new/refactored cross-layer flows include `layer/module/stage`.
- [ ] No `console.log`; server code uses `logger.ts`.

Findings:

- 

## 5. Extension Review

- [ ] Extension only captures context, triggers auth, renders UI, and dispatches actions.
- [ ] Auth bridge does not send raw browser cookies to server.
- [ ] Popup displays useful error state instead of only generic failure.
- [ ] Extension logs use `extension/src/logger.ts`.
- [ ] No new legacy A1/A2/B1/B2 naming.

Findings:

- 

## 6. Meegle / Lark / GitHub Platform Review

- [ ] Meegle `field_*` values are not scattered through popup or workflow services.
- [ ] New Meegle field usage is semantic, centralized, or explicitly documented as fallback config.
- [ ] Create/update writability and option constraints are considered.
- [ ] Auth missing, permission denied, field missing, and platform rejection are distinguishable.
- [ ] Partial success states are explicit when multiple platform writes happen.

Findings:

- 

## 7. Route And Naming Review

- [ ] `/api/a1/*` and `/api/a2/*` are not restored.
- [ ] New route/action/message names avoid A1/A2/B1/B2.
- [ ] Public route names use current vocabulary or concrete workflow names.
- [ ] Route tests and docs agree with runtime registration.

Findings:

- 

## 8. Test Review

- [ ] Unit tests cover changed pure logic, mappers, DTOs, resolver, or dispatcher.
- [ ] Mock integration tests do not pretend to be live E2E.
- [ ] Playwright tests are only used for live/browser extension E2E.
- [ ] New Vitest tests use globals and avoid dynamic `await import()`.
- [ ] Verification commands are recorded in the PR.

Commands run:

- 

Unverified areas:

- 

## 9. Documentation Review

- [ ] `AGENTS.md` remains short and does not absorb detailed rules.
- [ ] Relevant `docs/ai-dev` rule/lifecycle/governance docs are updated if behavior changed.
- [ ] No stray markdown file was added when an existing doc should be updated.
- [ ] Follow-up work is recorded if the PR intentionally leaves known gaps.

Findings:

- 

## 10. Review Decision

- Decision: approve / request changes / comment only
- Blocking issues:
- Non-blocking follow-ups:
- Residual risk:
