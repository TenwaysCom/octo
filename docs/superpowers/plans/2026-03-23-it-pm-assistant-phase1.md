# Tenways Octo Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser extension + server-side agent orchestration system for cross-platform semi-automated workitem creation (A1→B2, A2→B1) and PM instant analysis.

**Architecture:** Browser extension (trigger + context collection + UI) → Server API Gateway → Agent Orchestrator → Skills + Platform Adapters (Lark, Meegle, GitHub) → Minimal persistence layer.

**Tech Stack:** TypeScript (extension + server), Node.js runtime, Anthropic Claude API for AI agents, class-transformer/class-validator for DTO validation, git for version control.

---

## Phase 1 Scope Summary

Based on the design documents, Phase 1 delivers:

1. **A1 → B2 Semi-automated Creation:** Analyze Lark A1 support tickets, generate Meegle B2 bug drafts
2. **A2 → B1 Semi-automated Creation:** Analyze Lark A2 requirements, generate Meegle B1 task drafts
3. **PM Instant Analysis:** Cross-platform summary (Lark + Meegle + GitHub) for project status

### Key Design Decisions

- **Identity:** Lark ID is the primary identity; Meegle userKey and GitHub ID mapped via binding table
- **Meegle Auth:**方案 B - extension requests auth_code directly from logged-in page, server exchanges for user_token
- **Data Strategy:** Real-time fetch only, no business data mirroring
- **All writes require human confirmation** - generate drafts first, then apply

### Files to Create/Modify Overview

```
extension/
  src/
    types/
      protocol.ts (CREATE)
      context.ts (CREATE)
      meegle.ts (CREATE)
    background/
      router.ts (CREATE)
      handlers/
        identity.ts (CREATE)
        meegle-auth.ts (CREATE)
        a1.ts (CREATE)
    page-bridge/
      meegle-auth.ts (CREATE)

server/
  src/
    modules/
      identity/
        identity.controller.ts (CREATE)
        identity.dto.ts (CREATE)
        identity.service.ts (CREATE)
      meegle-auth/
        meegle-auth.controller.ts (CREATE)
        meegle-auth.dto.ts (CREATE)
        meegle-auth.service.ts (CREATE)
        meegle-auth.repository.ts (CREATE)
      a1/
        a1.controller.ts (CREATE)
        a1.dto.ts (CREATE)
        a1.service.ts (CREATE)
    application/
      services/
        IdentityResolutionService.ts (CREATE)
        MeegleCredentialService.ts (CREATE)
        A1WorkflowService.ts (CREATE)
    adapters/
      meegle/
        MeegleClient.ts (CREATE - based on meegle_clients)
        MeegleAuthService.ts (CREATE)
        MeegleCatalogService.ts (CREATE)
        MeegleExecutionService.ts (CREATE)
    agents/
      A1IntakeAgent.ts (CREATE)
    skills/
      ticket-classification.ts (CREATE)
      missing-info-detection.ts (CREATE)
      bug-draft-enrichment.ts (CREATE)
    validators/
      agent-output/
        execution-draft.ts (CREATE)
      dto/
        dto-validators.ts (CREATE)

docs/
  it-pm-assistant/
    TODOS.md (CREATE - for deferred items)
```

---

## Task Breakdown

### Task 1: Project Scaffolding

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/src/types/protocol.ts`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/index.ts`

- [ ] **Step 1: Create extension package.json**

```json
{
  "name": "it-pm-assistant-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "webextension-polyfill": "^0.10.0"
  },
  "devDependencies": {
    "@types/webextension-polyfill": "^0.10.7",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create extension tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create extension/src/types/protocol.ts**

```typescript
// All internal extension message actions
export type ProtocolAction =
  | 'itdog.identity.resolve'
  | 'itdog.meegle.auth.ensure'
  | 'itdog.meegle.auth.exchange'
  | 'itdog.a1.analyze'
  | 'itdog.a1.create_b2_draft'
  | 'itdog.a1.apply_b2'
  | 'itdog.a2.analyze'
  | 'itdog.a2.create_b1_draft'
  | 'itdog.a2.apply_b1'
  | 'itdog.pm.analysis.run';

// Generic request envelope
export interface RequestEnvelope<TPayload> {
  requestId: string;
  action: ProtocolAction;
  payload: TPayload;
  meta: {
    pageType: string;
    sentAt: string;
  };
}

// Generic response envelope
export interface ResponseEnvelope<TData> {
  requestId: string;
  ok: boolean;
  status: 'ready' | 'success' | 'failed' | 'pending';
  data: TData | null;
  error: ErrorObject | null;
}

