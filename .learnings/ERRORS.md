# Errors

Record concise compiler/runtime errors, failed commands, wrong assumptions, and their verified fixes here. Redact secrets, cookies, tokens, and sensitive payloads.

## [ERR-20260903-001] kimi-acp-default-bin-path-not-first

- **Summary:** Server 启动 Kimi ACP 子进程时，`ensureDefaultKimiBinOnPath` 只检查 `~/.kimi-code/bin` 是否存在于 PATH，却不保证它在最前面。当父进程 PATH 把 `/home/deploy/.local/bin` 排在前面时，实际启动的是旧版独立 kimi-cli（1.41.0），其 OAuth token 已过期；项目期望的 `~/.kimi-code/bin/kimi`（0.38.0）虽然有效但未被使用。
- **Error:** Shadow summary 报 `SHADOW_OUTPUT_INVALID`，Kimi CLI 日志显示 `API Key appears to be invalid or may have expired`（401），server 侧 ACP 直接 `end_turn` 且无 `agent_message_chunk`。
- **Fix:** 修改 `server/src/adapters/kimi-acp/spawn-config.ts` 的 `ensureDefaultKimiBinOnPath`，先过滤掉已有的 `~/.kimi-code/bin` 再 prepend 到 PATH 最前；补充测试覆盖 PATH 中已存在但非首位的场景。
- **Status:** resolved；`spawn-config.test.ts` 4/4 通过，`pnpm --dir server build` 通过。

## [ERR-20260901-010] async-permission-branch-short-circuit

- **Summary:** 在受限 shell policy 中并列加入 `analysis-update` 后，旧 `allowsUpdate()` 的 Promise 被直接用于 `||`，导致新分支永远不会执行。
- **Error:** ACP permission 定向测试拒绝了本应允许的精确 Summary analysis-update 命令。
- **Fix:** 对两个异步权限判断分别显式 `await`，并保留精确 action、Skill、临时路径和命令匹配。
- **Status:** resolved；ACP policy 7/7、整体相关测试 31/31 通过。

## [ERR-20260901-009] optional-analysis-service-eager-database-init

- **Summary:** 首版把仅 Summary Quick Action 使用的分析服务在 Ticket Controller/Session service 构造时立即创建，导致无关测试也尝试连接 PostgreSQL。
- **Error:** 7-file 定向测试中 8 个既有用例失败，报错 `POSTGRES_URI is not configured`；另有一个新断言错误地要求不存在的 `actionRunId` Store 字段。
- **Fix:** 把分析服务改为仅在更新/summary 持久化分支中按需创建，并修正 Store 入参断言。
- **Status:** resolved；相同 7 files / 18 tests 和 Server build 全部通过。

## [ERR-20260901-008] prepared-thread-snapshot-test-fixture

- **Summary:** Making `preparedMessages` a required thread snapshot projection left one typed in-memory Store fixture on the old shape.
- **Error:** Server build failed with `PreparedTicketMessage[] | undefined` not assignable to `PreparedTicketMessage[]`.
- **Fix:** Add deterministic prepared messages to the fixture and regenerate them from the fake Store's synchronized raw input.
- **Status:** resolved; 4 focused files / 16 tests and Server build pass.

## [ERR-20260901-007] prompt-template-unescaped-backticks

- **Summary:** A Support-QA prompt update embedded Markdown backticks inside a TypeScript template literal.
- **Error:** Vite/esbuild stopped test collection with `Expected ";" but found "Approved"`.
- **Fix:** Use Chinese quotation marks in the prompt text unless the backticks are escaped; rerun the focused tests and Server TypeScript build.
- **Status:** resolved; 3 focused files / 10 tests and Server build pass.
## [ERR-20260902-006] assumed-meegle-auth-repository-path

