# Tenways Octo - Detailed System Architecture Design

> **Status**: Current implementation (as of 2026-07-06)
> **Scope**: Core modules, data flows, cross-layer boundaries, and design rationale

---

## 1. System Overview

Tenways Octo is a browser extension plus backend server that coordinates PM workflows across Lark (Feishu), Meegle, GitHub, and AI agents (Kimi ACP). The system follows a **thin extension, authoritative server** pattern:

- **Extension**: Page detection, context capture, auth triggers, UI rendering, action dispatch
- **Server**: Page/action catalog, identity resolution, auth management, workflow orchestration, platform adapters, persistence
- **Platforms**: Lark, Meegle, GitHub, Kimi ACP (external API boundaries)

### Design Principles

1. Server is the authoritative source for business logic and workflow orchestration
2. Extension is a thin client responsible only for context capture and UI rendering
3. Platform adapters own third-party API calls and error normalization
4. Meegle dynamic fields must be resolved through metadata, not hardcoded `field_*`
5. Cross-layer actions must carry `actionRunId` for diagnostic traceability

---

## 2. Layer Architecture

### 2.1 Browser Extension Layer

```
extension/src/
├── entrypoints/              # WXT entry point definitions
│   ├── background.ts         # Background service worker entry
│   ├── lark.content.ts      # Lark content script entry
│   ├── meegle.content.ts    # Meegle content script entry
│   ├── github.content.ts    # GitHub content script entry
│   └── page-bridge.ts       # Web-accessible page bridge
├── background/               # Background service worker
│   ├── router.ts            # Message router (Octo protocol)
│   ├── storage.ts            # Extension storage interface
│   └── handlers/            # Auth & identity handlers
├── content-scripts/          # Content script implementations
│   ├── lark.ts              # Lark page detection & sidebar
│   ├── meegle.ts            # Meegle auth code & identity
│   ├── github.ts            # GitHub PR/issue detection
│   └── lark-auth-callback.ts
├── popup-react/              # React popup UI
│   ├── App.tsx              # Root React application
│   ├── pages/               # Page components
│   └── components/          # UI components
├── popup-shared/             # Shared controllers (bridge)
│   ├── popup-controller.ts                # Main state controller
│   ├── popup-lark-bulk-create-controller.ts
│   ├── popup-meegle-push-controller.ts
│   └── popup-github-branch-create-controller.ts
├── injection/                # DOM injection for sidebar/actions
│   └── platforms/lark/      # Lark-specific injection (Vue)
└── types/                   # Shared type definitions
    ├── protocol.ts           # Octo protocol message types
    ├── context.ts            # Page context & identity types
    └── automation-actions.ts # Automation action definitions
```

#### Responsibilities

| Component | Owner | Responsibility |
|-----------|-------|----------------|
| **Popup UI** | `popup-react/` | Render server-driven actions, auth status, chat interface |
| **Content Scripts** | `content-scripts/` | Detect page type, capture context, inject sidebar/action buttons |
| **Background Router** | `background/router.ts` | Dispatch `octo.*` protocol messages between popup, content scripts, and server |
| **Popup Controllers** | `popup-shared/` | Bridge popup UI state to server API calls and runtime context |
| **DOM Injection** | `injection/` | Inject sidebar iframe and action buttons into platform pages |

#### Key Rules

- Extension MUST NOT contain business workflow logic
- Extension MUST NOT hardcode backend routes for business actions
- Extension MAY trigger auth flows, but token exchange/refresh is server-owned
- Extension MUST use server page config to determine action visibility (via `placements`)

---

### 2.2 Server Layer

