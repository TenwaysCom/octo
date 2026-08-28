# Errors

Record concise compiler/runtime errors, failed commands, wrong assumptions, and their verified fixes here. Redact secrets, cookies, tokens, and sensitive payloads.

## [ERR-20260828-001] fe-focused-node-test-arguments

- **Summary:** The FE package's `test` script is a bare `node --test`, so passing two focused file paths through `pnpm --dir fe test --` produced one unresolved comma-separated target.
- **Error:** `Could not find 'meegle-sprint-history.test.js, meegle-sprint-workitem-view.test.js'`.
- **Fix:** Run focused files with `pnpm --dir fe exec node --test src/lib/<file>.test.js ...`; this executed the intended 14 tests successfully.
- **Status:** resolved; use package `check` for the full FE suite.

## [ERR-20260827-009] sync-run-history-is-not-snapshot-state

- **Summary:** `#sync` 的“最近同步”曾改为读取 `platform_sync_runs` 的成功记录，导致旧流程已经写入快照、但没有对应 run 历史的数据源显示为空。
- **Fix:** 状态接口按配置 scope 直接读取 Lark、Meegle、GitHub 快照表中最新的 `synced_at`，再由 Server 汇总为 source 级 `lastSyncedAt`；FE 仍只请求一次状态接口。
- **Status:** resolved；定向 Server 测试 11/11、Server build 与 FE check 62/62 均通过。

## [ERR-20260826-001] server-full-suite-runtime-boundaries

- **Summary:** Lark thread 功能的全量 Server test 命令触发了与本次改动无关的运行环境失败。
- **Error:** Node v22.12.0 无法加载 `node:sqlite`，导致 6 个既有 SQLite suites 失败；`src/logger.test.ts` 的 dated log 文件断言在全量和独立运行中都失败。
- **Fix:** 使用 `pnpm --dir server exec vitest run <files...>` 精确验证相关 10 个文件（37 tests 全通过），并单独执行 `pnpm --dir server build`。全量套件需在提供 `node:sqlite` 的项目标准 Node runtime 运行，并另行修复既有 logger 落盘时序/兼容性。
- **Status:** 本功能验证完成；全量环境问题未在本任务中修改。

## [ERR-20260826-002] postgres-migration-sandbox-network

- **Summary:** PostgreSQL schema migration could not reach the configured private database address from the default sandbox.
- **Error:** `connect EPERM` during `pnpm --dir server db:migrate`; no schema statement acquired a connection.
- **Fix:** Re-ran the exact package-scoped migration with approved database network access; it completed with `[db] ensured postgres schema`.
- **Status:** resolved; migration succeeded.

## [ERR-20260826-003] git-index-workspace-read-only

- **Summary:** The default workspace sandbox allowed source edits but mounted `.git/index` read-only during the requested commit.
- **Error:** `git add` failed with `cannot create .git/index.lock: Read-only file system`.
- **Fix:** Re-ran the explicit file-scoped `git add` with approved Git metadata access, then committed normally.
- **Status:** resolved; no source file was lost or staged unintentionally.

## [ERR-20260827-001] fe-node-test-globals

- **Summary:** A new FE unit test used Vitest-style globals, but this package runs `node --test`.
- **Error:** `ReferenceError: test is not defined` in `platform-list-filters.test.js`.
- **Fix:** Import `test` from `node:test` and assertions from `node:assert/strict`, matching existing FE tests.
- **Status:** resolved; `pnpm --dir fe check` passed 56/56 tests and the production build.

## [ERR-20260821-001] python-pycache-global-cache-permission

- **Summary:** The system `python3 -m py_compile` attempted to write bytecode under the macOS global Python cache, which is outside the workspace sandbox.
- **Error:** `PermissionError: [Errno 1] Operation not permitted` while creating `/Users/linyu/Library/Caches/com.apple.python/...`.
- **Fix:** Set `PYTHONPYCACHEPREFIX` to a writable temporary directory for syntax-only verification; compilation then passed.
- **Status:** resolved; no application file writes were needed.

## [ERR-20260810-001] vitest-matcher-generic-argument

- **Summary:** `toMatchObject<T>()` is not a generic Vitest matcher in this project.
- **Error:** TypeScript `TS2558: Expected 0 type arguments, but got 1.`
- **Fix:** Use `toMatchObject({...})` directly; keep type assertions outside the matcher when needed.
- **Status:** resolved

## [ERR-20260810-002] ignored-env-search-output

- **Summary:** A broad search over ignored files can print credential-bearing local `.env` values.
- **Fix:** When checking ignored runtime configuration, report file paths and variable names only; exclude `.env` content from terminal output unless the user explicitly authorizes secret handling.
- **Status:** resolved

