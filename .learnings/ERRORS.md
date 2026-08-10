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