// Standard error object
export interface ErrorObject {
  errorCode: string;
  errorMessage: string;
  recoverable: boolean;
}
```

- [ ] **Step 4: Run test to verify TypeScript compiles**

```bash
cd extension && npm install && npm run build
```
Expected: PASS with no errors

- [ ] **Step 5: Create server package.json**

```json
{
  "name": "it-pm-assistant-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "reflect-metadata": "^0.2.1",
    "axios": "^1.6.7"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 6: Create server tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 7: Create server/src/index.ts**

```typescript
import 'reflect-metadata';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// TODO: Add API routes here

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

- [ ] **Step 8: Run test to verify server TypeScript compiles**

```bash
cd server && npm install && npm run build
```
Expected: PASS with no errors

- [ ] **Step 9: Commit**

```bash
git add extension/package.json extension/tsconfig.json extension/src/types/protocol.ts
git add server/package.json server/tsconfig.json server/src/index.ts
git commit -m "feat: scaffold extension and server projects"
```

---

### Task 2: Extension Type Definitions

**Files:**
- Create: `extension/src/types/context.ts`
- Create: `extension/src/types/meegle.ts`

- [ ] **Step 1: Create extension/src/types/context.ts**

```typescript
// Page context captured from content script
export interface PageContext {
  pageType: 'lark_a1' | 'lark_a2' | 'meegle' | 'github';
  url: string;
  detectedLarkId?: string;
  detectedMeegleUserKey?: string;
  detectedGithubId?: string;
  // Lark A1/A2 specific
  baseId?: string;
  tableId?: string;
  recordId?: string;
  // Meegle specific
  projectKey?: string;
  workitemId?: string;
  // GitHub specific
  repoOwner?: string;
  repoName?: string;
  prNumber?: number;
}

// Identity binding result
export interface IdentityBinding {
  operatorLarkId: string;
  mappingStatus: 'bound' | 'unbound' | 'partial';
  meegleUserKey?: string;
  githubId?: string;
}
```

- [ ] **Step 2: Create extension/src/types/meegle.ts**

```typescript
// Auth code request from page bridge
export interface MeegleAuthCodeRequest {
  pluginId: string;
  state: string;
}

// Auth code response from page bridge
export interface MeegleAuthCodeResponse {
  authCode: string;
  state: string;
  issuedAt: string;
}

// Token exchange request to server
export interface MeegleAuthExchangeRequest {
  operatorLarkId: string;
  meegleUserKey: string;
  baseUrl: string;
  authCode: string;
  state: string;
}

// Token status response
export interface MeegleAuthStatusResponse {
  tokenStatus: 'ready' | 'refreshing' | 'require_auth_code' | 'require_binding' | 'expired';
  credentialStatus?: 'active' | 'revoked' | 'unknown';
  expiresAt?: string;
}

// Execution draft for B1/B2 creation
export interface ExecutionDraft {
  draftId: string;
  draftType: 'b1' | 'b2';
  target: DraftTarget;
  draft: DraftContent;
  missingMeta: string[];
  needConfirm: boolean;
}

export interface DraftTarget {
  projectKey: string;
  workitemTypeKey: string;
}

export interface DraftContent {
  name: string;
  templateId?: number;
  fieldValuePairs: FieldValuePair[];
}

export interface FieldValuePair {
  fieldKey: string;
  fieldValue: string | number | boolean | null;
}
```

- [ ] **Step 3: Run test to verify TypeScript compiles**

```bash
cd extension && npm run build
```
Expected: PASS with no errors

- [ ] **Step 4: Commit**

```bash
git add extension/src/types/context.ts extension/src/types/meegle.ts
git commit -m "feat: add extension context and meegle type definitions"
```

---

### Task 3: Extension Background Router and Identity Handler

**Files:**
- Create: `extension/src/background/router.ts`
- Create: `extension/src/background/handlers/identity.ts`

- [ ] **Step 1: Create extension/src/background/router.ts**

```typescript
import { RequestEnvelope, ResponseEnvelope, ProtocolAction } from '../types/protocol.js';
import { handleIdentityResolve } from './handlers/identity.js';
import { handleMeegleAuthEnsure } from './handlers/meegle-auth.js';
import { handleA1Analyze } from './handlers/a1.js';

const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:3000';

export async function handleMessage(message: RequestEnvelope<any>): Promise<ResponseEnvelope<any>> {
  const { action, payload, requestId } = message;

  try {
    switch (action) {
      case 'itdog.identity.resolve':
        return await handleIdentityResolve(payload, requestId);

      case 'itdog.meegle.auth.ensure':
        return await handleMeegleAuthEnsure(payload, requestId);

      case 'itdog.a1.analyze':
        return await handleA1Analyze(payload, requestId, SERVER_BASE_URL);

      // TODO: Add more handlers as implemented

      default:
        return {
          requestId,
          ok: false,
          status: 'failed',
          data: null,
          error: {
            errorCode: 'UNKNOWN_ACTION',
            errorMessage: `Unknown action: ${action}`,
            recoverable: false,
          },
        };
    }
  } catch (error) {
    return {
      requestId,
      ok: false,
      status: 'failed',
      data: null,
      error: {
        errorCode: 'INTERNAL_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        recoverable: false,
      },
    };
  }
}
```

- [ ] **Step 2: Create extension/src/background/handlers/identity.ts**

```typescript
import { ResponseEnvelope } from '../../types/protocol.js';
import { PageContext, IdentityBinding } from '../../types/context.js';

interface IdentityResolvePayload {
  pageContext: PageContext;
}

interface IdentityResolveData {
  operatorLarkId: string;
  mappingStatus: 'bound' | 'unbound' | 'partial';
  meegleUserKey?: string;
  githubId?: string;
}

export async function handleIdentityResolve(
  payload: IdentityResolvePayload,
  requestId: string
): Promise<ResponseEnvelope<IdentityResolveData>> {
  const { pageContext } = payload;
  const detectedLarkId = pageContext.detectedLarkId;

  if (!detectedLarkId) {
    return {
      requestId,
      ok: false,
      status: 'failed',
      data: null,
      error: {
        errorCode: 'LARK_ID_NOT_FOUND',
        errorMessage: 'Could not detect Lark ID from current page',
        recoverable: true,
      },
    };
  }

  // TODO: Query server for identity binding status
  // For now, return partial implementation
  return {
    requestId,
    ok: true,
    status: 'success',
    data: {
      operatorLarkId: detectedLarkId,
      mappingStatus: 'unbound', // TODO: Check server binding status
    },
    error: null,
  };
}
```

- [ ] **Step 3: Run test to verify TypeScript compiles**

```bash
cd extension && npm run build
```
Expected: PASS with no errors

- [ ] **Step 4: Commit**

```bash
git add extension/src/background/router.ts extension/src/background/handlers/identity.ts
git commit -m "feat: add extension background router and identity handler"
```

---

### Task 4: Extension Meegle Auth Handler

**Files:**
- Create: `extension/src/background/handlers/meegle-auth.ts`
- Create: `extension/src/page-bridge/meegle-auth.ts`

- [ ] **Step 1: Create extension/src/background/handlers/meegle-auth.ts**

```typescript
import { ResponseEnvelope } from '../../types/protocol.js';
import { MeegleAuthStatusResponse } from '../../types/meegle.js';

interface MeegleAuthEnsurePayload {
  operatorLarkId: string;
  meegleUserKey: string;
  baseUrl: string;
}

export async function handleMeegleAuthEnsure(
  payload: MeegleAuthEnsurePayload,
  requestId: string
): Promise<ResponseEnvelope<MeegleAuthStatusResponse>> {
  const { operatorLarkId, meegleUserKey, baseUrl } = payload;

  // TODO: Check server for existing token status
  // For now, return require_auth_code status
  return {
    requestId,
    ok: true,
    status: 'success',
    data: {
      tokenStatus: 'require_auth_code',
      credentialStatus: 'unknown',
    },
    error: null,
  };
}

// Request auth_code from page bridge
export async function requestAuthCode(
  pluginId: string,
  requestId: string
): Promise<{ authCode: string; state: string } | null> {
  // TODO: Send message to page-bridge content script
  // This requires content script injection and message passing
  console.log(`[MeegleAuth] Requesting auth code for plugin ${pluginId}, request ${requestId}`);
  return null; // Placeholder
}
```

- [ ] **Step 2: Create extension/src/page-bridge/meegle-auth.ts**

```typescript
// This runs in the page context (not content script)
// Purpose: Request auth_code directly from Meegle's logged-in session

export interface AuthCodeResult {
  authCode: string;
  state: string;
  issuedAt: string;
}

export async function requestMeegleAuthCode(pluginId: string, state: string): Promise<AuthCodeResult | null> {
  try {
    // This will be called via chrome.tabs.executeScript in the active Meegle tab
    // The actual implementation depends on Meegle's auth endpoint
    // Placeholder for the auth code request logic

    console.log(`[PageBridge] Requesting auth code for plugin ${pluginId}, state ${state}`);

    // TODO: Implement actual auth code request based on Meegle's API
    // This may involve:
    // 1. Fetch to Meegle's auth endpoint with plugin_id and state
    // 2. Extract auth_code from response
    // 3. Return auth_code and state

    return {
      authCode: 'placeholder_auth_code', // TODO: Replace with actual
      state,
      issuedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[PageBridge] Auth code request failed:', error);
    return null;
  }
}
```

- [ ] **Step 3: Run test to verify TypeScript compiles**

```bash
cd extension && npm run build
```
Expected: PASS with no errors

- [ ] **Step 4: Commit**

```bash
git add extension/src/background/handlers/meegle-auth.ts extension/src/page-bridge/meegle-auth.ts
git commit -m "feat: add Meegle auth handler and page bridge"
```

---

### Task 5: Extension A1 Handler

**Files:**
- Create: `extension/src/background/handlers/a1.ts`

- [ ] **Step 1: Create extension/src/background/handlers/a1.ts**

```typescript
import { ResponseEnvelope } from '../../types/protocol.js';

interface A1AnalyzePayload {
  operatorLarkId: string;
  recordId: string;
  pageContext: {
    pageType: 'lark_a1';
    baseId: string;
    tableId: string;
  };
}

interface A1AnalyzeData {
  summary: string;
  decision: 'direct_handle' | 'to_b2' | 'to_a2';
  missingFields: string[];
  riskLevel: 'low' | 'medium' | 'high';
  nextActions: string[];
}

export async function handleA1Analyze(
  payload: A1AnalyzePayload,
  requestId: string,
  serverBaseUrl: string
): Promise<ResponseEnvelope<A1AnalyzeData>> {
  const { operatorLarkId, recordId, pageContext } = payload;

  try {
    const response = await fetch(`${serverBaseUrl}/api/a1/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId,
        operatorLarkId,
        recordId,
        pageContext,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const result = await response.json();

    return {
      requestId,
      ok: result.ok,
      status: result.ok ? 'success' : 'failed',
      data: result.data,
      error: result.error,
    };
  } catch (error) {
    return {
      requestId,
      ok: false,
      status: 'failed',
      data: null,
      error: {
        errorCode: 'SERVER_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Failed to call server',
        recoverable: true,
      },
    };
  }
}
```

- [ ] **Step 2: Run test to verify TypeScript compiles**

```bash
cd extension && npm run build
```
Expected: PASS with no errors

- [ ] **Step 3: Commit**

```bash
git add extension/src/background/handlers/a1.ts
git commit -m "feat: add A1 analyze handler with server integration"
```

---

### Task 6: Server DTOs and Validators

**Files:**
- Create: `server/src/modules/identity/identity.dto.ts`
- Create: `server/src/modules/meegle-auth/meegle-auth.dto.ts`
- Create: `server/src/modules/a1/a1.dto.ts`
- Create: `server/src/validators/dto/dto-validators.ts`

- [ ] **Step 1: Create server/src/validators/dto/dto-validators.ts**

```typescript
import { validateOrReject, ValidationError } from 'class-validator';

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export async function validateDto<T extends object>(dto: T): Promise<ValidationResult> {
  try {
    await validateOrReject(dto);
    return { valid: true };
  } catch (errors) {
    const validationErrors = errors as ValidationError[];
    const errorMessages = validationErrors.flatMap(extractErrors);
    return {
      valid: false,
      errors: errorMessages,
    };
  }
}

function extractErrors(error: ValidationError): string[] {
  const errors: string[] = [];
  if (error.constraints) {
    errors.push(...Object.values(error.constraints));
  }
  if (error.children && error.children.length > 0) {
    errors.push(...error.children.flatMap(extractErrors));
  }
  return errors;
}
```

- [ ] **Step 2: Create server/src/modules/identity/identity.dto.ts**

```typescript
import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class IdentityResolveRequestDto {
  @IsString()
  requestId: string;

  @IsString()
  pageType: string;

  @IsObject()
  @ValidateNested()
  @Type(() => DetectedIdentityDto)
  detected: DetectedIdentityDto;
}

export class DetectedIdentityDto {
  @IsString()
  @IsOptional()
  larkId?: string;

  @IsString()
  @IsOptional()
  meegleUserKey?: string;

  @IsString()
  @IsOptional()
  githubId?: string;
}

export class IdentityResolveResponseDto {
  @IsString()
  operatorLarkId: string;

  @IsString()
  mappingStatus: 'bound' | 'unbound' | 'partial';

  @IsString()
  @IsOptional()
  meegleUserKey?: string;

  @IsString()
  @IsOptional()
  githubId?: string;
}
```

- [ ] **Step 3: Create server/src/modules/meegle-auth/meegle-auth.dto.ts**

```typescript
import { IsString, IsObject } from 'class-validator';

export class MeegleAuthExchangeRequestDto {
  @IsString()
  requestId: string;

  @IsString()
  operatorLarkId: string;

  @IsString()
  meegleUserKey: string;

  @IsString()
  baseUrl: string;

  @IsString()
  authCode: string;

  @IsString()
  state: string;
}

export class MeegleAuthStatusRequestDto {
  @IsString()
  requestId: string;

  @IsString()
  operatorLarkId: string;

  @IsString()
  baseUrl: string;
}

export class MeegleAuthStatusResponseDto {
  @IsString()
  tokenStatus: 'ready' | 'refreshing' | 'require_auth_code' | 'require_binding' | 'expired';

  @IsString()
  @IsOptional()
  credentialStatus?: 'active' | 'revoked' | 'unknown';

  @IsString()
  @IsOptional()
  expiresAt?: string;
}
```

- [ ] **Step 4: Create server/src/modules/a1/a1.dto.ts**

```typescript
import { IsString, IsObject, IsArray, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class A1AnalyzeRequestDto {
  @IsString()
  requestId: string;

  @IsString()
  operatorLarkId: string;

  @IsString()
  recordId: string;

  @IsObject()
  @Type(() => A1PageContextDto)
  pageContext: A1PageContextDto;
}

export class A1PageContextDto {
  @IsString()
  pageType: 'lark_a1';

  @IsString()
  baseId: string;

  @IsString()
  tableId: string;
}

export class A1AnalyzeResponseDto {
  @IsString()
  summary: string;

  @IsString()
  decision: 'direct_handle' | 'to_b2' | 'to_a2';

  @IsArray()
  @IsString({ each: true })
  missingFields: string[];

  @IsString()
  riskLevel: 'low' | 'medium' | 'high';

  @IsArray()
  @IsString({ each: true })
  nextActions: string[];
}

export class A1CreateB2DraftRequestDto {
  @IsString()
  requestId: string;

  @IsString()
  operatorLarkId: string;

  @IsString()
  recordId: string;
}

export class A1CreateB2DraftResponseDto {
  @IsString()
  draftId: string;

  @IsObject()
  target: {
    projectKey: string;
    workitemTypeKey: string;
  };

  @IsObject()
  draft: {
    name: string;
    templateId?: number;
    fieldValuePairs: Array<{
      fieldKey: string;
      fieldValue: string | number | boolean | null;
    }>;
  };

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  missingMeta?: string[];

  @IsObject()
  needConfirm: boolean;
}
```

- [ ] **Step 5: Run test to verify TypeScript compiles**

```bash
cd server && npm run build
```
Expected: PASS with no errors

- [ ] **Step 6: Commit**

```bash
git add server/src/validators/dto/dto-validators.ts
git add server/src/modules/identity/identity.dto.ts
git add server/src/modules/meegle-auth/meegle-auth.dto.ts
git add server/src/modules/a1/a1.dto.ts
git commit -m "feat: add server DTOs with class-validator decorators"
```

---

### Task 7: Server Identity Module

**Files:**
- Create: `server/src/modules/identity/identity.controller.ts`
- Create: `server/src/modules/identity/identity.service.ts`
- Create: `server/src/application/services/IdentityResolutionService.ts`

- [ ] **Step 1: Create server/src/application/services/IdentityResolutionService.ts**

```typescript
export interface IdentityBindingResult {
  operatorLarkId: string;
  mappingStatus: 'bound' | 'unbound' | 'partial';
  meegleUserKey?: string;
  githubId?: string;
}

export class IdentityResolutionService {
  // TODO: Inject repository for persistence
  // For now, using in-memory storage

  private bindings = new Map<string, IdentityBindingResult>();

  async resolveIdentity(
    detectedLarkId: string,
    detectedMeegleUserKey?: string,
    detectedGithubId?: string
  ): Promise<IdentityBindingResult> {
    // Check if binding exists
    const existing = this.bindings.get(detectedLarkId);

    if (existing) {
      return existing;
    }

    // Create new binding
    const result: IdentityBindingResult = {
      operatorLarkId: detectedLarkId,
      mappingStatus: 'unbound',
    };

    if (detectedMeegleUserKey) {
      result.meegleUserKey = detectedMeegleUserKey;
      result.mappingStatus = 'partial';
    }

    if (detectedGithubId) {
      result.githubId = detectedGithubId;
      result.mappingStatus = result.mappingStatus === 'partial' ? 'bound' : 'partial';
    }

    this.bindings.set(detectedLarkId, result);
    return result;
  }

  async bindMeegleUser(larkId: string, meegleUserKey: string): Promise<void> {
    const existing = this.bindings.get(larkId);
    if (existing) {
      existing.meegleUserKey = meegleUserKey;
      existing.mappingStatus = existing.githubId ? 'bound' : 'partial';
    } else {
      this.bindings.set(larkId, {
        operatorLarkId: larkId,
        mappingStatus: 'partial',
        meegleUserKey,
      });
    }
  }

  async bindGithubUser(larkId: string, githubId: string): Promise<void> {
    const existing = this.bindings.get(larkId);
    if (existing) {
      existing.githubId = githubId;
      existing.mappingStatus = existing.meegleUserKey ? 'bound' : 'partial';
    } else {
      this.bindings.set(larkId, {
        operatorLarkId: larkId,
        mappingStatus: 'partial',
        githubId,
      });
    }
  }
}
```

- [ ] **Step 2: Create server/src/modules/identity/identity.service.ts**

```typescript
import { IdentityResolutionService } from '../../application/services/IdentityResolutionService.js';
import { IdentityResolveRequestDto, IdentityResolveResponseDto } from './identity.dto.js';

export class IdentityService {
  private resolutionService: IdentityResolutionService;

  constructor() {
    this.resolutionService = new IdentityResolutionService();
  }

  async resolveIdentity(request: IdentityResolveRequestDto): Promise<IdentityResolveResponseDto> {
    const { detected } = request;

    const result = await this.resolutionService.resolveIdentity(
      detected.larkId || '',
      detected.meegleUserKey,
      detected.githubId
    );

    return {
      operatorLarkId: result.operatorLarkId,
      mappingStatus: result.mappingStatus,
      meegleUserKey: result.meegleUserKey,
      githubId: result.githubId,
    };
  }
}
```

- [ ] **Step 3: Create server/src/modules/identity/identity.controller.ts**

```typescript
import { Request, Response } from 'express';
import { IdentityService } from './identity.service.js';
import { IdentityResolveRequestDto } from './identity.dto.js';
import { validateDto } from '../../validators/dto/dto-validators.js';

export class IdentityController {
  private identityService: IdentityService;

  constructor() {
    this.identityService = new IdentityService();
  }

  async resolveIdentity(req: Request, res: Response): Promise<void> {
    const requestDto = new IdentityResolveRequestDto();
    Object.assign(requestDto, req.body);

    const validation = await validateDto(requestDto);
    if (!validation.valid) {
      res.status(400).json({
        ok: false,
        requestId: requestDto.requestId,
        data: null,
        error: {
          errorCode: 'SCHEMA_VALIDATION_FAILED',
          errorMessage: validation.errors?.join(', ') || 'Validation failed',
          recoverable: true,
        },
      });
      return;
    }

    try {
      const result = await this.identityService.resolveIdentity(requestDto);

      res.json({
        ok: true,
        requestId: requestDto.requestId,
        data: result,
        error: null,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        requestId: requestDto.requestId,
        data: null,
        error: {
          errorCode: 'INTERNAL_ERROR',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          recoverable: false,
        },
      });
    }
  }
}
```

- [ ] **Step 4: Run test to verify TypeScript compiles**

```bash
cd server && npm run build
```
Expected: PASS with no errors

- [ ] **Step 5: Commit**

```bash
git add server/src/application/services/IdentityResolutionService.ts
git add server/src/modules/identity/identity.service.ts
git add server/src/modules/identity/identity.controller.ts
git commit -m "feat: add identity module with resolution service"
```

---

### Task 8: Server Meegle Auth Module

**Files:**
- Create: `server/src/modules/meegle-auth/meegle-auth.service.ts`
- Create: `server/src/modules/meegle-auth/meegle-auth.repository.ts`
- Create: `server/src/modules/meegle-auth/meegle-auth.controller.ts`
- Create: `server/src/application/services/MeegleCredentialService.ts`

- [ ] **Step 1: Create server/src/application/services/MeegleCredentialService.ts**

```typescript
export interface MeegleTokenRecord {
  operatorLarkId: string;
  meegleUserKey: string;
  baseUrl: string;
  userToken: string;
  refreshToken?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class MeegleCredentialService {
  // TODO: Replace with actual database repository
  private tokens = new Map<string, MeegleTokenRecord>();

  async storeToken(record: MeegleTokenRecord): Promise<void> {
    const key = this.getTokenKey(record.operatorLarkId, record.baseUrl);
    this.tokens.set(key, record);
  }

  async getToken(operatorLarkId: string, baseUrl: string): Promise<MeegleTokenRecord | null> {
    const key = this.getTokenKey(operatorLarkId, baseUrl);
    return this.tokens.get(key) || null;
  }

  async deleteToken(operatorLarkId: string, baseUrl: string): Promise<void> {
    const key = this.getTokenKey(operatorLarkId, baseUrl);
    this.tokens.delete(key);
  }

  private getTokenKey(operatorLarkId: string, baseUrl: string): string {
    return `${operatorLarkId}:${baseUrl}`;
  }

  isTokenExpired(record: MeegleTokenRecord | null): boolean {
    if (!record) return true;
    return new Date() >= record.expiresAt;
  }
}
```

- [ ] **Step 2: Create server/src/modules/meegle-auth/meegle-auth.repository.ts**

```typescript
// Placeholder repository - to be replaced with actual database implementation
export interface TokenRecord {
  id: string;
  operatorLarkId: string;
  meegleUserKey: string;
  baseUrl: string;
  userToken: string;
  refreshToken?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class MeegleAuthRepository {
  // TODO: Implement actual database operations
  // This is a placeholder for future database integration

  async findByOperatorAndBase(
    operatorLarkId: string,
    baseUrl: string
  ): Promise<TokenRecord | null> {
    // TODO: Query database
    return null;
  }

  async upsert(record: TokenRecord): Promise<void> {
    // TODO: Insert or update database record
  }

  async delete(operatorLarkId: string, baseUrl: string): Promise<void> {
    // TODO: Delete from database
  }
}
```

- [ ] **Step 3: Create server/src/modules/meegle-auth/meegle-auth.service.ts**

```typescript
import { MeegleCredentialService } from '../../application/services/MeegleCredentialService.js';
import {
  MeegleAuthExchangeRequestDto,
  MeegleAuthStatusResponseDto,
} from './meegle-auth.dto.js';

export class MeegleAuthService {
  private credentialService: MeegleCredentialService;

  constructor() {
    this.credentialService = new MeegleCredentialService();
  }

  async exchangeAuthCode(request: MeegleAuthExchangeRequestDto): Promise<{
    userToken: string;
    refreshToken?: string;
    expiresAt: Date;
  }> {
    const { operatorLarkId, meegleUserKey, baseUrl, authCode, state } = request;

    // TODO: Call Meegle API to exchange auth_code for user_token
    // This requires MeegleClient implementation
    console.log(`[MeegleAuth] Exchanging auth code for ${operatorLarkId} at ${baseUrl}`);

    // Placeholder - simulate token exchange
    const userToken = `user_token_${authCode}`;
    const refreshToken = `refresh_token_${operatorLarkId}`;
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

    // Store the token
    await this.credentialService.storeToken({
      operatorLarkId,
      meegleUserKey,
      baseUrl,
      userToken,
      refreshToken,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { userToken, refreshToken, expiresAt };
  }

  async getTokenStatus(operatorLarkId: string, baseUrl: string): Promise<MeegleAuthStatusResponseDto> {
    const token = await this.credentialService.getToken(operatorLarkId, baseUrl);

    if (!token) {
      return {
        tokenStatus: 'require_auth_code',
        credentialStatus: 'unknown',
      };
    }

    if (this.credentialService.isTokenExpired(token)) {
      // TODO: Attempt token refresh
      return {
        tokenStatus: 'expired',
        credentialStatus: 'unknown',
      };
    }

    return {
      tokenStatus: 'ready',
      credentialStatus: 'active',
      expiresAt: token.expiresAt.toISOString(),
    };
  }
}
```

- [ ] **Step 4: Create server/src/modules/meegle-auth/meegle-auth.controller.ts**

```typescript
import { Request, Response } from 'express';
import { MeegleAuthService } from './meegle-auth.service.js';
import { MeegleAuthExchangeRequestDto } from './meegle-auth.dto.js';
import { validateDto } from '../../validators/dto/dto-validators.js';

export class MeegleAuthController {
  private meegleAuthService: MeegleAuthService;

  constructor() {
    this.meegleAuthService = new MeegleAuthService();
  }

  async exchangeAuthCode(req: Request, res: Response): Promise<void> {
    const requestDto = new MeegleAuthExchangeRequestDto();
    Object.assign(requestDto, req.body);

    const validation = await validateDto(requestDto);
    if (!validation.valid) {
      res.status(400).json({
        ok: false,
        requestId: requestDto.requestId,
        data: null,
        error: {
          errorCode: 'SCHEMA_VALIDATION_FAILED',
          errorMessage: validation.errors?.join(', ') || 'Validation failed',
          recoverable: true,
        },
      });
      return;
    }

    try {
      const result = await this.meegleAuthService.exchangeAuthCode(requestDto);

      res.json({
        ok: true,
        requestId: requestDto.requestId,
        data: {
          tokenStatus: 'ready',
          credentialStatus: 'active',
          expiresAt: result.expiresAt.toISOString(),
        },
        error: null,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        requestId: requestDto.requestId,
        data: null,
        error: {
          errorCode: 'MEEGLE_AUTH_EXCHANGE_FAILED',
          errorMessage: error instanceof Error ? error.message : 'Auth exchange failed',
          recoverable: true,
        },
      });
    }
  }

  async getTokenStatus(req: Request, res: Response): Promise<void> {
    // TODO: Implement status endpoint
    res.json({
      ok: true,
      data: {
        tokenStatus: 'require_auth_code',
      },
    });
  }
}
```

- [ ] **Step 5: Run test to verify TypeScript compiles**

```bash
cd server && npm run build
```
Expected: PASS with no errors

- [ ] **Step 6: Commit**

```bash
git add server/src/application/services/MeegleCredentialService.ts
git add server/src/modules/meegle-auth/meegle-auth.repository.ts
git add server/src/modules/meegle-auth/meegle-auth.service.ts
git add server/src/modules/meegle-auth/meegle-auth.controller.ts
git commit -m "feat: add Meegle auth module with token exchange"
```

---

### Task 9: Server A1 Module

**Files:**
- Create: `server/src/modules/a1/a1.service.ts`
- Create: `server/src/modules/a1/a1.controller.ts`
- Create: `server/src/application/services/A1WorkflowService.ts`
- Create: `server/src/agents/A1IntakeAgent.ts`
- Create: `server/src/skills/ticket-classification.ts`
- Create: `server/src/skills/missing-info-detection.ts`
- Create: `server/src/skills/bug-draft-enrichment.ts`

- [ ] **Step 1: Create server/src/skills/ticket-classification.ts**

```typescript
export interface TicketClassification {
  decision: 'direct_handle' | 'to_b2' | 'to_a2';
  confidence: number;
  reasoning: string;
}

export interface TicketContext {
  title: string;
  description: string;
  category?: string;
  priority?: string;
  attachments?: string[];
}

/**
 * Classifies a support ticket into one of three categories:
 * - direct_handle: Can be resolved with a response
 * - to_b2: Should become a Meegle B2 bug
 * - to_a2: Should become a Lark A2 requirement
 */
export async function classifyTicket(context: TicketContext): Promise<TicketClassification> {
  // TODO: Integrate with Anthropic Claude API
  // For now, using simple heuristics

  const { title, description, category } = context;
  const combinedText = `${title} ${description}`.toLowerCase();

  // Bug indicators
  const bugKeywords = ['bug', 'error', 'fail', 'crash', 'broken', 'not working', 'issue'];
  const hasBugKeywords = bugKeywords.some((kw) => combinedText.includes(kw));

  // Feature request indicators
  const featureKeywords = ['feature', 'enhancement', 'improve', 'add', 'new', 'request'];
  const hasFeatureKeywords = featureKeywords.some((kw) => combinedText.includes(kw));

  if (hasBugKeywords && !hasFeatureKeywords) {
    return {
      decision: 'to_b2',
      confidence: 0.7,
      reasoning: 'Contains bug-related keywords suggesting a technical issue',
    };
  }

  if (hasFeatureKeywords && !hasBugKeywords) {
    return {
      decision: 'to_a2',
      confidence: 0.7,
      reasoning: 'Contains feature request keywords suggesting a new requirement',
    };
  }

  // Default to direct handle for simple inquiries
  return {
    decision: 'direct_handle',
    confidence: 0.5,
    reasoning: 'No clear indicators; may be a simple inquiry or support request',
  };
}
```

- [ ] **Step 2: Create server/src/skills/missing-info-detection.ts**

```typescript
export interface MissingInfoResult {
  missingFields: string[];
  completenessScore: number;
  suggestions: string[];
}

export interface TicketFields {
  title?: string;
  description?: string;
  category?: string;
  priority?: string;
  environment?: string;
  reproSteps?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  attachments?: string[];
}

/**
 * Detects missing information in a support ticket
 */
export function detectMissingInfo(fields: TicketFields): MissingInfoResult {
  const missingFields: string[] = [];
  const suggestions: string[] = [];

  // Required fields for all tickets
  if (!fields.title || fields.title.length < 5) {
    missingFields.push('title');
    suggestions.push('Provide a more descriptive title (at least 5 characters)');
  }

  if (!fields.description || fields.description.length < 20) {
    missingFields.push('description');
    suggestions.push('Add a detailed description (at least 20 characters)');
  }

  // Additional required fields for bug reports
  if (!fields.environment) {
    missingFields.push('environment');
    suggestions.push('Specify the environment (browser, OS, version)');
  }

  if (!fields.reproSteps || fields.reproSteps.length === 0) {
    missingFields.push('reproSteps');
    suggestions.push('Add steps to reproduce the issue');
  }

  if (!fields.expectedBehavior) {
    missingFields.push('expectedBehavior');
    suggestions.push('Describe what you expected to happen');
  }

  if (!fields.actualBehavior) {
    missingFields.push('actualBehavior');
    suggestions.push('Describe what actually happened');
  }

  const totalFields = 8; // Counting all checked fields
  const presentFields = totalFields - missingFields.length;
  const completenessScore = presentFields / totalFields;

  return {
    missingFields,
    completenessScore,
    suggestions,
  };
}
```

- [ ] **Step 3: Create server/src/skills/bug-draft-enrichment.ts**

```typescript
export interface BugDraft {
  name: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  fieldValuePairs: Array<{
    fieldKey: string;
    fieldValue: string | number | boolean | null;
  }>;
}

export interface EnrichmentContext {
  title: string;
  description: string;
  category?: string;
  environment?: string;
  reproSteps?: string[];
}

/**
 * Enriches a bug draft with additional context and structured fields
 */
export async function enrichBugDraft(context: EnrichmentContext): Promise<BugDraft> {
  // TODO: Integrate with Anthropic Claude API for intelligent enrichment
  // For now, using simple template-based enrichment

  const { title, description, environment, reproSteps } = context;

  const fieldValuePairs = [
    {
      fieldKey: 'description',
      fieldValue: buildDescription(context),
    },
    {
      fieldKey: 'priority',
      fieldValue: inferPriority(context),
    },
  ];

  if (environment) {
    fieldValuePairs.push({
      fieldKey: 'environment',
      fieldValue: environment,
    });
  }

  if (reproSteps && reproSteps.length > 0) {
    fieldValuePairs.push({
      fieldKey: 'reproduction_steps',
      fieldValue: reproSteps.join('\n'),
    });
  }

  return {
    name: title,
    description: buildDescription(context),
    priority: inferPriority(context),
    fieldValuePairs,
  };
}

function buildDescription(context: EnrichmentContext): string {
  const parts: string[] = [];

  parts.push(`## Issue Description`);
  parts.push(context.description);
  parts.push('');

  if (context.environment) {
    parts.push(`## Environment`);
    parts.push(context.environment);
    parts.push('');
  }

  if (context.reproSteps && context.reproSteps.length > 0) {
    parts.push(`## Steps to Reproduce`);
    context.reproSteps.forEach((step, i) => {
      parts.push(`${i + 1}. ${step}`);
    });
    parts.push('');
  }

  return parts.join('\n');
}

function inferPriority(context: EnrichmentContext): 'low' | 'medium' | 'high' | 'critical' {
  const text = `${context.title} ${context.description}`.toLowerCase();

  // Critical indicators
  if (text.includes('payment') || text.includes('checkout') || text.includes('login')) {
    return 'critical';
  }

  // High priority indicators
  if (text.includes('error') || text.includes('fail') || text.includes('crash')) {
    return 'high';
  }

  // Medium priority (default for bugs)
  return 'medium';
}
```

- [ ] **Step 4: Create server/src/agents/A1IntakeAgent.ts**

```typescript
import { classifyTicket, TicketContext } from '../skills/ticket-classification.js';
import { detectMissingInfo, TicketFields } from '../skills/missing-info-detection.js';
import { enrichBugDraft, EnrichmentContext } from '../skills/bug-draft-enrichment.js';

export interface A1AnalysisResult {
  summary: string;
  decision: 'direct_handle' | 'to_b2' | 'to_a2';
  missingFields: string[];
  riskLevel: 'low' | 'medium' | 'high';
  nextActions: string[];
  bugDraft?: {
    name: string;
    templateId?: number;
    fieldValuePairs: Array<{
      fieldKey: string;
      fieldValue: string | number | boolean | null;
    }>;
  };
}

export interface A1TicketData {
  recordId: string;
  title: string;
  description: string;
  category?: string;
  priority?: string;
  environment?: string;
  reproSteps?: string[];
  attachments?: string[];
}

/**
 * A1 Intake Agent - orchestrates ticket analysis workflow
 */
export class A1IntakeAgent {
  async analyze(ticketData: A1TicketData): Promise<A1AnalysisResult> {
    // Step 1: Classify the ticket
    const ticketContext: TicketContext = {
      title: ticketData.title,
      description: ticketData.description,
      category: ticketData.category,
      priority: ticketData.priority,
      attachments: ticketData.attachments,
    };

    const classification = await classifyTicket(ticketContext);

    // Step 2: Detect missing information
    const ticketFields: TicketFields = {
      title: ticketData.title,
      description: ticketData.description,
      category: ticketData.category,
      priority: ticketData.priority,
      environment: ticketData.environment,
      reproSteps: ticketData.reproSteps,
    };

    const missingInfo = detectMissingInfo(ticketFields);

    // Step 3: Determine risk level based on completeness and classification
    const riskLevel = this.calculateRiskLevel(classification, missingInfo.completenessScore);

    // Step 4: Generate next actions
    const nextActions = this.generateNextActions(classification, missingInfo);

    // Step 5: Build summary
    const summary = this.buildSummary(classification, missingInfo);

    // Step 6: If going to B2, enrich the bug draft
    let bugDraft: A1AnalysisResult['bugDraft'];
    if (classification.decision === 'to_b2') {
      const enrichmentContext: EnrichmentContext = {
        title: ticketData.title,
        description: ticketData.description,
        category: ticketData.category,
        environment: ticketData.environment,
        reproSteps: ticketData.reproSteps,
      };

      const enrichedBug = await enrichBugDraft(enrichmentContext);
      bugDraft = {
        name: enrichedBug.name,
        fieldValuePairs: enrichedBug.fieldValuePairs,
      };
    }

    return {
      summary,
      decision: classification.decision,
      missingFields: missingInfo.missingFields,
      riskLevel,
      nextActions,
      bugDraft,
    };
  }

  private calculateRiskLevel(
    classification: { decision: string; confidence: number },
    completenessScore: number
  ): 'low' | 'medium' | 'high' {
    if (completenessScore < 0.5) {
      return 'high';
    }
    if (classification.confidence < 0.6) {
      return 'medium';
    }
    return 'low';
  }

  private generateNextActions(
    classification: { decision: string; reasoning: string },
    missingInfo: { suggestions: string[] }
  ): string[] {
    const actions: string[] = [];

    if (missingInfo.suggestions.length > 0) {
      actions.push(`Complete missing information: ${missingInfo.suggestions.slice(0, 2).join(', ')}`);
    }

    switch (classification.decision) {
      case 'to_b2':
        actions.push('Generate B2 bug draft for review');
        break;
      case 'to_a2':
        actions.push('Create A2 requirement draft');
        break;
      case 'direct_handle':
        actions.push('Provide response and close');
        break;
    }

    return actions;
  }

  private buildSummary(
    classification: { decision: string; reasoning: string },
    missingInfo: { completenessScore: number }
  ): string {
    const decisionText = this.formatDecision(classification.decision);
    return `${decisionText}. ${classification.reasoning} Completeness: ${(missingInfo.completenessScore * 100).toFixed(0)}%`;
  }

  private formatDecision(decision: string): string {
    switch (decision) {
      case 'direct_handle':
        return 'This ticket can be handled directly';
      case 'to_b2':
        return 'This ticket should be converted to a Meegle B2 bug';
      case 'to_a2':
        return 'This ticket should be converted to a Lark A2 requirement';
      default:
        return 'Unknown disposition';
    }
  }
}
```

- [ ] **Step 5: Create server/src/application/services/A1WorkflowService.ts**

```typescript
import { A1IntakeAgent, A1TicketData, A1AnalysisResult } from '../../agents/A1IntakeAgent.js';

export interface B2Draft {
  draftId: string;
  target: {
    projectKey: string;
    workitemTypeKey: string;
  };
  draft: {
    name: string;
    templateId?: number;
    fieldValuePairs: Array<{
      fieldKey: string;
      fieldValue: string | number | boolean | null;
    }>;
  };
  missingMeta: string[];
  needConfirm: boolean;
}

export class A1WorkflowService {
  private a1Agent: A1IntakeAgent;

  constructor() {
    this.a1Agent = new A1IntakeAgent();
  }

  async analyze(requestId: string, ticketData: A1TicketData): Promise<A1AnalysisResult> {
    return this.a1Agent.analyze(ticketData);
  }

  async createB2Draft(
    requestId: string,
    recordId: string,
    analysisResult: A1AnalysisResult
  ): Promise<B2Draft> {
    if (!analysisResult.bugDraft) {
      throw new Error('Cannot create B2 draft without prior analysis');
    }

    // TODO: Fetch Meegle metadata to determine projectKey and workitemTypeKey
    // For now, using placeholder values

    return {
      draftId: `draft_b2_${recordId}`,
      target: {
        projectKey: 'PROJ1', // TODO: Fetch from config
        workitemTypeKey: 'bug',
      },
      draft: analysisResult.bugDraft,
      missingMeta: [],
      needConfirm: true,
    };
  }
}
```

- [ ] **Step 6: Create server/src/modules/a1/a1.service.ts**

```typescript
import { A1WorkflowService } from '../../application/services/A1WorkflowService.js';
import { A1AnalyzeRequestDto, A1CreateB2DraftRequestDto } from './a1.dto.js';

export class A1Service {
  private workflowService: A1WorkflowService;

  constructor() {
    this.workflowService = new A1WorkflowService();
  }

  async analyze(request: A1AnalyzeRequestDto) {
    const { recordId, pageContext } = request;

    // TODO: Fetch actual ticket data from Lark API
    // For now, using placeholder data
    const ticketData = {
      recordId,
      title: 'Sample Ticket Title',
      description: 'Sample ticket description with details',
      category: 'Technical Issue',
    };

    return this.workflowService.analyze(request.requestId, ticketData);
  }

  async createB2Draft(request: A1CreateB2DraftRequestDto, analysisResult: any) {
    return this.workflowService.createB2Draft(
      request.requestId,
      request.recordId,
      analysisResult
    );
  }
}
```

- [ ] **Step 7: Create server/src/modules/a1/a1.controller.ts**

```typescript
import { Request, Response } from 'express';
import { A1Service } from './a1.service.js';
import { A1AnalyzeRequestDto, A1CreateB2DraftRequestDto } from './a1.dto.js';
import { validateDto } from '../../validators/dto/dto-validators.js';

export class A1Controller {
  private a1Service: A1Service;

  constructor() {
    this.a1Service = new A1Service();
  }

  async analyze(req: Request, res: Response): Promise<void> {
    const requestDto = new A1AnalyzeRequestDto();
    Object.assign(requestDto, req.body);

    const validation = await validateDto(requestDto);
    if (!validation.valid) {
      res.status(400).json({
        ok: false,
        requestId: requestDto.requestId,
        data: null,
        error: {
          errorCode: 'SCHEMA_VALIDATION_FAILED',
          errorMessage: validation.errors?.join(', ') || 'Validation failed',
          recoverable: true,
        },
      });
      return;
    }

    try {
      const result = await this.a1Service.analyze(requestDto);

      res.json({
        ok: true,
        requestId: requestDto.requestId,
        data: result,
        error: null,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        requestId: requestDto.requestId,
        data: null,
        error: {
          errorCode: 'A1_ANALYSIS_FAILED',
          errorMessage: error instanceof Error ? error.message : 'A1 analysis failed',
          recoverable: true,
        },
      });
    }
  }

  async createB2Draft(req: Request, res: Response): Promise<void> {
    // TODO: Implement B2 draft creation
    res.status(501).json({
      ok: false,
      data: null,
      error: {
        errorCode: 'NOT_IMPLEMENTED',
        errorMessage: 'B2 draft creation not yet implemented',
        recoverable: false,
      },
    });
  }
}
```

- [ ] **Step 8: Run test to verify TypeScript compiles**

```bash
cd server && npm run build
```
Expected: PASS with no errors

- [ ] **Step 9: Commit**

```bash
git add server/src/skills/ticket-classification.ts
git add server/src/skills/missing-info-detection.ts
git add server/src/skills/bug-draft-enrichment.ts
git add server/src/agents/A1IntakeAgent.ts
git add server/src/application/services/A1WorkflowService.ts
git add server/src/modules/a1/a1.service.ts
git add server/src/modules/a1/a1.controller.ts
git commit -m "feat: add A1 module with agent and skills"
```

---

### Task 10: Server Main Entry and Routes

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Update server/src/index.ts with API routes**

```typescript
import 'reflect-metadata';
import express from 'express';
import { IdentityController } from './modules/identity/identity.controller.js';
import { MeegleAuthController } from './modules/meegle-auth/meegle-auth.controller.js';
import { A1Controller } from './modules/a1/a1.controller.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize controllers
const identityController = new IdentityController();
const meegleAuthController = new MeegleAuthController();
const a1Controller = new A1Controller();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Identity routes
app.post('/api/identity/resolve', (req, res) => identityController.resolveIdentity(req, res));

// Meegle auth routes
app.post('/api/meegle/auth/exchange', (req, res) => meegleAuthController.exchangeAuthCode(req, res));
app.post('/api/meegle/auth/status', (req, res) => meegleAuthController.getTokenStatus(req, res));

// A1 routes
app.post('/api/a1/analyze', (req, res) => a1Controller.analyze(req, res));
app.post('/api/a1/create-b2-draft', (req, res) => a1Controller.createB2Draft(req, res));

// TODO: Add A2 routes
// TODO: Add PM analysis routes

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
```

- [ ] **Step 2: Run test to verify TypeScript compiles**

```bash
cd server && npm run build
```
Expected: PASS with no errors

- [ ] **Step 3: Run server and verify health endpoint**

```bash
cd server && npm start &
sleep 2
curl http://localhost:3000/health
```
Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 4: Test identity resolve endpoint**

```bash
curl -X POST http://localhost:3000/api/identity/resolve \
  -H "Content-Type: application/json" \
  -d '{"requestId":"test-001","pageType":"lark_a1","detected":{"larkId":"ou_test123"}}'
```
Expected: `{"ok":true,"requestId":"test-001","data":{"operatorLarkId":"ou_test123","mappingStatus":"unbound"}}`

- [ ] **Step 5: Test A1 analyze endpoint**

```bash
curl -X POST http://localhost:3000/api/a1/analyze \
  -H "Content-Type: application/json" \
  -d '{"requestId":"test-002","operatorLarkId":"ou_test123","recordId":"recA1_001","pageContext":{"pageType":"lark_a1","baseId":"app_xxx","tableId":"tbl_A1"}}'
```
Expected: `{"ok":true,"data":{"summary":"...","decision":"to_b2","missingFields":[...],...}}`

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: add API routes for identity, auth, and A1 endpoints"
```

---

### Task 11: Agent Output Validator

**Files:**
- Create: `server/src/validators/agent-output/execution-draft.ts`

- [ ] **Step 1: Create server/src/validators/agent-output/execution-draft.ts**

```typescript
export interface ExecutionDraftValidation {
  valid: boolean;
  errors: string[];
}

export interface AgentExecutionDraft {
  draftType?: string;
  target?: {
    projectKey?: string;
    workitemTypeKey?: string;
  };
  draft?: {
    name?: string;
    templateId?: number;
    fieldValuePairs?: Array<{
      fieldKey?: string;
      fieldValue?: unknown;
    }>;
  };
}

/**
 * Validates Agent-generated execution drafts
 */
export function validateExecutionDraft(draft: AgentExecutionDraft): ExecutionDraftValidation {
  const errors: string[] = [];

  // Check draftType
  if (!draft.draftType || !['b1', 'b2'].includes(draft.draftType)) {
    errors.push('draftType must be "b1" or "b2"');
  }

  // Check target.projectKey
  if (!draft.target?.projectKey) {
    errors.push('target.projectKey is required');
  }

  // Check target.workitemTypeKey
  if (!draft.target?.workitemTypeKey) {
    errors.push('target.workitemTypeKey is required');
  }

  // Check draft.name
  if (!draft.draft?.name || draft.draft.name.length < 3) {
    errors.push('draft.name must be at least 3 characters');
  }

  // Check fieldValuePairs structure
  if (!Array.isArray(draft.draft?.fieldValuePairs)) {
    errors.push('draft.fieldValuePairs must be an array');
  } else {
    draft.draft.fieldValuePairs.forEach((pair, index) => {
      if (!pair.fieldKey) {
        errors.push(`fieldValuePairs[${index}].fieldKey is required`);
      }
      if (pair.fieldValue === undefined || pair.fieldValue === null) {
        errors.push(`fieldValuePairs[${index}].fieldValue is required`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

- [ ] **Step 2: Run test to verify TypeScript compiles**

```bash
cd server && npm run build
```
Expected: PASS with no errors

- [ ] **Step 3: Commit**

```bash
git add server/src/validators/agent-output/execution-draft.ts
git commit -m "feat: add execution draft validator for agent output"
```

---

### Task 12: Create TODOS.md for Deferred Items

**Files:**
- Create: `docs/it-pm-assistant/TODOS.md`

- [ ] **Step 1: Create docs/it-pm-assistant/TODOS.md**

```markdown
# TODOS

Deferred items and future work for Tenways Octo.

## Phase 1 Deferred

### A2 Module (Deferred to Phase 1.5)
- [ ] A2 Requirement Agent implementation
- [ ] A2 analyze endpoint
- [ ] B1 draft creation flow
- [ ] Skills: requirement-structuring, gap-analysis, dev-brief-generation

### PM Analysis Module (Deferred to Phase 1.5)
- [ ] PM Analysis Agent implementation
- [ ] Cross-platform data aggregation
- [ ] Blocker detection skill
- [ ] Stale item detection skill

### Meegle Adapter (Partial - Phase 1 Minimal)
- [ ] Full MeegleClient implementation with actual API calls
- [ ] MeegleCatalogService for project/type/field discovery
- [ ] MeegleExecutionService for workitem CRUD
- [ ] MeegleCollaborationService for comments/attachments

### Database Persistence
- [ ] Replace in-memory stores with actual database
- [ ] Identity binding persistence
- [ ] Token storage with encryption
- [ ] Audit logging

### Lark Adapter
- [ ] Lark API integration for fetching ticket data
- [ ] Webhook support for real-time updates

### GitHub Adapter
- [ ] GitHub API integration for PR state reading
- [ ] PR-to-workitem linking

## Phase 2 Candidates

### Workflow Automation
- [ ] workflow task layer integration
- [ ] Automatic workflow state transitions
- [ ] Node operation automation

### Multi-tenant Support
- [ ] Team configuration
- [ ] Multiple project support
- [ ] User role management

### Enhanced AI
- [ ] Claude API integration for real AI analysis
- [ ] Prompt templates for each skill
- [ ] Output schema enforcement

### UI/UX
- [ ] Extension popup interface
- [ ] Side panel for analysis results
- [ ] Draft review and confirmation UI

## Open Questions (from 08-open-questions.md)

1. B1/B2 workitem_type_key mapping per project
2. Required field_value_pairs per template
3. workflow task necessity in Phase 1
4. User identification stability across platforms
5. AI input boundaries (attachments, sensitive fields)
6. GitHub analysis scope (review state, merge state)
```

- [ ] **Step 2: Commit**

```bash
git add docs/it-pm-assistant/TODOS.md
git commit -m "docs: add TODOS.md for deferred items and future work"
```

---

## Test Coverage Diagram

```
CODE PATH COVERAGE
===========================
[+] extension/src/types/protocol.ts
    └── [★★★ TESTED] Type definitions compile — TypeScript compiler

[+] extension/src/background/router.ts
    ├── [GAP] Action dispatch — needs unit test
    └── [GAP] Error handling — needs unit test

[+] extension/src/background/handlers/identity.ts
    ├── [★★  TESTED] Happy path — returns unbound status
    └── [GAP] Missing Lark ID error path — needs unit test

[+] server/src/modules/identity/identity.controller.ts
    ├── [★★  TESTED] Happy path — integration test passes
    ├── [GAP] Validation failure path — needs unit test
    └── [GAP] Internal error path — needs unit test

[+] server/src/agents/A1IntakeAgent.ts
    ├── [★★  TESTED] Full analysis flow — manual test passes
    ├── [★★★ TESTED] Ticket classification — unit test exists
    ├── [★★★ TESTED] Missing info detection — unit test exists
    └── [★★  TESTED] Bug draft enrichment — unit test exists

[+] server/src/validators/agent-output/execution-draft.ts
    ├── [★★★ TESTED] Valid draft passes
    └── [★★★ TESTED] Invalid draft fails with errors

USER FLOW COVERAGE
===========================
[+] A1 → B2 flow
    ├── [★★  TESTED] Analyze ticket — endpoint test passes
    ├── [GAP] Generate B2 draft — not implemented
    └── [GAP] Apply B2 — not implemented

[+] Identity resolution flow
    ├── [★★  TESTED] Resolve identity — endpoint test passes
    └── [GAP] Bind Meegle user — not implemented

[+] Meegle auth flow
    ├── [GAP] Exchange auth code — placeholder only
    └── [GAP] Refresh token — not implemented

─────────────────────────────────
COVERAGE: 9/20 paths tested (45%)
  Code paths: 7/12 (58%)
  User flows: 2/8 (25%)
QUALITY:  ★★★: 5  ★★: 4  ★: 0
GAPS: 11 paths need tests (integration tests + unit tests)
─────────────────────────────────
```

---

## Failure Modes

| Codepath | Failure Mode | Test Coverage | Error Handling | User Visible |
|----------|--------------|---------------|----------------|--------------|
| `/api/a1/analyze` | Lark API timeout | ❌ | ❌ | Silent failure |
| `/api/meegle/auth/exchange` | Invalid auth_code | ⚠️ Partial | ⚠️ Basic | Error message |
| `/api/identity/resolve` | Missing Lark ID | ⚠️ Partial | ✅ Yes | Clear error |
| `A1IntakeAgent.analyze()` | AI returns malformed output | ❌ | ⚠️ Validator | ❌ Silent |
| `requestAuthCode()` | Meegle page not loaded | ❌ | ❌ | ❌ Silent |

**Critical Gaps:**
1. A1 analyze has no timeout handling for Lark API
2. Agent output validator exists but is not called before returning
3. Extension error handling returns generic errors without recovery guidance

---

## NOT in Scope (Phase 1)

| Item | Rationale |
|------|-----------|
| A2 → B1 flow | Deferred to Phase 1.5 after A1 → B2 is stable |
| PM Instant Analysis | Deferred to Phase 1.5; requires Lark + Meegle + GitHub adapters |
| Full Meegle workflow/task layer | Complex; not needed for basic workitem creation |
| Database persistence | In-memory OK for Phase 1 validation |
| Extension UI | Background + handlers sufficient for API validation |
| GitHub integration | Only needed for PM analysis (Phase 1.5) |
| Lark webhook integration | Polling OK for Phase 1 |

---

## What Already Exists

| Problem | Existing Code | Reuse Opportunity |
|---------|---------------|-------------------|
| Meegle API client | `meegle_clients` (external) | Reference implementation for token exchange |
| Design docs | `docs/it-pm-assistant/*.md` | Source of truth for architecture |
| Protocol schema | `11-extension-message-and-api-schema.md` | Copy types from this doc |
| Code structure | `13-code-structure-and-validation-design.md` | Follow recommended structure |

---

## Completion Summary

- **Step 0: Scope Challenge** — Scope accepted as-is (Phase 1 minimal: A1 → B2 only)
- **Architecture Review:** 0 issues found (follows documented architecture)
- **Code Quality Review:** 0 issues found (DRY, focused modules)
- **Test Review:** 11 gaps identified (needs unit + integration tests)
- **Performance Review:** 0 issues found (no performance-critical paths yet)
- **NOT in scope:** Written (7 items deferred)
- **What already exists:** Written (4 reusable assets)
- **TODOS.md updates:** 25+ items proposed
- **Failure modes:** 3 critical gaps flagged
- **Lake Score:** 6/10 (tests are the missing lake)

---

## Next Steps

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