## [ERR-20260810-003] optional-dependency-async-callback

- **Summary:** TypeScript lost the non-null narrowing of an optional injected dependency inside an async callback.
- **Error:** `TS2532: Object is possibly 'undefined'.`
- **Fix:** Capture the dependency in a local constant after the guard before passing it into asynchronous work.
- **Status:** resolved

## [ERR-20260810-004] logger-file-test-suite-flake

- **Summary:** The full server suite intermittently did not observe a Pino daily-rotation file immediately after `flush`.
- **Error:** `src/logger.test.ts` expected a dated log filename, received `undefined`; the isolated retry passed.
- **Fix:** Treat this as an existing timing-sensitive test; keep the unrelated logger implementation unchanged and report both the full-suite result and isolated retry.
- **Status:** resolved by retry; no product-code change

## [ERR-20260810-005] sandbox-process-inspection-denied

- **Summary:** Process enumeration was denied by the local sandbox during Redis-cache diagnosis.
- **Error:** `ps`: `operation not permitted`.
- **Fix:** Verify the active configuration contract from source and inspect only non-sensitive environment-variable presence and safe log markers; do not dump process environments because they may contain credentials.
- **Status:** resolved with safe configuration evidence

## [ERR-20260810-006] github-build-badge-test-runtime-and-union

- **Summary:** The new DOM unit test initially ran in Node, and the background protocol union retained a duplicated branch after editing.
- **Error:** `ReferenceError: document is not defined`; TypeScript `TS1109: Expression expected`.
- **Fix:** Mark DOM-focused content-script tests with the jsdom environment and import Vitest globals explicitly for typecheck; keep each protocol union member exactly once.
- **Status:** resolved; full server and extension suites passed.

## [ERR-20260810-007] chrome-extension-origin-is-opaque-to-node-url

- **Summary:** Node's `URL.origin` returns `null` for `chrome-extension://` URLs, unlike normal HTTP(S) origins.
- **Fix:** Parse extension origins explicitly as a scheme plus exact extension ID, reject wildcards and paths, and preserve that exact value for the CORS allowlist.
- **Status:** resolved with a CORS parser unit test.

## [ERR-20260810-008] github-merge-panel-button-timing

- **Summary:** A GitHub PR can render its merge container before any merge button is available to the current user or page state.
- **Fix:** Anchor passive UI above stable merge containers first, and only use the merge button as a fallback; cover the container-only DOM in a unit test.
- **Status:** resolved pending a live GitHub PR refresh.

## [ERR-20260810-009] github-merge-button-semantic-selector

- **Summary:** The current GitHub merge card may expose a plain `type="button"` control without the historical merge data attributes.
- **Fix:** Fall back to the visible `Merge pull request` button text, then select the surrounding conflict/merge card before injecting the badge.
- **Status:** resolved pending a live GitHub PR refresh.

## [ERR-20260810-010] typescript-nodelist-iteration-target

- **Summary:** The extension TypeScript target does not provide iterable `NodeList` typing.
- **Error:** `TS2488: Type 'NodeListOf<Element>' must have a '[Symbol.iterator]()' method`.
- **Fix:** Convert `querySelectorAll()` results with `Array.from()` before searching them.
- **Status:** resolved.

## [ERR-20260811-001] tsx-sandbox-ipc-pipe

- **Summary:** A read-only TypeScript diagnostic can fail before execution because `tsx` creates an IPC pipe in the system temporary directory.
- **Error:** `listen EPERM: operation not permitted .../tsx-*/...pipe`.
- **Fix:** Re-run the same non-mutating diagnostic with the required sandbox escalation; do not replace it with a command that exposes database configuration or raw snapshot payloads.
- **Status:** resolved with a read-only aggregate query.

## [ERR-20260811-005] github-user-chip-prop-regression

- **Summary:** A broad JSX row replacement briefly changed the existing Odoo.sh build indicator prop while adding user chips.
- **Fix:** Restore the original `item.odooShBuilds` prop immediately, then run the FE test suite and production build before handoff.
- **Status:** resolved.

## [ERR-20260811-002] incremental-cli-test-mode-scope

- **Summary:** A CLI parser test combined `--mode incremental` with `--only lark` after the command was intentionally restricted to GitHub.
- **Error:** `Incremental sync currently requires --only github --scope <owner/repo>`.
- **Fix:** Keep the parser guard and test the documented GitHub `owner/repo` scope combination instead.
- **Status:** resolved; targeted CLI tests pass.

## [ERR-20260811-003] cache-delete-result-test-double

