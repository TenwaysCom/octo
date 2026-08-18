# Errors

Record concise compiler/runtime errors, failed commands, wrong assumptions, and their verified fixes here. Redact secrets, cookies, tokens, and sensitive payloads.

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