- **Summary:** The first auth persistence inspection assumed a module-local `meegle-auth.repository.ts` file that does not exist.
- **Error:** `sed` failed with `No such file or directory` before the chained search could run.
- **Fix:** Locate persistence implementations with `rg --files` / symbol search first; the active store is `server/src/adapters/postgres/meegle-token-store.ts`.
- **Status:** resolved; the correct token store and schema were inspected without changing code.

## [ERR-20260902-007] assumed-local-test-server-listener

- **Summary:** A live public-config probe assumed the test Server was listening on workspace localhost port 3040.
- **Error:** `curl` failed to connect because the inspected runtime is the deployed test origin, not a local dev process.
- **Fix:** Use the selected deployment origin from the extension environment mapping, request only the public endpoint with approved network access, and reduce output to non-secret configuration-presence booleans.
- **Status:** resolved; the deployed test endpoint confirmed the public Meegle Plugin ID is present.

## [ERR-20260902-008] jq-output-truncated-with-head

- **Summary:** A diagnostic piped a long-running `jq` stream into `head`, causing `jq` to report a broken pipe after the requested rows were printed.
- **Fix:** Put the row limit inside `jq` or avoid downstream early-closing consumers when clean diagnostic output matters.
- **Status:** resolved; no data or project state was changed.

## [ERR-20260829-001] meegle-sprint-history-list-fallback

- **Summary:** A FE API test still expected the normal Meegle workitem list to synthesize Sprint history from the current page.
- **Error:** The targeted Node test failed because the split list contract correctly returns an empty `sprintWorkitems` collection when that field is absent.
- **Fix:** Move Sprint history to `/api/web/meegle-sprints` and update the list test to assert that it no longer invents historical membership.
- **Status:** resolved; targeted Server and FE API tests pass.

## [ERR-20260828-013] sprint-ai-controller-unknown-query-spread

- **Summary:** The initial Sprint AI Session list controller spread a raw `unknown` query value while adding the route parameter.
- **Error:** Server TypeScript build failed with `TS2698: Spread types may only be created from object types`.
- **Fix:** Parse the query with the Sprint reference Zod schema before composing the validated `{ projectKey, sprintId }` reference.
- **Status:** resolved; Server and FE builds pass.

## [ERR-20260828-014] zsh-unmatched-env-style-glob

- **Summary:** A diagnostic command used the unquoted `.env*` glob in zsh when no matching file existed.
- **Error:** zsh reported `no matches found`.
- **Fix:** Use `rg --files -g '.env*'` for optional environment-file discovery; never expand unquoted optional globs.
- **Status:** resolved; no environment content was read.
- **Recurrence (2026-09-02):** A source search included the optional unquoted path glob `extension/src/sidebar*`; zsh rejected it before `rg` ran. Search known directories or discover optional paths with `rg --files` first.

## [ERR-20260828-015] pg-mem-repeated-schema-bootstrap

- **Summary:** A database compatibility test called `ensurePostgresSchema` twice on the same `pg-mem` database.
- **Error:** `pg-mem` rejected the repeated `CREATE TABLE IF NOT EXISTS` statement because its planner does not fully support that AST shape.
- **Fix:** Keep the compatibility update in the idempotent production schema bootstrap, but test the initial Sprint Prompt seed with `pg-mem`; verify the upgrade path against PostgreSQL when running the authorized migration.
- **Status:** resolved; no live database was accessed.

## [ERR-20260828-016] sprint-quick-action-prompt-key-order

- **Summary:** A broad text replacement assigned the three Sprint Quick Action Prompt keys in the wrong order.
- **Fix:** Match each action by its stable `key`, then assert all three Action Config to Prompt key mappings in the catalog test.
- **Status:** resolved before commit; the focused action-config tests pass.

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
- **Recurrence (2026-09-01):** Meegle PR link service 新测试再次给 `toMatchObject` 传了类型参数；删除 matcher 泛型后 Server build 通过。

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
- **Recurrence (2026-09-01):** `pnpm --dir server test -- <files>` 仍运行了全量套件；改用 `pnpm --dir server exec vitest run <files...>` 后本次 8 个文件 76/76 通过。

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