- **Summary:** After making cache deletion report whether Redis was actually invalidated, one service test mock still returned `undefined` from the old void contract.
- **Error:** `expected undefined to be true` in `OdooDevopsBranchesService` invalidation coverage.
- **Fix:** Update every `ApiCache.delete` test double to resolve a boolean and assert a failed deletion is reported instead of claiming success.
- **Status:** resolved with targeted service and controller tests.

## [ERR-20260811-004] platform-api-test-anchor-drift

- **Summary:** An initial FE test patch targeted an outdated test title.
- **Error:** `apply_patch verification failed` for the platform-data API test anchor.
- **Fix:** Read the current test file and add the cache-reset contract test beside its actual GitHub PR fixture.
- **Status:** resolved; FE tests and production build pass.

## [ERR-20260812-005] ticket-shared-url-eager-store-initialization

- **Summary:** The shared-URL controller constructed its default Postgres store before checking the opaque Web session.
- **Error:** Unauthenticated controller tests failed without `POSTGRES_URI`; index route registration also required a ready SSH tunnel.
- **Fix:** Instantiate the store lazily inside the authenticated `load` service method, after snapshot access is actually needed.
- **Status:** resolved; unauthenticated requests return 401 without database access.

## [ERR-20260813-002] tsx-eval-diagnostic-invocation

- **Summary:** A read-only Meegle checkpoint diagnostic first combined `pnpm --dir server` with an already server-scoped working directory, then used top-level `await` in `tsx -e`.
- **Error:** pnpm resolved a nonexistent `server/server` path; `tsx -e` compiled as CJS and rejected top-level `await`. The corrected async-IIFE invocation then hit the known sandbox IPC restriction.
- **Fix:** Scope the command exactly once, wrap async eval bodies in an async IIFE, and rerun the same read-only `tsx` diagnostic with sandbox approval when IPC creation is denied.
- **Status:** resolved; the checkpoint query completed and returned only redacted diagnostic fields.

## [ERR-20260814-001] vitest-focused-file-invocation

- **Summary:** Passing a focused test path after `pnpm --dir server test --` ran the full Vitest suite instead of only the requested file.
- **Error:** Unrelated environment failures appeared for unavailable `node:sqlite` suites and the logger file timing test, even though the platform-data controller tests passed.
- **Fix:** Use `pnpm --dir server exec vitest run <test-file>` for an exact focused run, then execute the Server build separately.
- **Status:** resolved; all 5 platform-data controller tests and the Server TypeScript build pass.

## [ERR-20260817-001] list-get-diagnostic-tsx-entrypoint

- **Summary:** The first read-only List/Get comparison used top-level `await` in `tsx -e`, which is compiled as CJS in this project.
- **Error:** `Top-level await is currently not supported with the "cjs" output format`.
- **Fix:** Invoke an async function and attach `.catch(...)`; do not use top-level `await` in `tsx -e` diagnostics.
- **Status:** resolved; the corrected diagnostic compared three records without exposing payloads or credentials.

## [ERR-20260817-002] hv-pdf-python-environment

- **Summary:** The report conversion check assumed a `python` alias and preinstalled WeasyPrint dependencies.
- **Error:** `python: command not found`, followed by `ModuleNotFoundError: No module named 'weasyprint'` under `python3`.
- **Fix:** Use `python3` and install report-only dependencies under `/tmp`, then pass that directory through `PYTHONPATH`; do not add them to project dependencies.
- **Status:** resolved; the 12-page A4 PDF rendered successfully and its wide comparison table was visually corrected.

## [ERR-20260817-003] private-pr-gh-cli-auth

- **Summary:** A read-only attempt to inspect a private GitHub PR with `gh pr view` assumed the local CLI had GitHub credentials.
- **Error:** `gh` requested `gh auth login` or a `GH_TOKEN`.
- **Fix:** Use the Server's redacted API diagnostics for this investigation; never print or borrow an existing service token for an ad hoc CLI command.
- **Status:** contained; PR-specific endpoint status was verified from structured Server logs.

## [ERR-20260827-003] github-platform-filter-controller-fixture

- **Summary:** Extending GitHub platform-list filters changed the controller's service dependency envelope, while the existing GitHub fixture still asserted a stale placeholder object.
- **Error:** The focused controller test expected `{ sprint: undefined }` but received the new `{ githubPullRequests: {} }` contract.
- **Fix:** Replace the stale placeholder with an explicit GitHub filter fixture and assert the validated status, repository, label, reviewer, update-time, and offset mapping.
- **Status:** resolved; covered by the focused platform-data controller test.

## [ERR-20260827-004] platform-sync-store-test-double-contract

