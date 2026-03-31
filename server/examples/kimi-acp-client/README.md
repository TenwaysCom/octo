# Kimi ACP Client Validation

This experiment validates that a local Node/TypeScript ACP client can:

- launch `kimi acp`
- initialize an ACP connection over stdio
- create a new session
- send one prompt
- print streamed updates and the final stop reason
- optionally stay attached in a manual REPL session until you exit

## Run

From [`server/package.json`](/home/uynil/projects/tw-itdog/server/package.json):

```bash
cd server
pnpm run kimi-acp:validate
```

Pass a custom prompt:

```bash
cd server
pnpm run kimi-acp:validate -- "请介绍一下当前会话状态"
```

Run the persistent REPL client:

```bash
cd server
pnpm run kimi-acp:repl
```

Optional REPL display switches:

```bash
cd server
pnpm run kimi-acp:repl -- --show-thoughts
pnpm run kimi-acp:repl -- --raw-events
```

## REPL Display Modes

The REPL has three practical display modes:

- Default mode
  - Command: `pnpm run kimi-acp:repl`
  - Shows assistant message text plus tool activity summaries
  - Hides `agent_thought_chunk`
- Thought mode
  - Command: `pnpm run kimi-acp:repl -- --show-thoughts`
  - Env: `KIMI_ACP_REPL_SHOW_THOUGHTS=1`
  - In an interactive TTY, consecutive thought chunks are merged into one human-friendly `[thought] ...` line
  - In non-TTY output like pipes or logs, thought chunks stay line-oriented instead of being merged
- Raw/debug mode
  - Command: `pnpm run kimi-acp:repl -- --raw-events`
  - Env: `KIMI_ACP_REPL_RAW=1`
  - Prints non-message ACP updates as raw JSON events for debugging
  - Disables human-friendly thought merging

If both `--show-thoughts` and `--raw-events` are enabled, raw/debug output wins.

Manual exit:

- type `/exit`
- type `/quit`
- or press `Ctrl-C`

## Config

Environment variables:

- `KIMI_ACP_COMMAND`
  - default: `kimi`
- `KIMI_ACP_ARGS_JSON`
  - default: `["acp"]`
- `KIMI_ACP_ENV_JSON`
  - default: `{}`
- `KIMI_ACP_REPL_SHOW_THOUGHTS`
  - default: unset / disabled
- `KIMI_ACP_REPL_RAW`
  - default: unset / disabled

Examples:

```bash
export KIMI_ACP_COMMAND=/home/uynil/.local/bin/kimi
export KIMI_ACP_ARGS_JSON='["acp"]'
export KIMI_ACP_ENV_JSON='{"DEBUG":"1"}'
```

If your shell exports proxy variables that break `kimi acp`, clear them with `KIMI_ACP_ENV_JSON`:

```bash
export KIMI_ACP_ENV_JSON='{"ALL_PROXY":"","all_proxy":"","HTTP_PROXY":"","http_proxy":"","HTTPS_PROXY":"","https_proxy":""}'
```

Constraints:

- the script uses `spawn(command, args, { env })`
- `KIMI_ACP_ARGS_JSON` must be a JSON array of strings
- `KIMI_ACP_ENV_JSON` must be a JSON object of string pairs
- prompt-time input never overrides command, args, or env
- REPL display flags only affect local terminal rendering; they do not change ACP session behavior

## Troubleshooting

- `spawn ENOENT`
  - `kimi` is not on `PATH`, or `KIMI_ACP_COMMAND` points to a missing file
- `KIMI_ACP_ARGS_JSON must be a JSON array of strings`
  - the args env var is not valid JSON array input
- `KIMI_ACP_ENV_JSON must be a JSON object of string pairs`
  - the env override is not valid JSON object input
- initialize fails immediately
  - local `kimi acp` is not authenticated or does not support ACP on this installation
- initialize fails with `Unknown scheme for proxy URL`
  - inherited `ALL_PROXY`/`all_proxy` is using a proxy scheme the Kimi runtime does not accept; clear it through `KIMI_ACP_ENV_JSON`
- no streamed updates after prompt
  - the ACP session was created but the prompt turn stalled; inspect stderr output
- permission request appears and the turn stops
  - this validator cancels all permission requests by default to avoid unsafe auto-approval
- Node exits but leaves a child process
  - check signal handling and confirm the script reaches the cleanup path