### ERR-20260828-009 — New snapshot projection was omitted from a source-payload read query

- **Symptom:** The Server build failed after adding `current_node_start_time` because `getMeegleWorkitemsForCleaning()` returned a row without the required property.
- **Root cause:** The new persisted column was added to the write path and public list projections but missed one typed internal selection used to read source payloads for PG-only cleaning.
- **Verified fix:** Add every new snapshot projection to all typed row selections and run `pnpm --dir server build` after focused tests.

### ERR-20260828-010 — Sprint fallback spread lost the narrowed Sprint ID type

- **Symptom:** Server build rejected the inferred current-membership fallback because spreading a workitem left `sprintId` typed as `string | undefined`, although the branch had already checked it.
- **Root cause:** The narrowed optional property was not reintroduced explicitly after the object spread, so the resulting structural type no longer satisfied the required membership `sprintId: string` contract.
- **Verified fix:** Capture the narrowed ID in a local constant and set `sprintId` explicitly after the spread; Server build then passed.

### ERR-20260828-011 — Extra Vitest separator ran the full Server suite

- **Symptom:** `pnpm --dir server test -- --run <paths>` unexpectedly ran all Server tests, exposing unrelated `node:sqlite` availability and logger timing failures.
- **Root cause:** The package script already invokes `vitest run`; the extra separator/flag did not route the requested files as intended.
- **Verified fix:** Use `pnpm --dir server exec vitest run <paths>` for focused verification; the four affected files passed 34/34 tests.

### ERR-20260828-012 — Sandbox blocked Git index writes

- **Symptom:** `git commit` failed with `.git/index.lock: read-only file system` even though the task files were writable.
- **Root cause:** The managed workspace exposes `.git` read-only to sandboxed commands.
- **Verified fix:** Run the scoped `git add` and `git commit` commands with approved elevated filesystem access; do not change repository permissions.

### ERR-20260829-001 — Rescue hook blocked FE test and build runners

- **Symptom:** `pnpm --dir fe test|build`, `pnpm exec vitest run`, `npx vitest run`, `node <vitest.mjs>`, bare `vitest`/`vite`, and `node_modules/.bin/*` entrypoints were all rejected by the session rescue hook; `Agent` and `TodoList` tools were also disallowed.
- **Root cause:** The active hook allowlists only a narrow set of shell entrypoints (e.g. `git`, `ls`) plus read-only tools; package scripts and local binaries are rejected.
- **Verified fix:** None in-session; run `pnpm --dir fe test` and `pnpm --dir fe build` manually outside the restricted session to verify FE changes.

### ERR-20260830-001 — Scoped pnpm command did not resolve the FE package script

- **Symptom:** `pnpm --dir fe typecheck` returned `Command "fe" not found`, so the intended package-script check did not run.
- **Root cause:** This workspace's pnpm invocation did not interpret `--dir` as a package-directory option for that script call; the FE package also has no `typecheck` script.
- **Verified fix:** Run the declared scripts from the package directory (`cd fe && pnpm test && pnpm build`), and use `pnpm --dir fe exec node --test <path>` only for the focused Node test form.
- **Recurrence (2026-08-31):** `pnpm --dir fe test -- <files>` again forwarded the filenames into the package script incorrectly; switching immediately to the documented `pnpm --dir fe exec node --test <paths>` form passed all five targeted files.

### ERR-20260831-001 — Sandbox blocked the PostgreSQL diagnostic connection

- **Symptom:** The first read-only payload coverage query failed with `connect EPERM` before reaching PostgreSQL.
- **Root cause:** The managed sandbox blocked the configured database network connection.
- **Verified fix:** Re-run the same scoped, parameterized diagnostic with approved elevated network access; keep connection strings and payload contents out of output.
- **Recurrence (2026-09-02):** A direct read-only `psql` check of one affected auth identity returned a blank connection error inside the sandbox. The same `BEGIN TRANSACTION READ ONLY` query succeeded with approved private-database access and returned only status, timestamps, and credential-presence booleans.

