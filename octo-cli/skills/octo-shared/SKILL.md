---
name: octo-shared
description: Use for octo-cli setup, profile selection, agent-token configuration, diagnostics, API schema checks, and interpreting read-only API failures.
---

# Octo CLI shared rules

Use `octo-cli` only for the read-only Octo Agent API. It does not accept browser cookies, Lark/Meegle/GitHub/Odoo credentials, raw HTTP requests, or SQL.

## Agent quickstart

1. Discover the applicable skill with `octo-cli skills list` and read it with `octo-cli skills read <name>`.
2. Prefer the documented task command. Before a new command shape, inspect `octo-cli schema [name]`.
3. Check local configuration with `octo-cli doctor --offline`. Run `octo-cli doctor` only when a network check is useful.
4. Use the selected Profile consistently. Do not switch, remove, or overwrite a Profile unless the user explicitly asks.
5. Interpret JSON using `ok == true` and the process exit code. On failure, report `error.errorCode`; do not retry through an external platform API.

## Setup and profiles

Request an Octo Server URL and least-privilege agent token when they are absent:

```bash
octo-cli config set --server-url https://octo.example --api-token <agent-token>
```

Tokens are sensitive. Do not print, log, commit, or place them in prompts or project files. Use a named Profile for a distinct environment and select it for a single command with `--profile <name>`; environment variable `OCTO_CLI_PROFILE` has the same purpose.

## Failure boundary

`UNAUTHORIZED` means the Agent API rejected its token. `SNAPSHOT_NOT_FOUND` means Octo has no matching projection. Neither proves that the source platform record is absent. A connection failure or failed `/health` check is an Octo service/network issue, not permission to bypass Octo with direct Lark, Meegle, GitHub, Odoo, browser, or SQL access.

## Risk

All current octo-cli data commands are `read` operations. Future write commands must expose their risk in `schema`, support a request preview, and require explicit user confirmation before execution. Do not infer that this read-only client authorizes any mutation.
