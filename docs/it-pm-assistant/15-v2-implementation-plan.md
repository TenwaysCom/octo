# V2 Agent Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a scalable server-side Agent platform with configurable Think Effort modes, Skills system, Context & Session management, and SSE streaming for thinking process visibility.

**Architecture:** Server-side Agent Orchestrator coordinates multiple agents (A1/A2/PM Analysis), Skill Registry manages URL→Skills mapping, Context Manager handles unified context building, Session Manager provides context isolation and recovery, SSE protocol streams real-time thinking updates to client.

**Tech Stack:** TypeScript, Node.js, Express/Fastify, SSE, PostgreSQL/Redis, path-to-regexp

---

## Phase Overview

Based on the V2 Architecture Design (14-v2-architecture-design.md), implementation is divided into 5 phases:

| Phase | Focus | Priority | Dependencies |
|-------|-------|----------|--------------|
| P0 | Core Types & Protocol | P0 | None |
| P1 | Skill Registry | P0 | P0 |
| P2 | Session & Context Management | P1 | P0 |
| P3 | Think Effort Controller | P1 | P1, P2 |
| P4 | SSE Streaming | P1 | P0, P3 |

---

## File Structure

### New Files to Create

**Types & Protocol:**
- `src/types/v2-protocol.ts` - V2 protocol types (PageType, SkillRef, ThinkEffort, etc.)
- `src/types/v2-context.ts` - Context types (PageContext, UserContext, HistoryContext)
- `src/types/v2-session.ts` - Session types and TTL configuration

**Skill Registry:**
- `src/skill-registry/registry.ts` - Central skill registry
- `src/skill-registry/url-matcher.ts` - URL pattern matching with path-to-regexp
- `src/skill-registry/config-loader.ts` - Load skill configurations
- `src/skills/builtin/index.ts` - Built-in skills entry point
- `src/skills/builtin/ticket-classification.ts` - A1 ticket classification skill
- `src/skills/builtin/missing-info-detection.ts` - A1 missing info detection
- `src/skills/builtin/requirement-structuring.ts` - A2 requirement structuring
- `src/skills/builtin/blocker-detection.ts` - PM blocker detection

**Session Management:**
- `src/session/session-manager.ts` - Session CRUD and lifecycle
- `src/session/session-store.ts` - Session storage (Redis/PostgreSQL)
- `src/session/ttl-cleaner.ts` - TTL-based cleanup cron

**Context Management:**
- `src/context/context-manager.ts` - Context builder and provider
- `src/context/context-collectors.ts` - Built-in context collectors
- `src/context/context-builder.ts` - Build unified context from sources

**Think Effort:**
- `src/think-effort/effort-controller.ts` - Think effort profiles and limits
- `src/think-effort/resource-tracker.ts` - Track LLM calls, tokens, duration

**SSE Streaming:**
- `src/sse/sse-stream.ts` - SSE event streaming
- `src/sse/event-store.ts` - Event buffer for reconnection (5-min retention)
- `src/sse/middleware.ts` - SSE endpoint middleware

**API Routes:**
- `src/routes/skills.ts` - /api/skills/config endpoint
- `src/routes/sessions.ts` - /api/sessions/* endpoints
- `src/routes/analyze.ts` - /api/a1/analyze, /api/a2/analyze, /api/pm/analyze (SSE)

**Tests:**
- `tests/skill-registry/` - Skill registry tests
- `tests/session/` - Session manager tests
- `tests/context/` - Context builder tests
- `tests/think-effort/` - Effort controller tests
- `tests/sse/` - SSE streaming tests

---

## Phase P0: Core Types & Protocol

### Task P0.1: Define V2 Protocol Types

**Files:**
- Create: `src/types/v2-protocol.ts`
- Test: `tests/types/v2-protocol.test.ts`

- [ ] **Step 1: Write type definition tests**

```typescript
// tests/types/v2-protocol.test.ts
import { PageType, SkillRef, SkillsMode, ContextWindowSize } from '../../src/types/v2-protocol';

describe('PageType', () => {
  it('should include all supported page types', () => {
    const types: PageType[] = [
      'lark_a1',
      'lark_a2',
      'meegle_project',
      'meegle_workitem',
      'github_repo',
      'github_pr',
      'unknown'
    ];
    expect(types).toHaveLength(7);
  });
});

describe('SkillRef', () => {
  it('should have required fields', () => {
    const ref: SkillRef = {
      skillId: 'ticket-classification',
      version: '1.0',
      enabled: true
    };
    expect(ref.skillId).toBe('ticket-classification');
    expect(ref.version).toBe('1.0');
  });
});

describe('SkillsMode', () => {
  it('should define execution modes', () => {
    const modes: SkillsMode[] = ['single', 'combo', 'chain'];
    expect(modes).toHaveLength(3);
  });
});

describe('ContextWindowSize', () => {
  it('should define context window sizes', () => {
    const sizes: ContextWindowSize[] = ['minimal', 'recent', 'full'];
    expect(sizes).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/types/v2-protocol.test.ts
```
Expected: FAIL with "Cannot find module '../../src/types/v2-protocol'"

- [ ] **Step 3: Implement type definitions**

```typescript
// src/types/v2-protocol.ts

/**
 * Page type enumeration for routing and context collection
 */
