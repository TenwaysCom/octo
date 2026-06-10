---
status: draft
owner: TBD
last_reviewed: 2026-06-10
scope: Template for requesting Octo AI/dev changes with enough context, boundaries, and verification criteria
update_required_when:
  - task intake workflow changes
  - extension/server/platform boundary rules change
  - testing or verification rules change
---

# AI Task Template

用这个模板提需求、提 bug 修复、提重构任务。目标是让 agent 在改代码前知道：要解决什么、边界在哪里、需要读哪些文档、怎么验收。

## 1. Request Summary

- Title:
- Request type: feature / bug fix / refactor / investigation / docs / test
- Priority: P0 / P1 / P2
- Owner:
- Desired outcome:

## 2. Background

- Current behavior:
- Expected behavior:
- Why now:
- Related user flow or business workflow:
- Known constraints:

## 3. Scope

In scope:

- 

Out of scope:

- 

Affected layers:

- [ ] Extension
- [ ] Server
- [ ] Adapter
- [ ] Platform
- [ ] Docs only

Affected technical objects:

- [ ] `ExtensionPageConfig`
- [ ] `AutomationActionConfig`
- [ ] `PopupPageContext`
- [ ] `IdentityState` / `masterUserId`
- [ ] `ExecutionDraft`
- [ ] `MeegleWorkitem`
- [ ] `MeegleFieldMetadata`
- [ ] `MeegleLarkPushAction`
- [ ] Other:

## 4. Required Reading

Pick the docs that apply:

- [ ] `docs/ai-dev/lifecycle/current-system-technical-objects.md`
- [ ] `docs/ai-dev/rules/system-boundaries-and-code-rules.md`
- [ ] `docs/ai-dev/rules/extension-code-rules.md`
- [ ] `docs/ai-dev/rules/server-code-rules.md`
- [ ] `docs/ai-dev/governance/current-issue-map-2026-06-09.md`
- [ ] `docs/ai-dev/governance/execution-plan.md`

## 5. Behavior Contract

Inputs:

- 

Outputs:

- 

Success state:

- 

Failure states:

- 

Partial success states:

- 

## 6. Boundary Rules

- Where should the logic live?
- What must stay out of extension?
- What must stay out of server workflow?
- Does this action need `actionRunId` because it is new or being refactored?
- Does this touch Meegle `field_*` or platform metadata?
- Does this depend on real Lark/Meegle authorization?

## 7. Verification Plan

Commands:

- [ ] `pnpm --dir server test`
- [ ] `pnpm --dir server build`
- [ ] `pnpm --dir extension test`
- [ ] `pnpm --dir extension typecheck`
- [ ] `pnpm --dir extension build`
- [ ] `pnpm --dir extension test:e2e -- --list`

Manual checks:

- 

Mocked platform checks:

- 

Live platform checks:

- Required auth:
- Required seed data:
- Expected result:

## 8. Acceptance Criteria

- [ ] 
- [ ] 
- [ ] 

## 9. Notes For Reviewer

- Risky files:
- Known tradeoffs:
- Follow-up work:
