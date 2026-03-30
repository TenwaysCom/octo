# Kimi ACP Client Validation

This experiment validates that a local Node/TypeScript ACP client can:

- launch `kimi acp`
- initialize an ACP connection over stdio
- create a new session
- send one prompt
- print streamed updates and the final stop reason

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

## Config

Environment variables:

- `KIMI_ACP_COMMAND`
  - default: `kimi`
- `KIMI_ACP_ARGS_JSON`
  - default: `["acp"]`
- `KIMI_ACP_ENV_JSON`
  - default: `{}`

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