export type PageType =
  | 'lark_a1'        // Lark 工单页面
  | 'lark_a2'        // Lark 需求池页面
  | 'meegle_project' // Meegle 项目页面
  | 'meegle_workitem' // Meegle 工作项页面
  | 'github_repo'    // GitHub 仓库页面
  | 'github_pr'      // GitHub PR 页面
  | 'unknown';       // 未知页面类型

/**
 * Skill reference for configuration
 */
export interface SkillRef {
  skillId: string;
  version: string;
  config?: object;
  enabled?: boolean;
}

/**
 * Skill config item for client UI
 */
export interface SkillConfigItem {
  skillId: string;
  displayName: string;
  description: string;
  config?: object;
}

/**
 * Skills execution mode semantics
 */
export type SkillsMode =
  | 'single'  // 单技能执行（quick 模式）
  | 'combo'   // 多技能并行执行（standard 模式）
  | 'chain';  // 技能链串行执行（deep 模式）

/**
 * Context window size semantics
 */
export type ContextWindowSize =
  | 'minimal' // 仅当前页面核心数据（<1K tokens）
  | 'recent'  // 最近 3 次分析历史（<10K tokens）
  | 'full';   // 完整 Session 历史（无限制）

/**
 * Think effort mode
 */
export type ThinkEffortMode = 'quick' | 'standard' | 'deep';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/types/v2-protocol.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/types/v2-protocol.ts tests/types/v2-protocol.test.ts
git commit -m "feat(v2): define core protocol types (P0.1)

- Add PageType enum (7 page types)
- Add SkillRef and SkillConfigItem interfaces
- Add SkillsMode and ContextWindowSize types
- Add ThinkEffortMode type"
```

---

### Task P0.2: Define Context Types

**Files:**
- Create: `src/types/v2-context.ts`
- Test: `tests/types/v2-context.test.ts`

- [ ] **Step 1: Write context type tests**

```typescript
// tests/types/v2-context.test.ts
import {
  Context,
  PageContext,
  UserContext,
  HistoryContext,
  ContextCollector
} from '../../src/types/v2-context';

describe('PageContext', () => {
  it('should have page identification fields', () => {
    const ctx: PageContext = {
      pageType: 'lark_a1',
      url: 'https://example.lark.cn/bases/base123/tables/tbl456',
      recordId: 'rec789',
      baseId: 'base123',
      tableId: 'tbl456'
    };
    expect(ctx.pageType).toBe('lark_a1');
    expect(ctx.url).toContain('lark.cn');
  });
});

describe('UserContext', () => {
  it('should have user identification', () => {
    const ctx: UserContext = {
      operatorLarkId: 'user123',
      meegleUserKey: 'meegle_key_abc',
      preferences: { theme: 'dark' }
    };
    expect(ctx.operatorLarkId).toBe('user123');
  });
});

describe('HistoryContext', () => {
  it('should contain last analysis and thinking logs', () => {
    const ctx: HistoryContext = {
      lastAnalysis: {
        timestamp: '2026-03-23T10:00:00Z',
        effort: 'standard',
        result: { summary: 'test' }
      },
      thinkingLogs: [
        { phase: 'understanding', message: 'Reading ticket', timestamp: '2026-03-23T10:00:01Z' }
      ]
    };
    expect(ctx.lastAnalysis?.effort).toBe('standard');
  });
});

