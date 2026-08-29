---
name: octo-platform-data
description: Read synchronized Octo Sprint, GitHub PR, and Lark Ticket data through octo-cli when current local platform context is needed. Do not use this skill to write platform data or manage browser authentication.
---

# Octo Platform Data

Before querying, read `octo-cli skills read octo-shared` for setup, Profile, diagnostics, and error-handling rules.

Use `octo-cli` for read-only data that Octo has already synchronized. The CLI authenticates to Octo with an agent API token; it does not accept or transmit browser cookies, or Lark, Meegle, and GitHub credentials.

## Setup

If the command or configuration is absent, ask the user to provide an Octo server URL and an agent API token, then configure it:

```bash
octo-cli config set --server-url https://octo.example --api-token <agent-token>
```

Treat the token as sensitive. Do not print it, put it in prompts, or add it to project files.

## Read operations

```bash
octo-cli sprint burndown --project-key <project-key> --sprint-id <sprint-id>
octo-cli sprint tasks --project-key <project-key> --sprint-id <sprint-id>
octo-cli github pr --owner <owner> --repo <repo> --number <number>
octo-cli lark ticket --base-id <base-id> --table-id <table-id> --record-id <record-id>
octo-cli odoo branches --environment <eu|uk|us>
```

Report returned snapshot timestamps and data-source labels when present. A missing snapshot or incomplete historical Sprint data is a data limitation, not evidence that the external platform has no data. Do not silently retry by calling Lark, Meegle, or GitHub directly.

## Verification boundary

CLI output proves only the Octo API response at the time it was read. It does not prove external-platform real-time state, a sync has just run, or a production deployment is healthy.