```
server/src/
├── index.ts                          # Express app entry point
├── http/                             # HTTP middleware
│   ├── auth.ts                       # Auth middleware
│   ├── cors.ts                       # CORS configuration
│   └── request-logger.ts            # Request logging
├── modules/                          # Feature modules (controller + DTO)
│   ├── public-config/                # Page/action catalog
│   ├── identity/                     # Identity resolution
│   ├── meegle-auth/                 # Meegle auth token management
│   ├── lark-auth/                    # Lark OAuth flow
│   ├── lark-base/                    # Lark Base → Meegle workflow
│   ├── meegle-workitem/              # Meegle → Lark push
│   ├── lark-bug/                     # Lark bug analysis
│   ├── pm-analysis/                  # PM analysis workflows
│   ├── github-branch-create/         # GitHub branch creation
│   └── acp-kimi/                    # Kimi ACP chat proxy
├── application/                      # Business logic services
│   └── services/
│       ├── identity-resolution.service.ts
│       ├── meegle-apply.service.ts
│       ├── meegle-lark-push.service.ts
│       ├── lark-bug-analyze.service.ts
│       ├── pm-analysis.service.ts
│       └── acp-kimi-proxy.service.ts
├── adapters/                         # Platform API clients
│   ├── lark/                        # Lark API adapter
│   ├── meegle/                      # Meegle API adapter
│   ├── github/                       # GitHub REST API adapter
│   ├── kimi-acp/                    # Kimi ACP runtime adapter
│   └── postgres/                     # PostgreSQL persistence (Kysely)
├── domain/                           # Domain logic helpers
├── validators/                       # Agent output validation
└── logger.ts                         # Pino logger configuration
```

#### Module Details

| Module | Path | Purpose |
|--------|------|---------|
| **public-config** | `modules/public-config/` | Serves `/api/config/page?url=...` — the single source of truth for page/action catalog |
| **identity** | `modules/identity/` | Resolves `masterUserId` across Lark/Meegle/GitHub identities |
| **meegle-auth** | `modules/meegle-auth/` | Exchanges `auth_code` for Meegle token, refreshes tokens |
| **lark-auth** | `modules/lark-auth/` | Lark OAuth session creation/callback, token management |
| **lark-base** | `modules/lark-base/` | Lark Base record → Meegle workitem creation workflow |
| **meegle-workitem** | `modules/meegle-workitem/` | Meegle → Lark push (update Lark Base, send message, add reaction) |
| **lark-bug** | `modules/lark-bug/` | Lark bug record → analysis summary via ACP |
| **pm-analysis** | `modules/pm-analysis/` | Stale workitem detection, blocker analysis, PR review status |
| **github-branch-create** | `modules/github-branch-create/` | Preview/create GitHub branch from Meegle workitem |
| **acp-kimi** | `modules/acp-kimi/` | SSE-based chat proxy, session CRUD, event streaming |

#### Application Services

| Service | Purpose |
|---------|---------|
| `identity-resolution.service` | Resolves user identity across platforms, handles conflict detection |
| `meegle-apply.service` | End-to-end Meegle workitem creation from execution drafts |
| `meegle-lark-push.service` | Push Meegle updates back to Lark Base (link, message, reaction) |
| `lark-bug-analyze.service` | Analyze Lark bug records using Kimi ACP one-shot |
| `meegle-story-prd-to-simplified.service` | Convert Meegle story PRD to tech summary via ACP |
| `pm-analysis.service` | Run PM analysis: stale items, blockers, review status |
| `acp-kimi-proxy.service` | Proxy Kimi ACP chat sessions with streaming support |

---

### 2.3 Platform Adapter Layer

```
adapters/
├── lark/
│   ├── lark-client.ts              # Lark OpenAPI client (bitable, messenger)
│   ├── lark-contact-client.ts      # Lark contact resolution
│   └── types.ts                   # Lark API response types
├── meegle/
│   ├── meegle-client.ts           # Meegle workitem CRUD client
│   ├── meegle-auth-adapter.ts     # Meegle auth token management
│   └── types.ts                   # Meegle API response types
├── github/
│   └── github-client.ts           # GitHub REST API client
├── kimi-acp/
│   ├── kimi-acp-runtime.ts        # Kimi ACP process lifecycle
│   ├── kimi-acp-session-registry.ts
│   └── types.ts                   # ACP event types
└── postgres/
    ├── schema.ts                   # Kysely schema definition
    ├── resolved-user-store.ts       # User identity persistence
    ├── lark-token-store.ts         # Lark token persistence
    ├── meegle-token-store.ts       # Meegle token persistence
    └── workflow-prompt-store.ts    # Workflow prompt persistence
```

#### Adapter Responsibilities

