This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tenways Octo is a cross-platform coordination assistant for PMs and requirement owners. It's a Chrome extension + backend server that provides semi-automatic work item creation between Lark (A1/A2) and Meegle (B1/B2), plus PM analysis capabilities.

- **Source code**: `src/agents/` contains the implementation.
- **Tests**: `tests/` with a short guide in `tests/README.md`.
- **Documentation**: markdown pages live in `docs/` 
- **PR template**: .github/pull_request_template.md describes the information every PR must include.
- **Key Principle**: The extension is a thin client (trigger + context collection + display). All business logic and AI orchestration happens on the server.

## Development Commands

### Server (server/)
```bash
npm run build    # Compile TypeScript
npm run dev      # Watch mode
npm start        # Run server (requires build first)
npm test         # Run vitest tests
```

### Extension (extension/)
```bash
pnpm run build    # Compile + copy assets to dist/
pnpm run dev      # Watch mode
pnpm run package  # Create .zip for Chrome Web Store
npm test         # Run vitest tests
```

### Running Tests
```bash
# Server tests
cd server && npm test

# Extension tests
cd extension && npm test

# Run single test file
npx vitest run src/path/to/test.ts
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│ Chrome Extension│────▶│ Backend Server   │
│ (popup.js,      │     │ (Express + TS)   │
│  background/,   │     │                  │
│  content-scripts│     │ Modules:         │
│ )               │     │ - meegle-auth    │
└─────────────────┘     │ - lark-auth      │
                        │ - a1/a2 workflows│
                        │ - identity       │
                        └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │Lark API  │ │Meegle API│ │GitHub API│
              └──────────┘ └──────────┘ └──────────┘
```

### Key Directories

**Extension**:
- `src/background/` - Service worker, message routing, auth handlers
- `src/content-scripts/` - Per-platform DOM interaction (lark.ts, meegle.ts)
- `src/popup.js` + `popup.html` - UI

**Server**:
- `src/modules/` - Controllers and DTOs for each domain
- `src/adapters/` - External API clients (meegle/, lark/)
- `src/application/services/` - Business logic layer

## Authentication Flow (Meegle)

Uses "Auth Code Bridge" pattern - extension gets auth code from logged-in Meegle page, server exchanges for tokens:

```
Extension (content script) ──▶ Meegle BFF ──▶ auth_code
                                              │
Extension (background) ◀──────────────────────┘
         │
         ▼
Server /api/meegle/auth/exchange ──▶ plugin_token + user_token
```

**Critical**: Never send raw cookies to server. Auth codes are one-time use.


## Environment Variables

Server `.env`:
```
LARK_APP_ID=
LARK_APP_SECRET=
MEEGLE_PLUGIN_ID=
MEEGLE_PLUGIN_SECRET=
MEEGLE_BASE_URL=https://project.larksuite.com
PORT=3000
```

## Key Patterns

1. **Two-phase writes**: All creation operations use `draft` + `apply` pattern
2. **Dependency injection**: Services receive deps objects for testability
3. **Zod validation**: All API inputs validated with Zod schemas
4. **Error envelope**: All responses use `{ ok, data, error }` format

## Testing

- Unit tests use vitest with `describe/it/expect` pattern
- Mock Chrome APIs in extension tests (see `extension/test/setup.ts`)
- Services receive mock adapters via deps parameter

## Documentation

Key docs in `docs/tenways-octo/`:
- [04-architecture.md](docs/tenways-octo/04-architecture.md) - System architecture
- [10-meegle-auth-bridge-design.md](docs/tenways-octo/10-meegle-auth-bridge-design.md) - Auth flow details
- [16-auth-flow-design.md](docs/tenways-octo/16-auth-flow-design.md) - Auth implementation status


## Commit Messages

Write commit messages and PR descriptions as a humble but experienced engineer would. Keep it casual, avoid listicles, briefly describe what we're doing and highlight non-obvious implementation choices but don't overthink it.

Don't embarrass me with robot speak, marketing buzzwords, or vague fluff. You're not writing a fucking pamphlet. Just leave a meaningful trace so someone can understand the choices later. Assume the reader is able to follow the code perfectly fine.