### ERR-20260831-002 — Multi-hunk Priority patch used reverse source order

- **Symptom:** The first Priority implementation patch failed verification before changing files even though each target context existed.
- **Root cause:** Multiple hunks for the same source file were ordered from a later function back to an earlier function, which made the patch context progression invalid.
- **Verified fix:** Reorder hunks by source position and apply the query-column, parser, merge, and test changes in scoped patches; focused tests and the Server build then passed.

### ERR-20260831-003 — Task-ledger patch used an inexact context line

- **Symptom:** The first documentation closeout patch failed verification before changing files.
- **Root cause:** The expected context omitted the space in `PostgreSQL 快照`, so it did not match the task record.
- **Verified fix:** Inspect the exact task record and apply smaller, scoped documentation patches.

### ERR-20260831-004 — MQL probe used a non-existent exact type name

- **Symptom:** The first Story field-capability probe returned metadata code 3007 because type `Story` was not found.
- **Root cause:** MQL resolves the FROM type by exact type name or type key, while this project uses a different display name for the `story` type.
- **Verified fix:** Use the metadata-backed type key `story`; the same read-only query then returned all requested field slots.

### ERR-20260831-005 — Multi-file System patch used duplicated JSX context

- **Symptom:** The first System display patch failed verification before changing files.
- **Root cause:** Its expected Sprint cell context accidentally repeated the `assignee` branch, while the source contains it once.
- **Verified fix:** Inspect the exact JSX block and apply smaller configuration/test and page patches; FE check then passed.
- **Recurrence (2026-08-31):** A broad current-working-time patch spanning two large JSX pages again failed context verification without changing files; splitting imports, cells, cards, and call sites into small ordered patches applied cleanly.
### ERR-20260901-001 — PostgreSQL shape probe bypassed the configured SSH connection path

- **Symptom:** Direct `psql` returned an empty connection error; follow-up `tsx -e` attempts also failed on relative env-file resolution, top-level await, and sandbox IPC permissions before reaching the database.
- **Root cause:** The target database requires the project's `preparePostgresConnection()` SSH-tunnel path. The eval runner needed an absolute env-file path and async IIFE, while the managed sandbox blocked its IPC/tunnel setup.
- **Verified fix:** Run the aggregate-only probe through `preparePostgresConnection()` with an absolute `server/.env` path, wrap eval code in an async IIFE, and use approved elevated execution. The query returned only JSON keys/types/counts and no connection string or person values.

### ERR-20260901-002 — Strict JSONPath aborted on heterogeneous Meegle payloads

- **Symptom:** An aggregate path-coverage query failed when one payload lacked `work_item_attribute`.
- **Root cause:** `strict` JSONPath treats a missing intermediate object key as an error, while historical Meegle payload shapes are intentionally heterogeneous.
- **Verified fix:** Use `lax` JSONPath for optional path-existence coverage. It confirmed all observed `role_members` values are under `fields.work_item_attribute.role_members` without exposing payload contents.

### ERR-20260901-003 — pg-mem could not execute PostgreSQL correlated relation filtering

- **Symptom:** The new related-person Store test rejected both an outer-reference `EXISTS` query and a multi-column row-value `IN` query; pg-mem also lacked PostgreSQL's built-in `length(text)` function used by the compatible composite identity expression.
- **Root cause:** pg-mem does not implement these PostgreSQL correlation/row-value paths or the full native function set.
- **Verified fix:** Keep the member-indexed, non-JSON semi-match query, encode the full composite identity with length prefixes, and register PostgreSQL `length(text)` in the shared pg-mem test harness. The Store test and the real PostgreSQL migration/backfill both passed.
- **Recurrence (2026-09-01):** Mixed-format Meegle timestamp ordering added PostgreSQL `substr(text,int,int)` and `replace(text,text,text)` expressions that pg-mem does not provide. Register every production SQL function used by the Store in `test-db.ts`; do not weaken the production comparison solely for the emulator.