| Adapter | APIs Covered | Error Normalization |
|---------|--------------|---------------------|
| **Lark** | Bitable records/fields, messenger, contacts | `LARK_*` error codes, raw status code preservation |
| **Meegle** | Workitem CRUD, metadata discovery, auth | `MEEGLE_*` error codes, field writability detection |
| **GitHub** | PR, issues, repos, branches, commits | `GITHUB_*` error codes, rate limit handling |
| **Kimi ACP** | Chat session, SSE streaming, one-shot | `ACP_*` error codes, concurrency limiting |
| **PostgreSQL** | User tokens, identity, prompts | Database constraint errors → domain errors |

---

## 3. Core Data Flows

### 3.1 Page Detection → Action Rendering

```
Browser Tab URL
    │
    ▼
[Content Script] Detect platform from URL pattern
    │
    ▼
[Popup] Call GET /api/config/page?url=<current_url>
    │
    ▼
[Server] Parse URL → match page rule → return ExtensionPageConfig
    │   {
    │     platform: "meegle",
    │     pageType: "workitem_detail",
    │     automationActions: [
    │       { key: "meegle.prd_to_simplified", executor: { type: "backend_api", ... }, placements: ["popup", "sidebar"] }
    │     ]
    │   }
    ▼
[Popup/Content Script] Filter actions by placements → render visible buttons
```

**Key files**:
- `extension/src/content-scripts/meegle.ts` — URL detection
- `server/src/modules/public-config/public-config.controller.ts` — page config API
- `extension/src/popup-shared/popup-controller.ts` — action rendering

---

### 3.2 Lark Base → Meegle Workitem Creation

```
[Lark Base Record Page]
    │
    ▼
[Extension] User clicks "Create Meegle Workitem" action
    │  Dispatches backend_api executor with:
    │  { baseId, tableId, recordId, masterUserId, actionRunId }
    ▼
[Server] POST /api/lark-base/create-workitem
    │
    ├─1─▶ [Server] Validate request, resolve masterUserId
    ├─2─▶ [Server] Build authenticated Lark client (refresh token if needed)
    ├─3─▶ [Lark Adapter] Fetch LarkBitableRecord
    ├─4─▶ [Server] Extract issue type → resolve WorkitemMapping
    ├─5─▶ [Server] Build ExecutionDraft (semantic fields)
    ├─6─▶ [Server] Refresh Meegle credential
    ├─7─▶ [Meegle Adapter] Create workitem from draft
    ├─8─▶ [Server] Write Meegle link back to Lark Base record
    └─9─▶ [Server] Return created workitem to extension
            │
            ▼
[Extension] Display result in popup/toast
```

**Key files**:
- `server/src/modules/lark-base/lark-base-workflow.service.ts`
- `server/src/application/services/meegle-apply.service.ts`
- `server/src/adapters/meegle/meegle-client.ts`

---

### 3.3 Meegle → Lark Push (Update + Message + Reaction)

```
[Meegle Workitem Page]
    │
    ▼
[Extension] User clicks "Push to Lark" action
    │  Dispatches with: { projectKey, workitemTypeKey, workitemId, actionRunId }
    ▼
[Server] POST /api/meegle-product-bug/update-and-push
    │
    ├─1─▶ [Server] Resolve masterUserId → meegleUserKey
    ├─2─▶ [Server] Refresh Meegle credential
    ├─3─▶ [Meegle Adapter] Fetch workitem details
    ├─4─▶ [Server] Extract Lark fields (link, message, status)
    ├─5─▶ [Server] Check if already updated → no-op if yes
    ├─6─▶ [Lark Adapter] Update Lark Base status (if record link exists)
    ├─7─▶ [Lark Adapter] Send Lark message (if message link exists)
    ├─8─▶ [Lark Adapter] Add reaction to message
    ├─9─▶ [Meegle Adapter] Update Meegle status field to "updated"
    └─10▶ [Server] Return result flags:
             { larkBaseUpdated, messageSent, reactionAdded, meegleStatusUpdated }
```

**Key files**:
- `server/src/modules/meegle-workitem/meegle-push.controller.ts`
- `server/src/application/services/meegle-lark-push.service.ts`

---

### 3.4 Auth Flow (Meegle)

