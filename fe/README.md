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
| development | `http://localhost:3040` | Local Octo API server |
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

The Meegle card deliberately does not inspect or refresh any Meegle token. It
uses a nonce-only browser event to detect whether the Octo extension is
installed on the same origin, then either directs the user to authorize inside
the plugin on a Meegle page or obtains the package URL from
`/api/extension/version`. Configure `EXTENSION_DOWNLOAD_URL` on the server for
the latter.

Configure the server callback with the shared FE/API origin:

```bash
LARK_OAUTH_CALLBACK_URL=https://octo.example.com/api/lark/auth/callback
```

Register `LARK_OAUTH_CALLBACK_URL` in the Lark application. The server derives
the Web redirect and credentialed-CORS origin from this URL; FE and API must be
served on the same origin.

When packaging the extension, configure the same exact FE origin:

```bash
WXT_PUBLIC_OCTO_WEB_ORIGIN=https://octo.example.com pnpm --dir extension build
```

This grants the extension access only to the Octo FE origin; it does not add a
broad web permission.