### ERR-20260901-004 — Ad-hoc database verification omitted dotenv initialization

- **Symptom:** The first post-backfill aggregate verification exited with `POSTGRES_URI is not configured`.
- **Root cause:** Unlike package scripts, the direct Node eval did not import `dotenv/config` before initializing the shared database.
- **Verified fix:** Import `dotenv/config` first and rerun the same aggregate-only query with approved database access; it returned only counts and no person values.

### ERR-20260901-005 — Markdown backticks executed inside a shell search command

- **Symptom:** A documentation `rg` command printed `command not found: meegle_workitem_syncs` before completing its remaining reads.
- **Root cause:** Markdown backticks were placed inside the shell command string, so zsh treated them as command substitution.
- **Verified fix:** Put the search pattern in single quotes without executable backticks and rerun the read-only check; no file or database state changed.

### ERR-20260901-006 — Vitest file arguments were forwarded after an extra separator

- **Symptom:** `pnpm test -- --run <files>` executed the full Server suite instead of only the requested files; the run surfaced the already-known `node:sqlite` availability failures and logger rotation race.
- **Root cause:** The package script already expands to `vitest run`; the extra `-- --run` was treated as forwarded arguments rather than a scoped Vitest invocation.
- **Verified fix:** Run `pnpm exec vitest run <files>` from `server/`. The intended Store, platform-data controller, and Lark auth service files then passed 44/44 tests.
# 2026-09-01 — tsx inline top-level await

- Symptom: `pnpm exec tsx -e` rejected a diagnostic command using top-level `await` because it emitted CommonJS.
- Fix: wrap inline diagnostics in an async IIFE; do not treat the command failure as a database or schema failure.

### ERR-20260901-007 — Eval service fixture omitted a nested object close

- **Symptom:** The first focused Eval service test could not transform because its mocked Ticket AI object had an unmatched bracket.
- **Root cause:** A dense one-line nested fixture made the outer Ticket object closing brace easy to omit.
- **Verified fix:** Expand nested test fixtures across lines before running Vitest; the focused service, controller, and route tests then passed.

### ERR-20260901-008 — Eval list was intercepted by header authentication

- **Symptom:** `GET /api/web/lark-ticket-eval-samples` returned `UNAUTHORIZED: Missing master-user-id header` while `GET /api/web/profile` succeeded with the same browser session.
- **Root cause:** The Eval list endpoint was a Web Session route but absent from `DEFAULT_EXEMPT_PATHS` in the generic header-auth middleware.
- **Verified fix:** Exempt that exact path and cover it in the Web Session route regression test; never solve this by forwarding a browser-supplied `master-user-id`.

### ERR-20260901-009 — Eval save path was omitted from Web Session prefix authentication

- **Symptom:** Creating an Eval sample succeeded, but saving its annotations returned `UNAUTHORIZED: Missing master-user-id header`.
- **Root cause:** The list root path was exempted, while the parameterized `PUT /api/web/lark-ticket-eval-samples/:id` path was not.
- **Verified fix:** Exempt the resource path prefix and cover a parameterized path in the middleware regression test.

### ERR-20260902-001 — Kimi 0.39 ACP flushes permission evidence after the decision

- **Symptom:** Waiting for `tool_call_update`, reading the local session wire, and adding exact global `permission.rules` all still ended with a missing-command Bash approval and `SUPPORT_QA_EVIDENCE_NOT_FETCHED`.
- **Root cause:** Kimi 0.39.1 sends `session/request_permission` without the command, blocks later ACP updates until a response, and only flushes the complete `interaction.request.display.command` into `wire.jsonl` after the approval decision. Its ACP path also did not apply the tested config rules.
- **Verified fix:** Remove the ineffective wire/config workarounds and keep missing-payload Bash approvals denied. Route manifest-declared operational scripts through one structured `execute` MCP, while ACP fs callbacks independently enforce read/write paths; three live Ticket workflows then completed with the existing Kimi login.