```
[Meegle Page with Active Session]
    │
    ▼
[Content Script] Call Meegle BFF API to get auth_code
    │  POST /api/auth/code (uses page session cookie)
    ▼
[Background] Send auth_code to server
    │  POST /api/meegle-auth/exchange { authCode, masterUserId, meegleUserKey }
    ▼
[Server] Exchange auth_code for user token
    │  1. Use plugin_token + auth_code to call Meegle OAuth endpoint
    │  2. Receive user_token + refresh_token
    │  3. Store in PostgreSQL (meegle_token_store)
    │  4. Return success to extension
    ▼
[Extension] Update auth status in popup
```

**Security rule**: Extension MUST NOT send raw cookies to server. Auth code is a one-time credential.

**Key files**:
- `extension/src/content-scripts/meegle.ts`
- `extension/src/background/handlers/meegle-auth.ts`
- `server/src/modules/meegle-auth/meegle-auth.service.ts`

---

### 3.5 ACP One-Shot Analysis (Story Back-Brief / Bug Analysis)

```
[Meegle Story Detail Page]
    │
    ▼
[Extension] User clicks "Generate Tech Summary" action
    │  Dispatches with: { workitemUrl, actionRunId }
    ▼
[Server] POST /api/meegle-user-story/prd-to-simplified
    │
    ├─1─▶ [Server] Validate request, resolve identity
    ├─2─▶ [Server] Refresh Meegle credential
    ├─3─▶ [Meegle Adapter] Fetch story workitem details
    ├─4─▶ [Server] Read storySummary semantic field
    ├─5─▶ [Server] Acquire ACP concurrency slot (limit: 3)
    ├─6─▶ [ACP Adapter] Create one-shot Kimi runtime
    ├─7─▶ [ACP Adapter] Initialize → session/new → prompt
    ├─8─▶ [Server] Collect agent_message_chunk text
    ├─9─▶ [ACP Adapter] Close runtime (in finally block)
    ├─10▶ [Server] Write collected text to techSummary field
    └─11▶ [Server] Return result or typed error
```

**Key files**:
- `server/src/application/services/meegle-story-prd-to-simplified.service.ts`
- `server/src/adapters/kimi-acp/kimi-acp-runtime.ts`
- `server/src/application/services/acp-kimi-proxy.service.ts`

**Concurrency control**: Configured via `STORY_PRD_TO_SIMPLIFIED_ACP_CONCURRENCY_LIMIT` (default: 3)

**Timeout control**: Configured via `STORY_PRD_TO_SIMPLIFIED_ACP_TIMEOUT_MS` (default: 110000)

---

## 4. Cross-Layer Boundaries

### 4.1 Extension ↔ Server Boundary

| Responsibility | Extension | Server |
|---------------|-----------|--------|
| Page type detection | Preliminary (for config fetch) | Canonical (returns `pageType` in config) |
| Action catalog | Renders server-driven actions | Defines all actions in `public-config` |
| Auth triggering | Triggers OAuth/auth_code acquisition | Exchanges codes, stores tokens, refreshes |
| Context capture | Captures URL, record ID, selected rows | Receives sanitized context in action request |
| UI rendering | Renders popup/sidebar/action buttons | Returns `placements` to control rendering |
| Workflow execution | N/A | Owns all business workflow logic |

### 4.2 Server ↔ Adapter Boundary

| Responsibility | Server (Modules/Services) | Adapters |
|----------------|----------------------------|----------|
| Business decisions | Orchestration, field mapping, retry logic | N/A |
| API request construction | N/A | Request normalization, header/token injection |
| Error interpretation | Converts adapter errors to `OctoActionError` | Normalizes platform errors to typed error codes |
| Field metadata | Resolves semantic fields → `field_key` | Fetches raw metadata from platform |
| Token management | Refreshes tokens before API calls | Uses tokens provided by server |

### 4.3 Forbidden Patterns

| Pattern | Why Forbidden | Correct Approach |
|---------|----------------|-------------------|
| Extension hardcodes `field_*` | Breaks when Meegle changes field schema | Use metadata resolver in server |
| Extension contains workflow logic | Violates thin-client principle | Move logic to server application service |
| Adapter makes business decisions | Adapters should be platform-agnostic | Return normalized data to server for decision |
| Server depends on extension UI state | Creates tight coupling | Server owns business state; extension reads from server |
| Raw cookies sent to server | Security violation | Use `auth_code` bridge pattern |