- **Summary:** Adding the read-only `listMeegleWorkitemsByIds` store method for GitHub PR projections left a structurally typed Platform Sync test double incomplete.
- **Error:** Server build failed with `TS2322` because the test store no longer satisfied `PlatformSyncStore`.
- **Fix:** Add the new read method to the shared test double with an empty result; production behavior remains covered by Postgres store and Platform Data service tests.
- **Status:** resolved; Server build passes.

## [ERR-20260817-004] tsx-eval-env-path-and-async-wrapper

- **Summary:** A scoped PostgreSQL diagnostic run through `pnpm --dir server exec tsx -e` first used a repo-relative `server/.env` path and top-level `await`, so the environment was not loaded and `tsx` rejected the eval body.
- **Fix:** Within the package-scoped command, load `.env` relative to `server`, wrap asynchronous code in an async IIFE, and rerun with sandbox approval when `tsx` requires its temporary IPC pipe.
- **Status:** resolved; the read-only inventory and the scoped sync verification completed without exposing token values.

## [ERR-20260818-001] zsh-unmatched-diagnostic-glob

- **Summary:** Two read-only searches included unmatched path globs in zsh, so the shell aborted before `rg` ran.
- **Error:** `zsh: no matches found` for `.env*` and `docker-compose*`.
- **Fix:** Search known directories directly or enumerate optional files with `find`; do not pass optional unmatched globs to zsh diagnostics.
- **Status:** resolved with explicit paths and `find`.

## [ERR-20260818-002] auth-log-overbroad-search

- **Summary:** An auth diagnostic searched raw application logs broadly and surfaced user-profile fields that were not needed for callback routing analysis.
- **Fix:** Restrict auth-flow diagnostics to structured API logs and extract only time, phase, method, path, and status with `jq`; never print application response payloads or user-profile fields.
- **Status:** contained; subsequent diagnostics used the documented non-sensitive request-field filter only.

## [ERR-20260818-003] extension-verification-dependencies-missing

- **Summary:** Extension test and typecheck commands could not start because `extension/node_modules` was absent; borrowing Server binaries also failed because Vite resolved config dependencies and temp paths from the wrong package.
- **Error:** `Command "vitest" not found`, `tsc: not found`, Vite `.vite-temp` `ENOENT`, and missing `vitest/config`.
- **Fix:** Install the Extension's existing frozen lockfile with approval, then run package-scoped `typecheck`, `test`, and `build` commands normally.
- **Status:** resolved; the lockfile stayed unchanged and all Extension verification passed.

## [ERR-20260818-004] router-config-whole-module-mock

- **Summary:** The first router regression run failed because its whole-module config mock did not expose the new callback compatibility function.
- **Error:** Vitest reported no `isLarkOAuthCallbackCompatibleWithServer` export on the `./config.js` mock.
- **Fix:** Use a partial mock that preserves actual config exports and replaces only `getConfig`.
- **Status:** resolved; focused and full test suites pass.

## [ERR-20260824-001] acp-wire-log-sensitive-output

- **Summary:** A broad diagnostic over a raw ACP wire/script context printed a credential-bearing command argument that was not needed to diagnose permission routing.
- **Fix:** Never print raw ACP wire lines, response bodies, or complete tool commands during permission diagnostics. Parse only an allow-list of safe fields such as event type, normalized tool name, policy, decision, and offered option kinds; redact command arguments before output.
- **Status:** contained; later policy logging records only the normalized tool name and option kinds, without the command or full title.

## [ERR-20260825-001] lark-batch-cleaning-pg-mem-sql-compatibility

- **Summary:** The first batch cleaning `UPDATE ... FROM VALUES` used PostgreSQL `IS DISTINCT FROM` and a target-table alias that pg-mem could not execute.
- **Error:** pg-mem first rejected `IS DISTINCT FROM`, then reported `Unknown alias "lark_base_ticket_syncs"` for the aliased update target.
- **Fix:** Keep the single batch update, express null-safe differences with explicit NULL/value comparisons, and reference the unaliased target table. Do not fall back to per-record SELECT/UPDATE just to accommodate the test database.
- **Status:** resolved; the two-record batch update and idempotent second run pass in the Postgres store test, all 58 focused tests pass, and Server build passes.

## [ERR-20260825-002] lark-platform-sync-tsx-sandbox-ipc

- **Summary:** The first live Lark sync attempt could not start because tsx was not allowed to create its IPC socket inside the sandbox.
- **Error:** `listen EPERM: operation not permitted /tmp/tsx-1007/14.pipe`.
- **Fix:** Rerun the same scoped `pnpm --dir server platform:sync --only lark --mode full` command with sandbox escalation; do not replace the project entrypoint or expose credentials through an ad hoc command.
- **Status:** resolved; the escalated full sync exited 0 and reported only safe scope counts.

