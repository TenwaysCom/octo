# Tenways Octo FE

Vite + React login application, styled after the Mosaic React authentication
layout.

```bash
pnpm --dir fe check
pnpm --dir fe dev
pnpm --dir fe build
```

`dev` starts at `http://localhost:4173`; `build` writes deployable static files
to `fe/dist/`.

## FE-owned environment configuration

The FE chooses its own API base URL. It does not read the extension's
`SERVER_URL` or `chrome.storage`.

| Environment | `VITE_API_BASE_URL` | Purpose |
| --- | --- | --- |
| development | `/api` | Vite proxies to local Octo API server on port `3040` |
| production | `/api` | Same-origin reverse-proxied BFF/API |

Copy `.env.example` to `.env.local` to override the value without committing
it. Values prefixed with `VITE_` are bundled into browser JavaScript, so they
must never contain credentials.

For a production static deployment, serve `dist/` and reverse proxy `/api` to
the Octo server. A separate API domain needs an explicit CORS policy; same
origin is preferred. See [deployment instructions](docs/deployment.md).

## Lark login boundary

The login button opens Lark OAuth through `GET /api/lark/auth/web/start`.
After the server callback exchanges the one-time authorization code, it finds
or creates the Octo user by `(tenantKey, larkUserId)`, stores the Lark token
server-side, and returns an opaque `HttpOnly; SameSite=Lax` web-session cookie.
The FE calls `/api/lark/auth/web/ensure` and `/api/web/profile` with that
cookie; it never receives a `masterUserId`, Lark token, Meegle cookie, or
Chrome extension data. A Lark token that cannot be refreshed is shown as
"需要重新授权" on the personal page; it does not invalidate the Octo Web session.

The Meegle card reads only the sanitized `meegleAuthorization.status` from
`/api/web/profile`. The server checks its stored Meegle credential without
refreshing it; the FE never receives a Meegle token, cookie, user key, base URL,
or authorization time. When authorization is required, users complete it in
the Octo plugin on a Meegle page.

Configure the server callback with the shared FE/API origin:

```bash
LARK_OAUTH_CALLBACK_URL=https://octo.example.com/api/lark/auth/callback
```

Register `LARK_OAUTH_CALLBACK_URL` in the Lark application. The server derives
the Web redirect and credentialed-CORS origin from this URL; FE and API must be
served on the same origin.

The extension package has exact built-in matches for the current `prod`,
`test`, and `dev` Octo server origins. Its active environment must match the
current FE/API origin before it can approve a plugin login:

```bash
pnpm --dir extension build
```

This does not add a broad web permission or read any browser cookie.

## Local plugin-login verification

For local browser verification, keep the browser-facing origin at
`http://localhost:4173`. Vite proxies `/api/*` to the local Octo server at
`http://localhost:3040`, so the FE and HttpOnly session cookies remain
same-origin in the browser.

```bash
LARK_OAUTH_CALLBACK_URL=http://localhost:4173/api/lark/auth/callback PORT=3040 pnpm --dir server dev
pnpm --dir fe dev
```

Reload the unpacked extension, choose `dev` in its settings, and set its
custom `SERVER_URL` to `http://localhost:4173`. The extension accepts this as a
custom dev URL and its localhost content-script match covers port `4173`.

To exercise plugin login successfully, the local server database needs the
current plugin user's active Lark authorization. Real Lark OAuth callback
verification additionally requires that the Lark app accepts the localhost
callback URL; otherwise use the test deployment for that E2E case.