---

## 5. Data Model

### 5.1 Core Entities

```
ResolvedUser (PostgreSQL: users)
├── id: string                    # UUID
├── masterUserId: string          # Primary identity key
├── larkUserId: string?          # Lark user ID
├── meegleUserKey: string?       # Meegle user key
├── githubUsername: string?       # GitHub username
└── createdAt: timestamp

UserToken (PostgreSQL: user_tokens)
├── id: string
├── userId: string               # References users.id
├── provider: "lark" | "meegle" | "github"
├── accessToken: encrypted
├── refreshToken: encrypted?
├── expiresAt: timestamp?
└── updatedAt: timestamp

WorkflowPrompt (PostgreSQL: workflow_prompts)
├── key: string                  # e.g., "meegle.story.prd_to_simplified"
├── prompt: string               # Template with {{variables}}
├── note: string                 # Owner/usage description
└── updatedAt: timestamp
```

### 5.2 Technical Objects (Lifecycle)

See `docs/ai-dev/lifecycle/current-system-technical-objects.md` for complete lifecycle definitions.

| Object | Owner Layer | Purpose |
|--------|-------------|---------|
| `ExtensionPageConfig` | Server | Page/action catalog for extension consumption |
| `AutomationActionConfig` | Server | Action definition with executor contract |
| `PopupPageContext` | Extension | Current page URL, record IDs, selected rows |
| `IdentityState` / `masterUserId` | Server | Resolved user identity across platforms |
| `MeegleAuthCredential` | Server | Meegle user token (exchanged from auth_code) |
| `LarkAuthCredential` | Server | Lark OAuth token (exchanged from OAuth callback) |
| `LarkBitableRecord` | Platform | Lark Base record data (normalized by adapter) |
| `ExecutionDraft` | Server | Intermediate object: Lark record → Meegle workitem |
| `MeegleWorkitem` | Platform | Meegle workitem (normalized by adapter) |
| `MeegleFieldMetadata` | Platform → Server | Field schema for semantic field resolution |
| `ActionRunTrace` | Cross-layer | Diagnostic trace with `actionRunId` |

---

## 6. Error Handling

### 6.1 Error Envelope

All cross-layer errors MUST conform to:

```typescript
type OctoActionError = {
  layer: "extension" | "server" | "adapter" | "platform";
  module: string;                    // e.g., "meegle-apply", "lark-client"
  stage: string;                     // e.g., "server.workflow.started", "adapter.meegle.request"
  errorCode: string;                 // e.g., "MEEGLE_AUTH_REQUIRED", "LARK_API_ERROR"
  errorMessage: string;              // Human-readable message
  actionRunId: string;              // For diagnostic tracing
  rawStatusCode?: number;             // Platform HTTP status code (safe to log)
  rawResponseSummary?: string;        // Truncated platform response (safe to log)
};
```

### 6.2 Error Code Conventions

| Prefix | Meaning | Examples |
|--------|---------|----------|
| `MEEGLE_*` | Meegle platform errors | `MEEGLE_AUTH_REQUIRED`, `MEEGLE_FIELD_NOT_FOUND`, `MEEGLE_STATE_TRANSITION_BLOCKED` |
| `LARK_*` | Lark platform errors | `LARK_TOKEN_EXPIRED`, `LARK_RECORD_NOT_FOUND` |
| `GITHUB_*` | GitHub platform errors | `GITHUB_RATE_LIMITED`, `GITHUB_REPO_NOT_FOUND` |
| `ACP_*` | Kimi ACP runtime errors | `ACP_CONCURRENCY_LIMITED`, `ACP_ANALYSIS_TIMEOUT`, `ACP_PROCESS_EXITED` |
| `IDENTITY_*` | Identity resolution errors | `IDENTITY_NOT_FOUND`, `IDENTITY_CONFLICT` |
| `VALIDATION_*` | Input validation errors | `VALIDATION_MISSING_FIELD`, `VALIDATION_INVALID_URL` |

---

## 7. Testing Strategy

### 7.1 Test Layers