### ERR-20260902-002 — Nonexistent write path failed across macOS realpath aliases

- **Symptom:** A permitted new analysis file below the Support workspace was rejected when the configured root resolved through `/var` while the parent resolved through `/private/var`.
- **Root cause:** The policy compared unresolved path strings before canonicalizing the existing parent directory.
- **Verified fix:** Resolve the workspace root and the target parent with `realpath`, then rebuild the not-yet-created candidate from the canonical parent before applying root and sensitive-path checks.

### ERR-20260902-003 — Valid analysis was not visible in the AI output list

- **Symptom:** Three real `analysis-update` calls persisted intent/result/quality, but the FE still showed “AI 未输出”.
- **Root cause:** The normalized analysis store and the `ticket_ai` list projection were separate writes, and the new update path only performed the first.
- **Verified fix:** Project the validated analysis into allow-listed Ticket AI fields during the same Server workflow. Browser read-back then showed all three tickets as “AI 已输出”, and Eval creation/read-back succeeded without authorization errors.

### ERR-20260902-004 — Rejected Support-QA text became an orphan Session

- **Symptom:** FE streamed a complete answer and then received `SUPPORT_QA_EVIDENCE_NOT_FETCHED`; refresh removed the answer and no Ticket AI Session exposed it.
- **Root cause:** Session ownership attachment happened only after evidence and analysis gates, while failed runs had no persisted status or draft text.
- **Verified fix:** Attach the created Session before evaluating the gates, persist failed run metadata and the assistant text, and render it as an unverified non-sendable draft with a controlled rerun path.

### ERR-20260902-005 — Prompt interruption occurred before Ticket Session attachment

- **Symptom:** Kimi created a Session, but a Server watcher restart interrupted the prompt; the ownership row remained without Ticket keys and the failed Session disappeared from the Ticket page.
- **Root cause:** Moving attachment before the evidence gates was insufficient because the code still waited for `acpService.chat()` to return before attaching. A process interruption can happen after `session.created` but before that return.
- **Verified fix:** Start Ticket and thread attachment directly from the `session.created` event, await the in-flight write on normal completion or prompt failure, and cover the interruption ordering in a service test. Recover only the explicitly identified historical row after verifying its Ticket and thread snapshot.

### ERR-20260903-001 — 授权任务记录补丁使用了不精确的中文上下文

- **Symptom:** 首次工具栏授权修复补丁在任务记录处校验失败，整块补丁未落盘。
- **Root cause:** 补丁上下文将原文 `非 Meegle 页` 误写成了 `非 Meegle页`，少了一个空格。
- **Verified fix:** 重新读取精确行内容，并将实现、测试和任务记录拆成小补丁应用；首次失败没有修改任何文件。

### ERR-20260903-002 — Extension typecheck 未加载 Vitest globals 类型

- **Symptom:** 移除两个测试文件对 `describe`、`it`、`expect` 的显式导入后，Vitest 定向测试通过，但 `pnpm --dir extension typecheck` 报告这些名称不存在。
- **Root cause:** Vitest 运行配置启用了 globals，但 `tsconfig.typecheck.json` 没有加载 `vitest/globals` 类型；仓库测试因此仍普遍使用显式导入。
- **Verified fix:** 在受影响测试中声明 `vitest/globals` 类型引用，继续直接使用 globals，同时避免为本次入口修复扩大共享 TypeScript 配置范围，并重新执行类型检查。

### ERR-20260903-003 — Sandbox blocked Meegle and PostgreSQL diagnostics