## [ERR-20260825-003] lark-list-records-redundant-batch-get

- **Summary:** The first Lark batch refactor treated List as an ID-only enumerator and added Batch Get for every full/incremental record, despite the interface analysis showing that List already returns the required snapshot fields and timestamps.
- **Impact:** Incremental sync used two platform requests where one List page was sufficient; full sync repeated every List page through Batch Get and fetched terminal records before filtering them.
- **Fix:** Full/incremental now consume List records directly with automatic fields. Batch Get remains only for single/selected ID-based sync; database UPSERT and cleaning stay batched.
- **Status:** resolved; 59 focused tests and Server build pass. Real-authorization verification of the corrected List-direct path remains pending.

## [ERR-20260825-004] pnpm-vitest-file-filter-forwarding

- **Summary:** `pnpm --dir server test -- <files>` passed an extra `--` to Vitest and unexpectedly ran the full Server suite instead of only the requested files.
- **Error:** The run surfaced the known Node 22 `node:sqlite` suite-load failures and logger timing failure, plus one local fixture assertion that was then corrected.
- **Fix:** Use `pnpm --dir server exec vitest run <files>` for deterministic focused test selection.
- **Status:** resolved; the corrected focused command ran exactly 5 files and all 59 tests passed.

## [ERR-20260826-001] scheduled-sync-integration-verification

- **Summary:** The first scheduled-sync build still passed the removed `checkpointStore` test dependency into the Web controller; the first focused run also trusted `ON CONFLICT DO NOTHING ... RETURNING` to identify the lease owner under pg-mem, a later CLI refactor left a trailing comma after a TypeScript cast, and the heterogeneous Web source list initially relied on an unsafe `flatMap` union inference.
- **Errors:** TypeScript rejected the obsolete controller option, the second same-scope run incorrectly acquired the lease in pg-mem, `tsc` reported `TS1109: Expression expected` in `platform-sync.ts`, and later rejected the mixed Lark/Meegle/GitHub scope arrays.
- **Fix:** Update Web tests to inject the coordinator contract; after a conflict, read the stored lease token and only conditionally replace an expired row; remove the invalid cast-expression commas; explicitly type the normalized source-definition boundary before flattening scopes. Keep the real lease token check even though PostgreSQL's `RETURNING` behavior is stronger than pg-mem's emulation.
- **Status:** resolved; 78 focused tests, 19 FE tests, both builds, diff check, and deploy-script syntax checks pass.

## [ERR-20260826-002] scheduled-sync-full-suite-environment

- **Summary:** The full Server suite completed the scheduled-sync coverage but retained known environment/timing failures outside this change.
- **Errors:** Six legacy SQLite suites cannot load `node:sqlite` in the current Node runtime, and one rotating logger test did not observe its dated file before asserting.
- **Fix:** Use the focused platform-sync suite for deterministic change verification and report the full-suite boundary explicitly; do not alter legacy SQLite or logger behavior as part of the scheduler task.
- **Status:** contained; full run reported 520 passing tests, 6 suite-load failures, and 1 unrelated logger timing failure.

## [ERR-20260826-003] git-index-readonly-during-commit

- **Summary:** The first attempt to stage the scheduled-sync change ran inside a workspace sandbox where `.git/index` was read-only.
- **Error:** `fatal: cannot create .git/index.lock: Read-only file system`.
- **Fix:** Retry the same explicit-path `git add` and commit with approved Git-index access; keep the unrelated staged deletion outside the commit.
- **Status:** resolved after the scoped escalated commit operation.

## [ERR-20260826-004] scheduled-worker-unref-poll-delay

- **Summary:** The scheduled Worker entered a clean-exit PM2 restart loop even though direct foreground execution was stable.
- **Error:** PM2 fork mode sets `process.argv[1]` to its container script, so the Worker's direct-entry guard never invoked `runPlatformSyncWorker`; PM2 repeatedly observed a zero-code/SIGINT exit. Separately, both the polling delay and scheduler-disabled wait could release the event loop too early.
- **Fix:** Recognize PM2's explicit `pm_exec_path` as an executable entrypoint, keep the main polling delay referenced, and use a referenced keep-alive interval while scheduling is disabled. Only auxiliary timers such as lease heartbeats may be unreferenced. Cover direct Node, PM2 fork mode, enabled polling, and disabled waiting in regression tests.
- **Status:** resolved; 6 focused tests and Server build pass, and the rebuilt PM2 Worker remained `online` with the same PID and `restartTime=0` across more than one 30-second poll while completing real Lark, Meegle, and GitHub schedules.

## [ERR-20260827-002] meegle-priority-projection-incomplete-select