describe('ContextCollector', () => {
  it('should define collector interface', () => {
    const collector: ContextCollector = {
      collectorId: 'record-fields',
      description: 'Collect form fields',
      handler: async (page: any) => ({})
    };
    expect(collector.collectorId).toBe('record-fields');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/types/v2-context.test.ts
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement context types**

```typescript
// src/types/v2-context.ts
import { PageType, ThinkEffortMode } from './v2-protocol';

/**
 * Page context - collected from client
 */
export interface PageContext {
  pageType: PageType;
  url: string;
  recordId?: string;
  baseId?: string;
  tableId?: string;
  projectKey?: string;
  workitemId?: string;
  pageSnapshot?: object; // Compressed, < 100KB
}

/**
 * User context - from identity system
 */
export interface UserContext {
  operatorLarkId: string;
  meegleUserKey?: string;
  githubId?: string;
  preferences?: object;
}

/**
 * History context - from session history
 */
export interface HistoryContext {
  lastAnalysis?: {
    timestamp: string; // ISO 8601
    effort: ThinkEffortMode;
    result: object;
  };
  thinkingLogs?: Array<{
    phase: string;
    message: string;
    timestamp: string; // ISO 8601
  }>;
}

/**
 * Unified context object
 */
export interface Context {
  page?: PageContext;
  user?: UserContext;
  history?: HistoryContext;
}

/**
 * Context collector interface
 */
export interface ContextCollector {
  collectorId: string;
  description: string;
  handler: (page: object) => Promise<object>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/types/v2-context.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/types/v2-context.ts tests/types/v2-context.test.ts
git commit -m "feat(v2): define context types (P0.2)

- Add PageContext, UserContext, HistoryContext interfaces
- Add unified Context type
- Add ContextCollector interface"
```

---

### Task P0.3: Define Session Types

**Files:**
- Create: `src/types/v2-session.ts`
- Test: `tests/types/v2-session.test.ts`

- [ ] **Step 1: Write session type tests**

```typescript
// tests/types/v2-session.test.ts
import { Session, SessionTTL, SessionState, defaultSessionTTL } from '../../src/types/v2-session';

describe('SessionTTL', () => {
  it('should have default TTL of 7 days', () => {
    expect(defaultSessionTTL.ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('should limit history to 50 entries', () => {
    expect(defaultSessionTTL.maxHistoryEntries).toBe(50);
  });

  it('should limit history to 1MB', () => {
    expect(defaultSessionTTL.maxHistoryBytes).toBe(1024 * 1024);
  });
});

describe('Session', () => {
  it('should have all required fields', () => {
    const session: Session = {
      sessionId: 'sess_abc123',
      userId: 'user_456',
      urlPrefix: 'lark_a1',
      pageType: 'lark_a1',
      skills: [{ skillId: 'ticket-classification', version: '1.0' }],
      context: {},
      history: [],
      createdAt: '2026-03-23T10:00:00Z',
      updatedAt: '2026-03-23T10:00:00Z',
      lastAccessedAt: '2026-03-23T10:00:00Z'
    };
    expect(session.sessionId).toBe('sess_abc123');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/types/v2-session.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement session types**

```typescript
// src/types/v2-session.ts
import { PageType, SkillRef, ThinkEffortMode } from './v2-protocol';
import { PageContext, UserContext } from './v2-context';

/**
 * Session state
 */
export type SessionState = 'active' | 'idle' | 'expired';

/**
 * Session TTL policy
 */
export interface SessionTTL {
  ttlMs: number;           // Default 7 days
  maxHistoryEntries: number;  // Max 50 history entries
  maxHistoryBytes: number;    // Max 1MB history
}

/**
 * Default session TTL configuration
 */
export const defaultSessionTTL: SessionTTL = {
  ttlMs: 7 * 24 * 60 * 60 * 1000,     // 7 days
  maxHistoryEntries: 50,               // 50 entries
  maxHistoryBytes: 1024 * 1024         // 1MB
};

/**
 * Session schema
 */
export interface Session {
  sessionId: string;
  userId: string;
  urlPrefix: string;
  pageType: PageType;

  // Bound skills
  skills: SkillRef[];

  // Context data
  context: {
    page?: PageContext;
    user?: UserContext;
    lastRecordId?: string;
    pageSnapshot?: object; // < 100KB compressed
  };

  // History
  history: Array<{
    timestamp: string;  // ISO 8601
    effort: ThinkEffortMode;
    input: object;
    output: object;
    thinkingLog: Array<{
      phase: string;
      message: string;
      timestamp: string;  // ISO 8601
    }>;
  }>;

  // Lifecycle
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
  lastAccessedAt: string;  // ISO 8601
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/types/v2-session.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/types/v2-session.ts tests/types/v2-session.test.ts
git commit -m "feat(v2): define session types and TTL (P0.3)

- Add Session interface with lifecycle fields
- Add SessionTTL configuration (7 days, 50 entries, 1MB)
- Add SessionState type"
```

---

## Phase P1: Skill Registry

### Task P1.1: URL Pattern Matcher

**Files:**
- Create: `src/skill-registry/url-matcher.ts`
- Test: `tests/skill-registry/url-matcher.test.ts`

- [ ] **Step 1: Write URL matcher tests**

```typescript
// tests/skill-registry/url-matcher.test.ts
import { matchUrlPattern } from '../../src/skill-registry/url-matcher';

describe('matchUrlPattern', () => {
  it('should match exact URLs', () => {
    const pattern = 'https://example.lark.cn/bases/:baseId/tables/:tableId';
    const url = 'https://example.lark.cn/bases/base123/tables/tbl456';
    const result = matchUrlPattern(pattern, url);
    expect(result.matches).toBe(true);
    expect(result.params).toEqual({ baseId: 'base123', tableId: 'tbl456' });
  });

  it('should support wildcard patterns', () => {
    const pattern = 'https://*.meegle.com/projects/:projectKey/*';
    const url = 'https://app.meegle.com/projects/proj123/tasks';
    const result = matchUrlPattern(pattern, url);
    expect(result.matches).toBe(true);
    expect(result.params?.projectKey).toBe('proj123');
  });

  it('should return false for non-matching URLs', () => {
    const pattern = 'https://example.lark.cn/*';
    const url = 'https://other.domain.com/path';
    const result = matchUrlPattern(pattern, url);
    expect(result.matches).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/skill-registry/url-matcher.test.ts
```
Expected: FAIL

- [ ] **Step 3: Install path-to-regexp dependency**

```bash
npm install path-to-regexp
```

- [ ] **Step 4: Implement URL matcher**

```typescript
// src/skill-registry/url-matcher.ts
import { pathToRegexp, match } from 'path-to-regexp';

export interface MatchResult {
  matches: boolean;
  params?: Record<string, string>;
}

/**
 * Match URL against a pattern using path-to-regexp
 * @param pattern URL pattern (e.g., "https://*.lark.cn/bases/:baseId/tables/:tableId")
 * @param url Full URL to match
 * @returns MatchResult with matches flag and optional params
 */
export function matchUrlPattern(pattern: string, url: string): MatchResult {
  try {
    const matchFn = match<{ [key: string]: string }>(pattern, {
      decode: decodeURIComponent
    });
    const result = matchFn(url);

    if (result) {
      return {
        matches: true,
        params: result.params as Record<string, string>
      };
    }

    return { matches: false };
  } catch (error) {
    console.error(`Failed to match pattern ${pattern}:`, error);
    return { matches: false };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/skill-registry/url-matcher.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/skill-registry/url-matcher.ts tests/skill-registry/url-matcher.test.ts
git commit -m "feat(v2): implement URL pattern matcher (P1.1)

- Add matchUrlPattern function using path-to-regexp
- Support :param and * wildcard syntax
- Add comprehensive unit tests"
```

---

### Task P1.2: Skill Registry Core

**Files:**
- Create: `src/skill-registry/registry.ts`
- Create: `src/skill-registry/config-loader.ts`
- Test: `tests/skill-registry/registry.test.ts`

- [ ] **Step 1: Write registry tests**

```typescript
// tests/skill-registry/registry.test.ts
import { SkillRegistry } from '../../src/skill-registry/registry';

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('should load skill configurations', async () => {
    const configs = [
      {
        urlPattern: 'https://*.lark.cn/bases/:baseId/tables/:tableId',
        urlPrefix: 'lark_a1',
        pageType: 'lark_a1' as const,
        skills: [{ skillId: 'ticket-classification', displayName: '工单分类', description: '自动识别工单类型' }],
        contextCollectors: ['record-fields'],
        defaultEffort: 'standard' as const
      }
    ];
    await registry.loadConfigs(configs);
    expect(registry.getConfigs().length).toBe(1);
  });

  it('should find config by URL', async () => {
    const configs = [
      {
        urlPattern: 'https://*.lark.cn/*',
        urlPrefix: 'lark_a1',
        pageType: 'lark_a1' as const,
        skills: [],
        contextCollectors: [],
        defaultEffort: 'standard' as const
      }
    ];
    await registry.loadConfigs(configs);

    const result = registry.findByUrl('https://example.lark.cn/bases/base123/tables/tbl456');
    expect(result).toBeDefined();
    expect(result?.urlPrefix).toBe('lark_a1');
  });

  it('should return 404 for unmatched URLs', async () => {
    await registry.loadConfigs([]);
    const result = registry.findByUrl('https://unknown.domain.com/path');
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/skill-registry/registry.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement Skill Registry**

```typescript
// src/skill-registry/registry.ts
import { SkillConfig, SkillConfigItem } from '../types/v2-protocol';
import { matchUrlPattern } from './url-matcher';

export interface SkillRegistryConfig {
  urlPattern: string;
  urlPrefix: string;
  pageType: string;
  skills: SkillConfigItem[];
  contextCollectors: string[];
  defaultEffort: 'quick' | 'standard' | 'deep';
}

/**
 * Central skill registry - manages URL → Skills mapping
 */
export class SkillRegistry {
  private configs: SkillRegistryConfig[] = [];

  /**
   * Load skill configurations
   */
  async loadConfigs(configs: SkillRegistryConfig[]): Promise<void> {
    this.configs = configs;
  }

  /**
   * Get all loaded configs
   */
  getConfigs(): SkillRegistryConfig[] {
    return [...this.configs];
  }

  /**
   * Find matching config by URL
   * @param url Current page URL
   * @returns Matching config or undefined
   */
  findByUrl(url: string): SkillRegistryConfig | undefined {
    for (const config of this.configs) {
      const result = matchUrlPattern(config.urlPattern, url);
      if (result.matches) {
        return config;
      }
    }
    return undefined;
  }
}

// Export singleton instance
export const skillRegistry = new SkillRegistry();
```

- [ ] **Step 4: Implement Config Loader**

```typescript
// src/skill-registry/config-loader.ts
import { SkillRegistryConfig } from './registry';

/**
 * Load skill configurations from file or API
 */
export async function loadSkillConfigs(source: string | object): Promise<SkillRegistryConfig[]> {
  if (typeof source === 'string') {
    // Load from file or URL
    const response = await fetch(source);
    return response.json();
  }
  return source as SkillRegistryConfig[];
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/skill-registry/registry.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/skill-registry/ tests/skill-registry/
git commit -m "feat(v2): implement skill registry (P1.2)

- Add SkillRegistry class with URL matching
- Add config loader for file/API sources
- Add unit tests"
```

---

### Task P1.3: Built-in Skills Skeleton

**Files:**
- Create: `src/skills/builtin/index.ts`
- Create: `src/skills/builtin/ticket-classification.ts`
- Create: `src/skills/builtin/missing-info-detection.ts`
- Create: `src/skills/builtin/requirement-structuring.ts`
- Create: `src/skills/builtin/blocker-detection.ts`
- Test: `tests/skills/builtin/ticket-classification.test.ts`

- [ ] **Step 1: Create skill skeleton with tests**

```typescript
// tests/skills/builtin/ticket-classification.test.ts
import { ticketClassificationSkill } from '../../../src/skills/builtin/ticket-classification';

describe('ticketClassificationSkill', () => {
  it('should have correct skill metadata', () => {
    expect(ticketClassificationSkill.skillId).toBe('ticket-classification');
    expect(ticketClassificationSkill.type).toBe('analysis');
  });

  it('should have input schema', () => {
    expect(ticketClassificationSkill.inputSchema).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement ticket classification skill skeleton**

```typescript
// src/skills/builtin/ticket-classification.ts
import { Skill, Context, SkillResult } from '../../types/v2-skill';

export const ticketClassificationSkill: Skill = {
  skillId: 'ticket-classification',
  version: '1.0.0',
  type: 'analysis',
  inputSchema: {
    type: 'object',
    properties: {
      ticketTitle: { type: 'string' },
      ticketDescription: { type: 'string' },
      ticketType: { type: 'string' }
    },
    required: ['ticketTitle', 'ticketDescription']
  },
  handler: async (context: Context, config?: object): Promise<SkillResult> => {
    // TODO: Implement classification logic
    return {
      status: 'success',
      data: {
        classification: 'bug',
        confidence: 0.0
      }
    };
  }
};
```

- [ ] **Step 3: Create other skill skeletons**

```typescript
// src/skills/builtin/missing-info-detection.ts
import { Skill } from '../../types/v2-skill';

export const missingInfoDetectionSkill: Skill = {
  skillId: 'missing-info-detection',
  version: '1.0.0',
  type: 'analysis',
  inputSchema: {},
  handler: async () => ({ status: 'success', data: {} })
};

// src/skills/builtin/requirement-structuring.ts
import { Skill } from '../../types/v2-skill';

export const requirementStructuringSkill: Skill = {
  skillId: 'requirement-structuring',
  version: '1.0.0',
  type: 'analysis',
  inputSchema: {},
  handler: async () => ({ status: 'success', data: {} })
};

// src/skills/builtin/blocker-detection.ts
import { Skill } from '../../types/v2-skill';

export const blockerDetectionSkill: Skill = {
  skillId: 'blocker-detection',
  version: '1.0.0',
  type: 'analysis',
  inputSchema: {},
  handler: async () => ({ status: 'success', data: {} })
};
```

- [ ] **Step 4: Create skills index**

```typescript
// src/skills/builtin/index.ts
export { ticketClassificationSkill } from './ticket-classification';
export { missingInfoDetectionSkill } from './missing-info-detection';
export { requirementStructuringSkill } from './requirement-structuring';
export { blockerDetectionSkill } from './blocker-detection';

export const builtinSkills = [
  ticketClassificationSkill,
  missingInfoDetectionSkill,
  requirementStructuringSkill,
  blockerDetectionSkill
];
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/skills/builtin/
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/skills/ tests/skills/
git commit -m "feat(v2): create built-in skill skeletons (P1.3)

- Add ticket-classification skill
- Add missing-info-detection skill
- Add requirement-structuring skill
- Add blocker-detection skill"
```

---

## Phase P2: Session & Context Management

### Task P2.1: Session Manager

**Files:**
- Create: `src/session/session-manager.ts`
- Create: `src/session/session-store.ts`
- Test: `tests/session/session-manager.test.ts`

- [ ] **Step 1: Write session manager tests**

```typescript
// tests/session/session-manager.test.ts
import { SessionManager } from '../../src/session/session-manager';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('should create a new session', async () => {
    const session = await manager.create('lark_a1', 'lark_a1');
    expect(session.sessionId).toBeDefined();
    expect(session.urlPrefix).toBe('lark_a1');
    expect(session.pageType).toBe('lark_a1');
  });

  it('should restore session by ID', async () => {
    const created = await manager.create('lark_a1', 'lark_a1');
    const restored = await manager.restore(created.sessionId);
    expect(restored?.sessionId).toBe(created.sessionId);
  });

  it('should find sessions by prefix', async () => {
    await manager.create('lark_a1', 'lark_a1');
    await manager.create('lark_a1', 'lark_a1');
    const sessions = await manager.findByPrefix('user123', 'lark_a1');
    expect(sessions.length).toBe(2);
  });

  it('should touch session to update lastAccessedAt', async () => {
    const session = await manager.create('lark_a1', 'lark_a1');
    const beforeTouch = session.lastAccessedAt;
    await new Promise(r => setTimeout(r, 10));
    await manager.touch(session.sessionId);
    const refreshed = await manager.restore(session.sessionId);
    expect(refreshed?.lastAccessedAt).toBeGreaterThan(beforeTouch);
  });
});
```

- [ ] **Step 2: Implement in-memory session store (for testing)**

```typescript
// src/session/session-store.ts
import { Session } from '../types/v2-session';

export interface SessionStore {
  get(sessionId: string): Promise<Session | null>;
  set(session: Session): Promise<void>;
  delete(sessionId: string): Promise<void>;
  findByPrefix(userId: string, urlPrefix: string): Promise<Session[]>;
}

/**
 * In-memory session store (for testing)
 */
export class InMemorySessionStore implements SessionStore {
  private store: Map<string, Session> = new Map();

  async get(sessionId: string): Promise<Session | null> {
    return this.store.get(sessionId) || null;
  }

  async set(session: Session): Promise<void> {
    this.store.set(session.sessionId, session);
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async findByPrefix(userId: string, urlPrefix: string): Promise<Session[]> {
    return Array.from(this.store.values())
      .filter(s => s.userId === userId && s.urlPrefix === urlPrefix);
  }
}
```

- [ ] **Step 3: Implement session manager**

```typescript
// src/session/session-manager.ts
import { Session, SessionState, defaultSessionTTL } from '../types/v2-session';
import { SessionStore, InMemorySessionStore } from './session-store';
import { PageType } from '../types/v2-protocol';

export class SessionManager {
  private store: SessionStore;

  constructor(store?: SessionStore) {
    this.store = store || new InMemorySessionStore();
  }

  async create(urlPrefix: string, pageType: PageType, userId: string = 'default'): Promise<Session> {
    const now = new Date().toISOString();
    const session: Session = {
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      urlPrefix,
      pageType,
      skills: [],
      context: {},
      history: [],
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now
    };
    await this.store.set(session);
    return session;
  }

  async restore(sessionId: string): Promise<Session | null> {
    return this.store.get(sessionId);
  }

  async findByPrefix(userId: string, urlPrefix: string): Promise<Session[]> {
    return this.store.findByPrefix(userId, urlPrefix);
  }

  async touch(sessionId: string): Promise<void> {
    const session = await this.store.get(sessionId);
    if (session) {
      session.lastAccessedAt = new Date().toISOString();
      session.updatedAt = new Date().toISOString();
      await this.store.set(session);
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.store.delete(sessionId);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/session/session-manager.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/session/ tests/session/
git commit -m "feat(v2): implement session manager (P2.1)

- Add SessionManager with CRUD operations
- Add InMemorySessionStore for testing
- Add TTL touch functionality"
```

---

### Task P2.2: Context Builder

**Files:**
- Create: `src/context/context-builder.ts`
- Create: `src/context/context-collectors.ts`
- Create: `src/context/context-manager.ts`
- Test: `tests/context/context-builder.test.ts`

- [ ] **Step 1: Write context builder tests**

```typescript
// tests/context/context-builder.test.ts
import { ContextBuilder } from '../../src/context/context-builder';

describe('ContextBuilder', () => {
  let builder: ContextBuilder;

  beforeEach(() => {
    builder = new ContextBuilder();
  });

  it('should build minimal context for quick effort', async () => {
    const context = await builder.build('session123', 'quick');
    expect(context.history?.thinkingLogs).toHaveLength(0);
  });

  it('should build recent context for standard effort', async () => {
    const context = await builder.build('session123', 'standard');
    expect(context.history?.thinkingLogs?.length).toBeLessThanOrEqual(3);
  });

  it('should build full context for deep effort', async () => {
    const context = await builder.build('session123', 'deep');
    // Deep mode includes full history
    expect(context).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement context builders**

```typescript
// src/context/context-builder.ts
import { Context } from '../types/v2-context';
import { ThinkEffortMode, ContextWindowSize } from '../types/v2-protocol';
import { SessionManager } from '../session/session-manager';

interface ContextWindowLimit {
  size: ContextWindowSize;
  maxHistoryEntries: number;
}

export class ContextBuilder {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  async build(sessionId: string, effort: ThinkEffortMode): Promise<Context> {
    const session = await this.sessionManager.restore(sessionId);
    if (!session) {
      return { page: {}, user: {}, history: {} };
    }

    const limit = this.getContextWindowLimit(effort);
    return this.trimByEffort(session.context, session.history, limit);
  }

  private getContextWindowLimit(effort: ThinkEffortMode): ContextWindowLimit {
    switch (effort) {
      case 'quick':
        return { size: 'minimal', maxHistoryEntries: 0 };
      case 'standard':
        return { size: 'recent', maxHistoryEntries: 3 };
      case 'deep':
        return { size: 'full', maxHistoryEntries: Infinity };
    }
  }

  private trimByEffort(
    page: any,
    history: any[],
    limit: ContextWindowLimit
  ): Context {
    const trimmedHistory = limit.maxHistoryEntries === 0
      ? []
      : history.slice(-limit.maxHistoryEntries);

    return {
      page,
      history: {
        lastAnalysis: trimmedHistory[trimmedHistory.length - 1],
        thinkingLogs: trimmedHistory.flatMap(h => h.thinkingLog || [])
      }
    };
  }
}
```

- [ ] **Step 3: Implement context collectors**

```typescript
// src/context/context-collectors.ts
import { ContextCollector } from '../types/v2-context';

export const recordFieldsCollector: ContextCollector = {
  collectorId: 'record-fields',
  description: '采集记录表单字段数据',
  handler: async (page: object) => {
    // TODO: Implement field extraction from page
    return { fields: {} };
  }
};

export const recordCommentsCollector: ContextCollector = {
  collectorId: 'record-comments',
  description: '采集记录评论数据',
  handler: async (page: object) => {
    // TODO: Implement comment extraction
    return { comments: [] };
  }
};

export const pageSnapshotCollector: ContextCollector = {
  collectorId: 'page-snapshot',
  description: '采集页面 DOM 快照（压缩后）',
  handler: async (page: object) => {
    // TODO: Implement DOM snapshot with compression
    // Must be < 100KB after compression
    return { snapshot: {} };
  }
};

export const builtinCollectors: Record<string, ContextCollector> = {
  'record-fields': recordFieldsCollector,
  'record-comments': recordCommentsCollector,
  'page-snapshot': pageSnapshotCollector
};
```

- [ ] **Step 4: Implement context manager**

```typescript
// src/context/context-manager.ts
import { Context } from '../types/v2-context';
import { ContextBuilder } from './context-builder';

export class ContextManager {
  private builder: ContextBuilder;

  constructor(builder: ContextBuilder) {
    this.builder = builder;
  }

  async buildContext(sessionId: string, effort: string): Promise<Context> {
    return this.builder.build(sessionId, effort as any);
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/context/context-builder.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/context/ tests/context/
git commit -m "feat(v2): implement context builder (P2.2)

- Add ContextBuilder with effort-based trimming
- Add built-in context collectors
- Add ContextManager"
```

---

## Phase P3: Think Effort Controller

### Task P3.1: Effort Profiles and Resource Tracker

**Files:**
- Create: `src/think-effort/effort-controller.ts`
- Create: `src/think-effort/resource-tracker.ts`
- Test: `tests/think-effort/effort-controller.test.ts`

- [ ] **Step 1: Write effort controller tests**

```typescript
// tests/think-effort/effort-controller.test.ts
import { ThinkEffortController, ThinkEffortProfile } from '../../src/think-effort/effort-controller';

describe('ThinkEffortController', () => {
  let controller: ThinkEffortController;

  beforeEach(() => {
    controller = new ThinkEffortController();
  });

  it('should have quick profile with 2 max LLM calls', () => {
    const profile = controller.getProfile('quick');
    expect(profile.maxLlmCalls).toBe(2);
    expect(profile.maxTokens).toBe(4000);
  });

  it('should have standard profile with 5 max LLM calls', () => {
    const profile = controller.getProfile('standard');
    expect(profile.maxLlmCalls).toBe(5);
    expect(profile.maxTokens).toBe(16000);
  });

  it('should have deep profile with 20 max LLM calls', () => {
    const profile = controller.getProfile('deep');
    expect(profile.maxLlmCalls).toBe(20);
    expect(profile.maxTokens).toBe(100000);
    expect(profile.reflection).toBe(true);
  });
});
```

- [ ] **Step 2: Implement effort controller**

```typescript
// src/think-effort/effort-controller.ts
import { ThinkEffortMode, SkillsMode, ContextWindowSize } from '../types/v2-protocol';

export interface ThinkEffortProfile {
  maxDurationMs: number;
  maxLlmCalls: number;
  maxTokens: number;
  skills: SkillsMode;
  contextWindow: ContextWindowSize;
  reflection?: boolean;
}

const EFFORT_PROFILES: Record<ThinkEffortMode, ThinkEffortProfile> = {
  quick: {
    maxDurationMs: 60 * 1000,         // 1 minute
    maxLlmCalls: 2,
    maxTokens: 4000,
    skills: 'single',
    contextWindow: 'minimal'
  },
  standard: {
    maxDurationMs: 3 * 60 * 1000,     // 3 minutes
    maxLlmCalls: 5,
    maxTokens: 16000,
    skills: 'combo',
    contextWindow: 'recent'
  },
  deep: {
    maxDurationMs: 10 * 60 * 1000,    // 10 minutes
    maxLlmCalls: 20,
    maxTokens: 100000,
    skills: 'chain',
    contextWindow: 'full',
    reflection: true
  }
};

export class ThinkEffortController {
  getProfile(effort: ThinkEffortMode): ThinkEffortProfile {
    return EFFORT_PROFILES[effort];
  }

  isWithinLimits(
    profile: ThinkEffortProfile,
    current: { durationMs: number; llmCalls: number; tokens: number }
  ): boolean {
    return (
      current.durationMs < profile.maxDurationMs &&
      current.llmCalls < profile.maxLlmCalls &&
      current.tokens < profile.maxTokens
    );
  }
}
```

- [ ] **Step 3: Implement resource tracker**

```typescript
// src/think-effort/resource-tracker.ts
export class ResourceTracker {
  private startTime: number;
  private llmCallCount: number = 0;
  private tokenCount: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  recordLlmCall(tokens: number): void {
    this.llmCallCount++;
    this.tokenCount += tokens;
  }

  getDurationMs(): number {
    return Date.now() - this.startTime;
  }

  getLlmCalls(): number {
    return this.llmCallCount;
  }

  getTokens(): number {
    return this.tokenCount;
  }

  reset(): void {
    this.startTime = Date.now();
    this.llmCallCount = 0;
    this.tokenCount = 0;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/think-effort/effort-controller.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/think-effort/ tests/think-effort/
git commit -m "feat(v2): implement think effort controller (P3.1)

- Add ThinkEffortProfile with resource limits
- Add quick (2 calls, 4K tokens), standard (5 calls, 16K), deep (20 calls, 100K)
- Add ResourceTracker for monitoring"
```

---

## Phase P4: SSE Streaming

### Task P4.1: SSE Event Stream

**Files:**
- Create: `src/sse/sse-stream.ts`
- Create: `src/sse/event-store.ts`
- Test: `tests/sse/sse-stream.test.ts`

- [ ] **Step 1: Write SSE tests**

```typescript
// tests/sse/sse-stream.test.ts
import { SseStream, SseEvent } from '../../src/sse/sse-stream';

describe('SseStream', () => {
  let stream: SseStream;

  beforeEach(() => {
    stream = new SseStream();
  });

  it('should emit thinking-start event', () => {
    const event: SseEvent = {
      eventId: '1',
      sessionId: 'sess123',
      timestamp: new Date().toISOString(),
      event: 'thinking-start',
      data: { phase: 'understanding', message: 'Reading input' }
    };
    stream.emit(event);
    // Verify event is stored
    expect(stream.getEvents('sess123').length).toBe(1);
  });

  it('should support reconnection from Last-Event-ID', () => {
    stream.emit({ eventId: '1', sessionId: 'sess123', timestamp: new Date().toISOString(), event: 'thinking-start', data: {} });
    stream.emit({ eventId: '2', sessionId: 'sess123', timestamp: new Date().toISOString(), event: 'skill-execution', data: {} });
    stream.emit({ eventId: '3', sessionId: 'sess123', timestamp: new Date().toISOString(), event: 'final-result', data: {} });

    const events = stream.getEventsSince('sess123', '1');
    expect(events.length).toBe(2); // Events 2 and 3
  });
});
```

- [ ] **Step 2: Implement SSE stream**

```typescript
// src/sse/sse-stream.ts
export interface SseEvent {
  eventId: string;       // Incrementing sequence ID
  sessionId: string;     // Session ID for recovery
  timestamp: string;     // ISO 8601
  event: string;
  data: object;
}

export class SseStream {
  private events: Map<string, SseEvent[]> = new Map();
  private counters: Map<string, number> = new Map();

  emit(event: SseEvent): void {
    const sessionEvents = this.events.get(event.sessionId) || [];
    sessionEvents.push(event);
    this.events.set(event.sessionId, sessionEvents);

    const counter = this.counters.get(event.sessionId) || 0;
    this.counters.set(event.sessionId, counter + 1);
  }

  getEvents(sessionId: string): SseEvent[] {
    return this.events.get(sessionId) || [];
  }

  getEventsSince(sessionId: string, lastEventId: string): SseEvent[] {
    const events = this.events.get(sessionId) || [];
    const lastId = parseInt(lastEventId, 10);
    return events.filter(e => parseInt(e.eventId, 10) > lastId);
  }

  cleanup(sessionId: string): void {
    this.events.delete(sessionId);
    this.counters.delete(sessionId);
  }
}
```

- [ ] **Step 3: Implement event store with 5-min retention**

```typescript
// src/sse/event-store.ts
import { SseEvent } from './sse-stream';

export class EventStore {
  private events: Map<string, Array<SseEvent & { expiresAt: number }>> = new Map();
  private readonly RETENTION_MS = 5 * 60 * 1000; // 5 minutes

  add(sessionId: string, event: SseEvent): void {
    const sessionEvents = this.events.get(sessionId) || [];
    const now = Date.now();

    // Clean expired events
    const validEvents = sessionEvents.filter(e => e.expiresAt > now);

    validEvents.push({
      ...event,
      expiresAt: now + this.RETENTION_MS
    });

    this.events.set(sessionId, validEvents);
  }

  getSince(sessionId: string, lastEventId: string): SseEvent[] {
    const events = this.events.get(sessionId) || [];
    const lastId = parseInt(lastEventId, 10);
    return events
      .filter(e => parseInt(e.eventId, 10) > lastId)
      .map(({ expiresAt, ...event }) => event);
  }

  cleanup(sessionId: string): void {
    this.events.delete(sessionId);
  }

  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, events] of this.events.entries()) {
      const valid = events.filter(e => e.expiresAt > now);
      cleaned += events.length - valid.length;
      this.events.set(sessionId, valid);
    }

    return cleaned;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/sse/sse-stream.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sse/ tests/sse/
git commit -m "feat(v2): implement SSE streaming (P4.1)

- Add SseStream for event emission
- Add EventStore with 5-min retention
- Support reconnection via Last-Event-ID"
```

---

## Appendix: Type Definitions

Add missing skill type definition file:

**Create: `src/types/v2-skill.ts`**

```typescript
// src/types/v2-skill.ts
import { Context } from './v2-context';

export type SkillType = 'analysis' | 'action';

export interface Skill {
  skillId: string;
  version: string;
  type: SkillType;
  inputSchema: object;
  handler: (context: Context, config?: object) => Promise<SkillResult>;
}

export interface SkillResult {
  status: 'success' | 'error' | 'requires_confirmation';
  data: object;
  sideEffect?: SideEffect;
  error?: string;
}

export interface SideEffect {
  type: 'create_workitem' | 'update_workitem' | 'create_comment';
  description: string;
  payload: object;
}
```

---

## Summary

This plan covers:
- **P0**: Core types (protocol, context, session)
- **P1**: Skill Registry (URL matching, config loading, built-in skills)
- **P2**: Session & Context Management
- **P3**: Think Effort Controller
- **P4**: SSE Streaming

**Next phases (not covered in this plan):**
- API Routes implementation
- Client-side popup UI
- Full skill implementations
- Integration tests