- **Symptom:** 沙箱内的 `meegle auth status` 因本机代理 socket 权限返回 server unreachable；随后只读 `pnpm exec tsx -e` 数据库诊断在创建 IPC pipe 时返回 `listen EPERM`。
- **Root cause:** 托管沙箱禁止访问本机代理 socket，并限制 tsx IPC/数据库隧道所需的进程通信；这些错误发生在到达 Meegle 或 PostgreSQL 之前。
- **Verified fix:** 使用获批的沙箱外只读执行重新运行精确命令；CLI 返回 authenticated，PostgreSQL 查询只输出脱敏后的同步运行错误摘要。
- **Recurrence:** 沙箱内读取 PM2 状态又因 `.pm2/*.sock` 权限与只读 `pm2.log` 失败；使用获批的精确 `pm2 status/jlist` 只读命令确认 staging API/Worker 仍加载旧 build。

### ERR-20260903-004 — Inline tsx regex broke outer shell quoting

- **Symptom:** 一次只读运行审计查询在 zsh 解析阶段报 `parse error near ')'`，没有连接数据库。
- **Root cause:** `tsx -e` 脚本由 shell 单引号包裹，而 JavaScript 正则又包含未转义的单引号，提前终止了 shell 字符串。
- **Verified fix:** 去掉诊断正则对引号字符的依赖，仅按 `updated_at`、比较符和日期分隔符匹配；同一脱敏只读查询随后成功确认旧进程仍发送空格时间。

### ERR-20260903-005 — Server full suite retained known environment failures

- **Symptom:** `pnpm --dir server test` 中 129 个文件、637 项测试通过，但 6 个 SQLite suite 无法加载 `node:sqlite`，logger dated-file 用例仍有一次落盘时序失败。
- **Root cause:** 当前 Node 22.12.0 不提供仓库 SQLite legacy tests 需要的 `node:sqlite`；logger 用例存在已知 transport flush race。两者均未经过本次 Meegle formatter 路径。
- **Verified fix:** 本次相关的三个测试文件 40/40 通过，Server TypeScript build 通过，真实只读 MQL 与重启后的 staging 手工同步通过；全量环境失败保留为明确验证边界。
### ERR-20260903-006 — psql COPY TO STDOUT corrupts JSON for json.loads

- **Symptom:** `json.loads` failed with `Expecting value: line 1 column 460` when reading `COPY (SELECT json_agg(...)) TO STDOUT` output from psql.
- **Root cause:** COPY text format re-escapes backslashes, so JSON-embedded `\n`/`\uXXXX` sequences arrive double-escaped and the payload no longer round-trips through `json.loads` reliably.
- **Verified fix:** Use plain `psql -t -A -q -c "SELECT json_agg(...) ..."` instead of COPY when the consumer parses the output as JSON.

### ERR-20260903-007 — Zod v4 `.default({})` silently breaks nested object defaults

- **Symptom:** `tsc` failed with "No overload matches this call" on `z.object({...}).default({})`, and at runtime `config.scheduler.tasks.lark` was `undefined` even though every child field had its own default.
- **Root cause:** This repo's Zod version types `.default()` against the *output* type, so `{}` is rejected at compile time; and a `.default()` value is applied as-is without parsing, so partial objects never pick up child defaults.
- **Verified fix:** Give every nested `.default()` the full output-shaped object (e.g. `.default({ enabled: true })`, and the parent `.default({ lark: { enabled: true }, ... })`). Write schema-default tests (`expect(config.scheduler.tasks.shadow.enabled).toBe(false)`) to lock the resolved values.

### ERR-20260903-008 — Sprint badge 补丁使用了不存在的 CSS 相邻规则

- **Symptom:** 首次跨文件 `apply_patch` 在 `global.css` 的插入点校验失败，整块补丁没有落盘。
- **Root cause:** 补丁假设 `.sprint-carryover-badge` 后紧邻筛选面板规则，但当前文件中间还有 Sprint 详情面板样式。
- **Verified fix:** 重新读取精确 CSS 局部并按共享逻辑、组件、样式、任务记录拆分补丁；随后 `git diff --check`、FE 31/31 测试文件和 production build 均通过。