- **Summary:** Adding Meegle priority to the snapshot row type and list projection initially omitted it from the cleaning snapshot query.
- **Error:** TypeScript reported that the selected row could not satisfy `MeegleWorkitemSyncRow` because `priority` was missing.
- **Fix:** Add `priority` to every typed Meegle snapshot select that is converted through `toMeegleWorkitemSyncItem`.
- **Status:** resolved; server build passed after the projection was made consistent.

## [ERR-20260827-003] platform-data-filter-pgmem-trim

- **Summary:** The new Lark Ticket quick-filter predicates initially used PostgreSQL `trim()` calls.
- **Error:** The pg-mem-backed snapshot-store test failed because its SQL function set does not implement `trim(text)`.
- **Fix:** Use the existing normalized snapshot values directly with `coalesce` and `lower`; this preserves the stored-field semantics and keeps the PostgreSQL query testable in pg-mem.
- **Status:** resolved; the snapshot-store, controller, service, FE, and TypeScript checks pass.

## [ERR-20260827-004] acp-ticket-context-eager-database-store

- **Summary:** Server startup crashed before `ensureSharedDatabase()` completed because route registration eagerly created the ACP Ticket context service and its PostgreSQL store.
- **Error:** `getSharedDatabase()` rejected with `SSH tunnel is not ready` while importing `server/src/index.ts`.
- **Fix:** Defer the controller's default service factory until an authorized request calls `getMessages`.
- **Status:** resolved; targeted controller/index tests, TypeScript build, and an actual Server startup reached the listening state.

## [ERR-20260827-005] fe-test-script-argument-forwarding

- **Summary:** The FE package test script is `node --test` and does not accept a bare source filename through `pnpm test -- <file>`.
- **Error:** `pnpm --dir fe test -- platform-data-api.test.js` reported that it could not find the file.
- **Fix:** Use the package-standard `pnpm --dir fe check`, which runs all Node tests and the Vite production build.
- **Status:** resolved; 62 FE tests and the build passed.

## [ERR-20260827-006] platform-sync-store-test-double-contract

- **Summary:** Adding the batch Meegle lookup to `PlatformSyncStore` initially left one structurally typed platform-sync test double without the new method.
- **Error:** TypeScript rejected the fake store with `TS2322` because `listMeegleWorkitemsByIds` was missing.
- **Fix:** Update every explicit `PlatformSyncStore` test double when extending the interface, even if the tested service path does not call the new method.
- **Status:** resolved; the focused Platform Sync tests and Server TypeScript build pass.

## [ERR-20260827-007] github-pr-additive-response-rollout

- **Summary:** The GitHub PR page entered its generic read-error state even though the backend request returned 200/304.
- **Error:** The updated FE required `meegleIds` and `meegleWorkitems`, while the still-running pre-change Server response did not include the newly added fields.
- **Fix:** Keep invalid supplied values fail-closed, but default absent additive association arrays to `[]` in the FE parser and cover the old response shape.
- **Status:** resolved; FE tests and the Vite production build pass.

## [ERR-20260827-008] github-list-object-identity-map

- **Summary:** The first list-detail split removed `description` by destructuring each PR before looking up its precomputed Odoo.sh environment in an object-keyed `Map`.
- **Error:** The focused service test received an empty Odoo.sh build list because the destructured object had a different identity from the original map key.
- **Fix:** Use the original PR object for all identity-keyed lookups, then construct the reduced list projection only after dependent values are resolved.
- **Status:** resolved; 55 focused Server tests and the Server TypeScript build pass.

## [ERR-20260827-009] worktree-server-dependency-registry-timeout

- **Summary:** The new feature worktree had no Server `node_modules`, so `pnpm --dir server exec vitest` first attempted a full dependency install and stalled on npm registry connection retries.
- **Error:** Registry requests for TypeScript and type packages timed out; using a symlink through pnpm then triggered its non-TTY modules purge guard.
- **Fix:** Reuse the already installed sibling checkout dependencies only for local verification by invoking its Vitest and TypeScript binaries directly with the feature worktree Server as cwd. Do not treat dependency-install failure as a test failure.
- **Status:** resolved; focused 45/45 and full 561/561 Server tests passed, and TypeScript build passed.

## [ERR-20260827-007] meegle-mql-shell-backtick-expansion

- **Summary:** A read-only MQL command initially wrapped an expression containing backticks in double quotes.
- **Error:** zsh executed the backtick identifiers as commands before Meegle received the MQL, producing command-not-found messages and invalid MQL syntax.
- **Fix:** Wrap the complete MQL expression in single quotes so identifier backticks reach the CLI literally; avoid constructing shell command strings with JSON double-quoted MQL.
- **Status:** resolved; the corrected query returned projected work item, status, Sprint, and update fields.
### ERR-20260827-008 — Worktree test dependency link used a duplicated `server/` prefix