| Layer | Tool | Purpose | File Pattern |
|-------|------|---------|--------------|
| **Unit** | Vitest | Single module logic, DTO validation, mapper, dispatcher | `*.test.ts` (colocated) |
| **Mock Integration** | Vitest | Multi-service orchestration with mocked platforms | `*.integration.test.ts` or `integration/*.test.ts` |
| **Live E2E** | Playwright | Real browser extension + server + target pages + auth | `e2e/*.spec.ts` |

### 7.2 Live E2E Smoke Coverage

Minimum smoke test must verify:

1. Open target Lark or Meegle page
2. Extension fetches `/api/config/page`
3. Popup/sidebar renders matched actions
4. New/refactored action produces `actionRunId`
5. Failure can be traced to a specific layer/module/stage

---

## 8. Key Design Decisions

### 8.1 Thin Extension, Authoritative Server

**Decision**: All business workflow logic resides in the server. Extension is responsible only for context capture, auth triggering, and UI rendering.

**Rationale**:
- Easier to update workflows without redeploying extension
- Centralized business logic reduces drift between extension versions
- Server can enforce auth, rate limiting, and audit logging

### 8.2 Executor-Driven Action Dispatch

**Decision**: Actions are defined with an `executor` contract (`frontend` vs `backend_api`). Extension renders and dispatches based on executor type.

**Rationale**:
- New backend actions don't require extension code changes
- Executor contract provides clear separation of concerns
- `placements` field controls where actions appear (popup/sidebar/page_dom)

### 8.3 Metadata-Resolved Meegle Fields

**Decision**: Meegle dynamic fields (`field_*`) must be resolved through a metadata resolver, not hardcoded.

**Rationale**:
- Meegle field keys change across projects and workitem types
- Hardcoding `field_*` breaks when Meegle schema evolves
- Metadata resolver provides semantic field mapping (`larkRecordLink` → actual `field_key`)

### 8.4 ACP One-Shot for Analysis

**Decision**: AI analysis workflows (story back-brief, bug analysis) use one-shot ACP runtime, not reusable chat sessions.

**Rationale**:
- One-shot avoids session state management complexity
- Analysis is stateless: each request is independent
- Concurrency limiting is simpler with one-shot model

### 8.5 PostgreSQL as Primary Store

**Decision**: PostgreSQL (via Kysely ORM) is the primary persistence layer. SQLite is legacy/migration-only.

**Rationale**:
- PostgreSQL provides ACID guarantees for token storage
- Kysely provides type-safe query building
- Schema migrations are version-controlled

---

## 9. File Reference

### 9.1 Entry Points

| Component | File | Description |
|-----------|------|-------------|
| Server | `server/src/index.ts` | Express app initialization, route registration |
| Extension Background | `extension/src/entrypoints/background.ts` | Service worker entry, router initialization |
| Extension Popup | `extension/src/popup/main.tsx` | React entry point |
| Content Script (Lark) | `extension/src/entrypoints/lark.content.ts` | Lark page content script |

### 9.2 Key Configuration

| File | Purpose |
|------|---------|
| `server/package.json` | Server dependencies, scripts |
| `extension/package.json` | Extension dependencies, scripts |
| `extension/wxt.config.ts` | WXT build configuration, aliases, permissions |
| `extension/manifest.json` | Chrome extension manifest (MV3) |

---

## 10. Related Documents

| Document | Path | Purpose |
|----------|------|---------|
| Technical Objects Lifecycle | `docs/ai-dev/lifecycle/current-system-technical-objects.md` | Object lifecycle across layers |
| System Boundaries & Code Rules | `docs/ai-dev/rules/system-boundaries-and-code-rules.md` | Cross-layer coding rules |
| Extension Code Rules | `docs/ai-dev/rules/extension-code-rules.md` | Extension-specific rules |
| Server Code Rules | `docs/ai-dev/rules/server-code-rules.md` | Server-specific rules |
| High-Level Architecture | `docs/tenways-octo/04-architecture.md` | Original architecture design |
| Meegle Adapter Design | `docs/tenways-octo/09-meegle-adapter-design.md` | Meegle adapter layer design |
| Auth Bridge Design | `docs/tenways-octo/10-meegle-auth-bridge-design.md` | Meegle auth code bridge |
| ACP Design | `docs/tenways-octo/17-acp-design.md` | Kimi ACP integration design |
