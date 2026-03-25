# TODOs

## Extension Testing

### Add unit tests for extension modules

**What**: Add unit tests for extension popup.js, background router, and content scripts.

**Why**: Current extension code lacks test coverage. Tests would catch regressions and ensure auth flows work correctly.

**Pros**: Prevent regressions, document expected behavior, easier refactoring.

**Cons**: Requires mocking Chrome APIs, initial setup effort.

**Context**: Build validation is working, but functional tests are missing. Key areas to test:
- `popup.js`: Page detection, auth status handling, API calls
- `background/router.ts`: Message routing, auth handlers
- `content-scripts/`: DOM interaction, message passing

**Depends on**: None — can start immediately.

---

## Auth Bridge Enhancements

### Auto-open helper tab when no Meegle context exists

**What**: Implement automatic opening of a Meegle helper tab when the auth bridge cannot find an active Meegle tab context.

**Why**: Currently, if a user triggers a Meegle write action from a Lark page without an open Meegle tab, the auth bridge fails silently. This feature would open a helper tab to complete auth code acquisition.

**Pros**: Improved user experience, fewer manual steps, graceful degradation from missing context.

**Cons**: Requires managing tab lifecycle, potential popup blockers, cross-tab messaging complexity.

**Context**: Design doc [10-meegle-auth-bridge-design.md](docs/tenways-octo/10-meegle-auth-bridge-design.md) explicitly defers this to Phase 2. Current implementation only supports "从已有 Meegle tab 申请 auth_code". The helper tab approach requires:
1. Detecting no active Meegle tab
2. Opening new tab to Meegle login page
3. Waiting for login + auth code request
4. Closing or reusing the helper tab

**Depends on**: Phase 1 auth bridge completion (Tasks 2, 4).

---

## Architecture Refactoring

### Split Meegle adapter into separate files

**What**: Refactor `server/src/adapters/meegle/` from single file to three separate adapters:
- `auth-adapter.ts` - Token lifecycle, auth code exchange
- `catalog-adapter.ts` - Project/space/type/field discovery
- `execution-adapter.ts` - Workitem/workflow/task CRUD

**Why**: The current single-adapter approach is acceptable for Phase 1 but will become unwieldy as Meegle API coverage grows. The design doc [04-architecture.md](docs/tenways-octo/04-architecture.md#8-meegle-适配设计更新) explicitly defines these three layers.

**Pros**: Clear responsibility boundaries, easier testing, parallel development, follows Single Responsibility Principle.

**Cons**: More files to maintain, potential circular dependencies if not careful.

**Context**: Decision made during plan-eng-review to keep single file for Phase 1. Split when:
- Adapter file exceeds ~500 lines
- Multiple developers need to modify adapter simultaneously
- Test setup becomes complex

**Depends on**: Phase 1 adapter implementation (Task 4).

---

## Data Source Integration

### Add Lark and GitHub data sources for PM analysis

**What**: Extend PM analysis service to aggregate data from Lark (A1/A2 records) and GitHub (PR status) in addition to Meegle.

**Why**: The design doc [03-prd.md](docs/tenways-octo/03-prd.md) describes PM analysis as cross-platform analysis. Currently, the implementation only covers Meegle workitem data. Full PM analysis requires:
- Lark A1/A2 record correlation
- GitHub PR status and review state
- Unified analysis report

**Pros**: Complete PM visibility, accurate blocker detection, cross-platform correlation.

**Cons**: Three API integrations, authentication complexity for each platform, data normalization overhead.

**Context**: Design doc [05-ai-agent-skill-design.md](docs/tenways-octo/05-ai-agent-skill-design.md) describes the PM analysis agent that should aggregate all three sources. Phase 1 implementation focuses on Meegle-only as the primary execution platform.

**Depends on**: PM analysis service implementation (Task 7), Lark API adapter, GitHub API adapter.