- **Symptom:** Focused Vitest failed to load because `vitest` could not be resolved; the preceding link command reported `ln: server/node_modules: No such file or directory`.
- **Root cause:** The command already ran with `workdir=.../server` but tried to create `server/node_modules` instead of `node_modules`.
- **Verified fix:** Create `node_modules` from the server package directory, then rerun the focused tests.

### ERR-20260827-009 — Operation timestamp fixture had the wrong UTC expectation

- **Symptom:** The operation-record parser test expected `03:25:48.711Z`, while JavaScript correctly normalized the supplied epoch to `07:25:48.711Z`.
- **Root cause:** The hand-calculated fixture timestamp was wrong; the parser output matched the epoch value.
- **Verified fix:** Correct the expected ISO timestamp and keep epoch normalization covered by the test.

### ERR-20260827-010 — pnpm refused to purge a linked worktree dependency directory without a TTY

- **Symptom:** `pnpm test && pnpm build` stopped before tests with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.
- **Root cause:** The worktree reuses the main checkout's `server/node_modules` through a symlink, which pnpm considered eligible for reinstall/purge.
- **Verified fix:** Run the linked package binaries directly (`vitest run` and `tsc`) for equivalent full test and build checks without mutating dependencies.

### ERR-20260827-011 — zsh expanded an unquoted GitHub API query URL

- **Symptom:** A read-only curl command failed with `zsh: no matches found` before making the request.
- **Root cause:** The URL contained `?recursive=1` and was not quoted, so zsh treated it as a glob.
- **Verified fix:** Quote URLs containing query strings as one shell argument.

### ERR-20260827-012 — Implement-task skill path was resolved relative to the worktree

- **Symptom:** Reading `.codex/skills/implement-task/SKILL.md` failed because that directory is not present in the feature worktree.
- **Root cause:** The skill catalog points to the main checkout path, not a path relative to every linked worktree.
- **Verified fix:** Read the skill from `/Users/linyu/proj/octo/.codex/skills/implement-task/SKILL.md`.

### ERR-20260827-013 — zsh expanded an optional `.env*` search glob

- **Symptom:** A read-only configuration search stopped with `zsh: no matches found: .env*`.
- **Root cause:** zsh rejected an unmatched path glob before `rg` could run.
- **Verified fix:** Search explicit directories with `rg --hidden` and exclusion globs instead of passing an optional shell glob.

### ERR-20260827-014 — Incremental observation assertion landed in the bulk-sync test

- **Symptom:** A focused service test expected `sprintObservedAt` during historical bulk sync and failed with `undefined`.
- **Root cause:** A context-light patch matched the first identical `expect(store.meegle).toHaveLength(1)` assertion instead of the incremental-sync test block.
- **Verified fix:** Move the assertion under the incremental-sync request and keep bulk sync free to use the historical add-time approximation.

### ERR-20260827-015 — Historical overwrite semantics were reused for incremental lifecycle updates

- **Symptom:** Directly writing each observed lifecycle could replace the original start with a later activity node, while preserving old values on `null` would prevent historical cleaning from clearing incorrect data.
- **Root cause:** Historical replay and incremental observation were treated as one update operation even though one must overwrite the projection and the other must merge state transitions.
- **Verified fix:** Keep historical cleaning as a full overwrite, add phase-aware incremental merging, and cover earliest start, missing evidence, finish, reopen, New, and zero external-client calls in tests.

### ERR-20260827-016 — Parameterized fallback text broke a grouped PostgreSQL diagnostic

- **Symptom:** A read-only aggregate query failed first because separate parameters in `SELECT` and `GROUP BY` were not the same expression, then a shell-quoted SQL fallback was parsed as a column name.
- **Root cause:** The diagnostic mixed parameterized fallback text with a repeated grouped expression and then tried to repair it inside a shell single-quoted inline script.
- **Verified fix:** Remove the unnecessary fallback from the grouping and group directly by nullable `status`; the corrected read-only query completed without writes.

### ERR-20260827-017 — Membership insert union lost the `removedAt` type

- **Symptom:** Server TypeScript build rejected the Sprint membership insert because checking `"removedAt" in membership` narrowed the property to `unknown` after open and closed records were combined in one array.
- **Root cause:** The two mutation variants were passed directly to the Kysely value expression without first normalizing their discriminating field.
- **Verified fix:** Normalize both variants to a common `{ removedAt: string | null }` shape before inserting; the subsequent Server build passed.

### ERR-20260827-018 — Null lifecycle values fell back across Sprint boundaries

