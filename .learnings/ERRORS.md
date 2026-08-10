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