- **Symptom:** During final diff review, a new Sprint membership with `startedAt=null` or `finishedAt=null` would have used `??` and fallen back to the previous current-snapshot value, leaking Sprint A lifecycle times into Sprint B.
- **Root cause:** Null was treated as missing data even though it is an intentional state transition result for a new or reopened membership.
- **Verified fix:** When a current membership projection exists, copy its lifecycle values including intentional nulls; fall back to the legacy current projection only when no membership projection exists. Within a still-Finished interval, treat a missing new finish timestamp as absent evidence and preserve the earlier known finish. Regression assertions cover both B returning to New and a repeated Finished observation without a new finish timestamp.

### ERR-20260828-001 — Focused Vitest did not catch an optional ACP update type

- **Symptom:** The focused runtime and workflow tests passed, but `pnpm --dir server build` failed with `TS18048` because `SessionNotification.update` can be undefined.
- **Root cause:** Vitest transpilation exercised the runtime branch without performing the full TypeScript check.
- **Verified fix:** Narrow the update through an explicit record guard before reading it, then require both focused tests and the Server build for ACP event-shape changes.

### ERR-20260828-002 — Package test argument unexpectedly ran the full suite

- **Symptom:** `pnpm --dir server test -- acp-kimi-permission-policy.test.ts` ran every Server test instead of only the named file.
- **Root cause:** The package script already expands to `vitest run`, and this invocation did not provide the intended focused file routing in this workspace.
- **Verified fix:** Use `pnpm --dir server exec vitest run <test paths>` for focused verification; keep `pnpm --dir server test` as the explicit full-suite command.

### ERR-20260828-003 — Kimi ACP fixture covered only the non-streaming tool-call path

- **Symptom:** Unit tests approved an exact Support-QA fetch, but the real Kimi 0.38 session still cancelled that same command and then attempted disallowed `ls`/`grep` fallbacks.
- **Root cause:** The fixture put parsed arguments on the initial `tool_call.rawInput`. The real provider streamed arguments, so Kimi lazy-created a `tool_call` without raw input and supplied parsed arguments later on a canonical `tool_call_update`; both the permission cache and workflow evidence tracker ignored that update.
- **Verified fix:** Track structured raw input on both create and update events using the same Session/tool-call key, retain conflict denial, and model the lazy-create/upgrade sequence in runtime and workflow tests.

### ERR-20260828-004 — Allowed read-root directory lost its trailing slash

- **Symptom:** The new `ls docs/support-qa/` policy test was cancelled even though files below that directory were allowed.
- **Root cause:** `path.resolve` normalized the target to `docs/support-qa`, while the allowlist compared only against the trailing-slash prefix `docs/support-qa/`.
- **Verified fix:** Normalize each configured root and accept either exact root equality or a slash-delimited descendant; similarly named sibling paths remain outside the boundary.

### ERR-20260828-005 — Multi-hunk task-ledger closeout used a brittle verification anchor

- **Symptom:** The first closeout patch failed while matching an unchanged historical verification row.
- **Root cause:** One multi-hunk patch unnecessarily anchored the new v4 evidence to an old v3 row.
- **Verified fix:** Anchor the new evidence immediately before the stable `外部资源` row and keep unrelated historical evidence out of the patch context.

### ERR-20260828-006 — Sprint timeline capped planned ranges at today

- **Symptom:** Current Sprint charts ended today and Upcoming Sprint charts collapsed to their start day instead of reaching the configured Sprint end date.
- **Root cause:** The FE timeline used `min(configured end, today)`, treating today as an axis limit even though the chart contract covers the full configured Sprint range.
- **Verified fix:** Use the configured end date whenever present, fall back to today only when it is missing, and cover both Current and Upcoming timelines with explicit end-date assertions.

### ERR-20260828-007 — Meegle MQL diagnostic assumed an unsupported cardinality function

- **Symptom:** A read-only Current owner coverage query was rejected when it used `array_cardinality(current_status_operator)`.
- **Root cause:** Meegle MQL does not expose that PostgreSQL-style array helper for the multi-user field.
- **Verified fix:** Select `current_status_operator` directly, parse its `user_value_list` client-side, and use the normal paginated sync path for authoritative coverage.

### ERR-20260828-008 — Kysely parameter was wrapped in PostgreSQL dollar quotes

- **Symptom:** The first escalated read-only coverage query reached PostgreSQL but failed with a syntax error near `$`.
- **Root cause:** A Kysely SQL-tag parameter interpolation was unnecessarily surrounded by PostgreSQL dollar quotes, producing invalid SQL after parameterization.
- **Verified fix:** Interpolate the project key directly as `${projectKey}` and reserve dollar quotes only for literal text; the corrected aggregate query completed without writes or personal data output.
