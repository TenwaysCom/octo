# GitHub PR Meegle Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement GitHub PR page integration that extracts Meegle work item IDs from PR content and displays work item details in the extension popup.

**Architecture:** Server-side GitHub API approach - Extension sends PR URL to Server, Server fetches PR details/commits/comments from GitHub API, extracts Meegle IDs, queries Meegle API, and returns results to Extension.

**Tech Stack:** TypeScript, WXT (extension), Express (server), GitHub REST API v3, Meegle OpenAPI

---

## File Structure Overview

### Server-Side Files
| File | Responsibility |
|------|----------------|
| `server/src/adapters/github/github-client.ts` | GitHub API client - fetch PR details, commits, comments |
| `server/src/domain/meegle-id-extractor.ts` | Extract Meegle IDs from text using regex patterns |
| `server/src/controllers/github-reverse-lookup.ts` | HTTP controller - orchestrate lookup flow |
| `server/src/routes/github-lookup.ts` | Route registration for `/api/github/lookup-meegle` |

### Extension-Side Files
| File | Responsibility |
|------|----------------|
| `extension/src/platform-url.ts` | Add GitHub platform detection |
| `extension/wxt.config.ts` | Add GitHub host permissions |
| `extension/src/popup-shared/controllers/github-lookup.ts` | Lazy-loaded controller for GitHub lookup feature |
| `extension/src/popup-react/components/GithubLookupResult.tsx` | React component to display lookup results |
| `extension/src/popup-shared/popup-controller.ts` | Add `githubActions` and `githubLookup` state |
| `extension/src/popup-react/pages/AutomationPage.tsx` | Add GitHub platform rendering |

---

## Task 1: Server - Create GitHub Client Adapter

**Files:**
- Create: `server/src/adapters/github/github-client.ts`
- Create: `server/src/adapters/github/github-types.ts`
- Test: `server/src/adapters/github/github-client.test.ts`

### Step 1.1: Write failing test for GitHubClient

```typescript
// server/src/adapters/github/github-client.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GitHubClient } from "./github-client.js";

describe("GitHubClient", () => {
  let client: GitHubClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new GitHubClient({ token: "test-token", fetch: mockFetch });
  });

  describe("parsePrUrl", () => {
    it("should parse valid GitHub PR URL", () => {
      const result = client.parsePrUrl("https://github.com/owner/repo/pull/123");
      expect(result).toEqual({ owner: "owner", repo: "repo", pullNumber: 123 });
    });

    it("should throw for invalid URL", () => {
      expect(() => client.parsePrUrl("https://example.com/invalid")).toThrow("INVALID_PR_URL");
    });
  });

  describe("getPullRequest", () => {
    it("should fetch PR details", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: "Fix bug", body: "Description" }),
      });

      const result = await client.getPullRequest("owner", "repo", 123);
      expect(result.title).toBe("Fix bug");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls/123",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });
  });
});
```

### Step 1.2: Run test to verify it fails

```bash
cd /home/uynil/projects/tw-itdog/server
npm test -- src/adapters/github/github-client.test.ts
```

Expected: FAIL - "Cannot find module"

### Step 1.3: Implement GitHub types

```typescript
// server/src/adapters/github/github-types.ts
export interface GitHubPrDetails {
  title: string;
  body: string | null;
  number: number;
  html_url: string;
}

export interface GitHubCommit {
  commit: {
    message: string;
  };
  sha: string;
}

export interface GitHubComment {
  body: string;
  user: { login: string };
  created_at: string;
}

export interface ParsedPrUrl {
  owner: string;
  repo: string;
  pullNumber: number;
}
```

### Step 1.4: Implement GitHubClient

```typescript
// server/src/adapters/github/github-client.ts
import { logger } from "../../logger.js";
import type { GitHubPrDetails, GitHubCommit, GitHubComment, ParsedPrUrl } from "./github-types.js";

const githubLogger = logger.child({ module: "github-client" });

const GITHUB_API_BASE = "https://api.github.com";

export interface GitHubClientOptions {
  token: string;
  fetch?: typeof fetch;
}

export class GitHubClient {
  private token: string;
  private fetch: typeof fetch;

  constructor(options: GitHubClientOptions) {
    this.token = options.token;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  parsePrUrl(url: string): ParsedPrUrl {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      const error = new Error("Invalid GitHub PR URL");
      (error as Error & { code: string }).code = "INVALID_PR_URL";
      throw error;
    }
    return {
      owner: match[1],
      repo: match[2],
      pullNumber: parseInt(match[3], 10),
    };
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${GITHUB_API_BASE}${path}`;
    githubLogger.debug({ url }, "GitHub API request");

    const response = await this.fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Octo-Extension",
      },
    });

    if (!response.ok) {
      const error = new Error(`GitHub API error: ${response.status}`);
      (error as Error & { code: string; status: number }).code = "GITHUB_API_ERROR";
      (error as Error & { status: number }).status = response.status;
      throw error;
    }

    return response.json() as Promise<T>;
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<GitHubPrDetails> {
    return this.request<GitHubPrDetails>(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
  }

  async getCommits(owner: string, repo: string, pullNumber: number): Promise<GitHubCommit[]> {
    return this.request<GitHubCommit[]>(`/repos/${owner}/${repo}/pulls/${pullNumber}/commits`);
  }

  async getIssueComments(owner: string, repo: string, pullNumber: number): Promise<GitHubComment[]> {
    return this.request<GitHubComment[]>(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`);
  }

  async getReviewComments(owner: string, repo: string, pullNumber: number): Promise<GitHubComment[]> {
    return this.request<GitHubComment[]>(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`);
  }
}
```

### Step 1.5: Run tests to verify they pass

```bash
npm test -- src/adapters/github/github-client.test.ts
```

Expected: PASS

### Step 1.6: Commit

```bash
git add server/src/adapters/github/
git commit -m "feat(server): add GitHub client adapter

- Add GitHubClient for PR, commits, and comments API
- Add parsePrUrl for URL validation
- Add comprehensive error handling with error codes"
```

---

## Task 2: Server - Create Meegle ID Extractor

**Files:**
- Create: `server/src/domain/meegle-id-extractor.ts`
- Test: `server/src/domain/meegle-id-extractor.test.ts`

### Step 2.1: Write failing test

```typescript
// server/src/domain/meegle-id-extractor.test.ts
import { describe, it, expect } from "vitest";
import { extractMeegleIds } from "./meegle-id-extractor.js";

describe("extractMeegleIds", () => {
  it("should extract pure numeric IDs (6+ digits)", () => {
    const result = extractMeegleIds("Fix bug #123456 and #789012");
    expect(result).toEqual(["123456", "789012"]);
  });

  it("should extract m- prefixed IDs", () => {
    const result = extractMeegleIds("Related to m-49545");
    expect(result).toContain("49545");
  });

  it("should extract f- prefixed IDs", () => {
    const result = extractMeegleIds("Fixes f-123456");
    expect(result).toContain("123456");
  });

  it("should deduplicate IDs", () => {
    const result = extractMeegleIds("m-123 and f-123 and #123456");
    expect(result).toEqual(["123"]);
  });

  it("should extract from multiple sources", () => {
    const sources = {
      title: "Fix m-123",
      description: "See #456789",
      commits: [{ message: "fix: bug f-100" }],
      comments: [{ body: "Check m-200" }],
    };
    const result = extractMeegleIds(sources);
    expect(result).toEqual(["123", "456789", "100", "200"]);
  });

  it("should return empty array for no matches", () => {
    const result = extractMeegleIds("No IDs here");
    expect(result).toEqual([]);
  });
});
```

### Step 2.2: Run test to verify it fails

```bash
npm test -- src/domain/meegle-id-extractor.test.ts
```

Expected: FAIL - module not found

### Step 2.3: Implement Meegle ID Extractor

```typescript
// server/src/domain/meegle-id-extractor.ts
export interface TextSources {
  title?: string;
  description?: string | null;
  commits?: Array<{ message: string }>;
  comments?: Array<{ body: string }>;
}

const PATTERNS = [
  { regex: /\b(\d{6,})\b/g, description: "pure numeric (6+ digits)" },
  { regex: /\bm-(\d+)\b/gi, description: "m- prefix" },
  { regex: /\bf-(\d+)\b/gi, description: "f- prefix" },
  { regex: /#(\d{6,})/g, description: "# prefix" },
];

function extractFromText(text: string): string[] {
  const ids: string[] = [];
  for (const { regex } of PATTERNS) {
    const matches = text.matchAll(regex);
    for (const match of matches) {
      if (match[1]) {
        ids.push(match[1]);
      }
    }
  }
  return ids;
}

export function extractMeegleIds(sources: string | TextSources): string[] {
  const allIds: string[] = [];

  if (typeof sources === "string") {
    allIds.push(...extractFromText(sources));
  } else {
    if (sources.title) {
      allIds.push(...extractFromText(sources.title));
    }
    if (sources.description) {
      allIds.push(...extractFromText(sources.description));
    }
    if (sources.commits) {
      for (const commit of sources.commits) {
        allIds.push(...extractFromText(commit.message));
      }
    }
    if (sources.comments) {
      for (const comment of sources.comments) {
        allIds.push(...extractFromText(comment.body));
      }
    }
  }

  // Deduplicate while preserving order
  return [...new Set(allIds)];
}
```

### Step 2.4: Run tests to verify they pass

```bash
npm test -- src/domain/meegle-id-extractor.test.ts
```

Expected: PASS

### Step 2.5: Commit

```bash
git add server/src/domain/
git commit -m "feat(server): add Meegle ID extractor

- Extract IDs from 4 formats: pure numeric, m-, f-, # prefixes
- Support multi-source extraction (title, description, commits, comments)
- Deduplicate results while preserving order"
```

---

## Task 3: Server - Create GitHub Reverse Lookup Controller

**Files:**
- Modify: `server/src/adapters/meegle/meegle-client.ts` (add workItemIds parameter)
- Create: `server/src/controllers/github-reverse-lookup.ts`
- Test: `server/src/controllers/github-reverse-lookup.test.ts`

### Step 3.1: Modify MeegleClient to support work_item_ids

```typescript
// Add to server/src/adapters/meegle/meegle-client.ts
// In filterWorkitemsAcrossProjects method, add workItemIds parameter

async filterWorkitemsAcrossProjects(
  options?: {
    workitemTypeKey?: string;
    simpleNames?: string[];
    workItemIds?: string[];  // ADD THIS
    pageNum?: number;
    pageSize?: number;
  },
): Promise<MeegleWorkitem[]> {
  const { workitemTypeKey, simpleNames, workItemIds, pageNum = 1, pageSize = 50 } = options || {};

  const req: ApiReq = {
    httpMethod: "POST",
    apiPath: API_PATH_FILTER_WORKITEM_ACROSS_PROJECT,
    pathParams: {},
    queryParams: {},
    body: {
      ...(workitemTypeKey && { work_item_type_key: workitemTypeKey }),
      ...(simpleNames && { simple_names: simpleNames }),
      ...(workItemIds && { work_item_ids: workItemIds }),  // ADD THIS
      page_num: pageNum,
      page_size: pageSize,
    },
  };

  const data = await this.request(req);
  const items = parseItemsList(data.data ?? data, ["items"]);
  return items.map(parseWorkitem);
}
```

### Step 3.2: Write failing test for controller

```typescript
// server/src/controllers/github-reverse-lookup.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GitHubReverseLookupController } from "./github-reverse-lookup.js";

describe("GitHubReverseLookupController", () => {
  let controller: GitHubReverseLookupController;
  let mockGitHubClient: any;
  let mockMeegleClient: any;

  beforeEach(() => {
    mockGitHubClient = {
      parsePrUrl: vi.fn(),
      getPullRequest: vi.fn(),
      getCommits: vi.fn(),
      getIssueComments: vi.fn(),
      getReviewComments: vi.fn(),
    };
    mockMeegleClient = {
      filterWorkitemsAcrossProjects: vi.fn(),
    };
    controller = new GitHubReverseLookupController(mockGitHubClient, mockMeegleClient);
  });

  it("should lookup Meegle workitems from PR", async () => {
    mockGitHubClient.parsePrUrl.mockReturnValue({ owner: "org", repo: "repo", pullNumber: 123 });
    mockGitHubClient.getPullRequest.mockResolvedValue({ title: "Fix m-123", body: "Desc" });
    mockGitHubClient.getCommits.mockResolvedValue([]);
    mockGitHubClient.getIssueComments.mockResolvedValue([]);
    mockGitHubClient.getReviewComments.mockResolvedValue([]);
    mockMeegleClient.filterWorkitemsAcrossProjects.mockResolvedValue([
      { id: "123", name: "Test Item", workItemType: { name: "需求" } },
    ]);

    const result = await controller.lookup("https://github.com/org/repo/pull/123");

    expect(result.extractedIds).toEqual(["123"]);
    expect(result.workitems).toHaveLength(1);
  });
});
```

### Step 3.3: Run test to verify it fails

```bash
npm test -- src/controllers/github-reverse-lookup.test.ts
```

Expected: FAIL - module not found

### Step 3.4: Implement controller

```typescript
// server/src/controllers/github-reverse-lookup.ts
import { logger } from "../logger.js";
import type { GitHubClient } from "../adapters/github/github-client.js";
import type { MeegleClient } from "../adapters/meegle/meegle-client.js";
import { extractMeegleIds } from "../domain/meegle-id-extractor.js";

const lookupLogger = logger.child({ module: "github-reverse-lookup" });

export interface LookupResult {
  prInfo: {
    title: string;
    description: string | null;
    url: string;
  };
  extractedIds: string[];
  workitems: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    [key: string]: unknown;
  }>;
  notFound: string[];
}

export class GitHubReverseLookupController {
  constructor(
    private githubClient: GitHubClient,
    private meegleClient: MeegleClient
  ) {}

  async lookup(prUrl: string): Promise<LookupResult> {
    lookupLogger.info({ prUrl }, "Starting GitHub PR lookup");

    // Parse PR URL
    const { owner, repo, pullNumber } = this.githubClient.parsePrUrl(prUrl);
    lookupLogger.debug({ owner, repo, pullNumber }, "Parsed PR URL");

    // Fetch all PR data
    const [prDetails, commits, issueComments, reviewComments] = await Promise.all([
      this.githubClient.getPullRequest(owner, repo, pullNumber),
      this.githubClient.getCommits(owner, repo, pullNumber),
      this.githubClient.getIssueComments(owner, repo, pullNumber),
      this.githubClient.getReviewComments(owner, repo, pullNumber),
    ]);

    // Extract Meegle IDs
    const extractedIds = extractMeegleIds({
      title: prDetails.title,
      description: prDetails.body,
      commits: commits.map(c => ({ message: c.commit.message })),
      comments: [
        ...issueComments.map(c => ({ body: c.body })),
        ...reviewComments.map(c => ({ body: c.body })),
      ],
    });

    lookupLogger.info({ extractedIds }, "Extracted Meegle IDs");

    if (extractedIds.length === 0) {
      const error = new Error("No Meegle IDs found in PR");
      (error as Error & { code: string }).code = "NO_MEEGLE_ID_FOUND";
      throw error;
    }

    // Query Meegle
    const meegleWorkitems = await this.meegleClient.filterWorkitemsAcrossProjects({
      workItemIds: extractedIds,
      pageSize: 50,
    });

    // Map to result format
    const foundIds = new Set(meegleWorkitems.map(w => w.id));
    const notFound = extractedIds.filter(id => !foundIds.has(id));

    return {
      prInfo: {
        title: prDetails.title,
        description: prDetails.body,
        url: prDetails.html_url,
      },
      extractedIds,
      workitems: meegleWorkitems.map(w => ({
        id: w.id,
        name: w.name,
        type: w.workItemType?.name ?? "unknown",
        status: w.status?.name ?? "unknown",
        ...w,
      })),
      notFound,
    };
  }
}
```

### Step 3.5: Run tests to verify they pass

```bash
npm test -- src/controllers/github-reverse-lookup.test.ts
```

Expected: PASS

### Step 3.6: Commit

```bash
git add server/src/
git commit -m "feat(server): add GitHub reverse lookup controller

- Add workItemIds parameter to filterWorkitemsAcrossProjects
- Implement GitHubReverseLookupController
- Orchestrate PR fetch, ID extraction, and Meegle query"
```

---

## Task 4: Server - Create Route and Wire Everything

**Files:**
- Create: `server/src/routes/github-lookup.ts`
- Modify: `server/src/app.ts` (register route)

### Step 4.1: Create route

```typescript
// server/src/routes/github-lookup.ts
import { Router } from "express";
import { GitHubClient } from "../adapters/github/github-client.js";
import { GitHubReverseLookupController } from "../controllers/github-reverse-lookup.js";
import type { MeegleClient } from "../adapters/meegle/meegle-client.js";

export interface GitHubLookupRouteOptions {
  meegleClient: MeegleClient;
  githubToken: string;
}

export function createGitHubLookupRouter(options: GitHubLookupRouteOptions): Router {
  const router = Router();
  const githubClient = new GitHubClient({ token: options.githubToken });
  const controller = new GitHubReverseLookupController(githubClient, options.meegleClient);

  router.post("/lookup-meegle", async (req, res, next) => {
    try {
      const { prUrl } = req.body;

      if (!prUrl || typeof prUrl !== "string") {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_REQUEST", message: "prUrl is required" },
        });
      }

      const result = await controller.lookup(prUrl);
      res.json({ success: true, data: result });
    } catch (error) {
      const err = error as Error & { code?: string; status?: number };
      const code = err.code ?? "UNKNOWN_ERROR";
      const status = err.status ?? (code === "NO_MEEGLE_ID_FOUND" ? 404 : 500);

      res.status(status).json({
        success: false,
        error: { code, message: err.message },
      });
    }
  });

  return router;
}
```

### Step 4.2: Register route in app

```typescript
// Add to server/src/app.ts
import { createGitHubLookupRouter } from "./routes/github-lookup.js";

// In app setup, add:
if (process.env.GITHUB_TOKEN) {
  app.use("/api/github", createGitHubLookupRouter({
    meegleClient,
    githubToken: process.env.GITHUB_TOKEN,
  }));
}
```

### Step 4.3: Add environment variable documentation

```bash
# Add to server/.env.example
GITHUB_TOKEN=ghp_your_github_personal_access_token
```

### Step 4.4: Commit

```bash
git add server/src/routes/ server/src/app.ts server/.env.example
git commit -m "feat(server): add GitHub lookup route and wire dependencies

- Create /api/github/lookup-meegle endpoint
- Register route with GitHubClient and MeegleClient
- Add error handling for all error codes"
```

---

## Task 5: Extension - Add GitHub Platform Detection

**Files:**
- Modify: `extension/src/platform-url.ts`

### Step 5.1: Update platform-url.ts

```typescript
// Add to extension/src/platform-url.ts

export type SupportedPlatform = "meegle" | "lark" | "github" | "unsupported";

function isGitHubHost(hostname: string): boolean {
  return hostname === "github.com" || hostname.endsWith(".github.com");
}

export function getPageTypeFromUrl(url: string): SupportedPlatform {
  // ... existing code ...

  if (isGitHubHost(hostname)) {
    // Check if it's a PR page
    if (pathname.match(/\/[^/]+\/[^/]+\/pull\/\d+/)) {
      return "github";
    }
  }

  return "unsupported";
}
```

### Step 5.2: Update wxt.config.ts

```typescript
// Add to extension/wxt.config.ts manifest.host_permissions
host_permissions: [
  "http://localhost/*",
  "https://*.feishu.cn/*",
  "https://*.larksuite.com/*",
  "https://meegle.com/*",
  "https://*.meegle.com/*",
  "https://github.com/*",  // ADD THIS
],
```

### Step 5.3: Commit

```bash
git add extension/src/platform-url.ts extension/wxt.config.ts
git commit -m "feat(extension): add GitHub platform detection

- Detect github.com PR pages as supported platform
- Add github.com to host_permissions"
```

---

## Task 6: Extension - Create GitHub Lookup Controller

**Files:**
- Create: `extension/src/popup-shared/controllers/github-lookup.ts`

### Step 6.1: Implement GitHub lookup controller

```typescript
// extension/src/popup-shared/controllers/github-lookup.ts
import { createLazyFeatureController } from "./lazy-feature-controller.js";

export interface GitHubLookupState {
  isLoading: boolean;
  error: string | null;
  result: {
    extractedIds: string[];
    workitems: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      [key: string]: unknown;
    }>;
    notFound: string[];
  } | null;
}

export interface GitHubLookupController {
  getState(): GitHubLookupState;
  lookup(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export function createGitHubLookupController(serverUrl: string): GitHubLookupController {
  let state: GitHubLookupState = {
    isLoading: false,
    error: null,
    result: null,
  };

  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) {
      listener();
    }
  }

  function setState(newState: Partial<GitHubLookupState>) {
    state = { ...state, ...newState };
    notify();
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async lookup() {
      setState({ isLoading: true, error: null });

      try {
        // Get current tab URL
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) {
          throw new Error("No active tab found");
        }

        const response = await fetch(`${serverUrl}/api/github/lookup-meegle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prUrl: tab.url }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          const code = data.error?.code ?? "UNKNOWN_ERROR";
          const messages: Record<string, string> = {
            NO_MEEGLE_ID_FOUND: "未在 PR 中找到 Meegle 工作项 ID",
            INVALID_PR_URL: "无效的 GitHub PR URL",
            GITHUB_API_ERROR: "GitHub API 调用失败，请检查 Token 配置",
            MEEGLE_API_ERROR: "Meegle 查询失败，请稍后重试",
          };
          throw new Error(messages[code] ?? data.error?.message ?? "查询失败");
        }

        setState({
          isLoading: false,
          result: {
            extractedIds: data.data.extractedIds,
            workitems: data.data.workitems,
            notFound: data.data.notFound,
          },
        });
      } catch (error) {
        setState({
          isLoading: false,
          error: error instanceof Error ? error.message : "查询失败",
        });
      }
    },
  };
}

export const { lazyInit: lazyInitGitHubLookup } = createLazyFeatureController(createGitHubLookupController);
```

### Step 6.2: Commit

```bash
git add extension/src/popup-shared/controllers/github-lookup.ts
git commit -m "feat(extension): add GitHub lookup controller

- Create lazy-loaded controller for GitHub PR lookup
- Handle loading, error, and result states
- Map error codes to Chinese messages"
```

---

## Task 7: Extension - Update Popup Controller State

**Files:**
- Modify: `extension/src/popup-shared/popup-controller.ts`

### Step 7.1: Update PopupPageType

```typescript
// In extension/src/popup-shared/popup-controller.ts
// Update PopupPageType
export type PopupPageType = "meegle" | "lark" | "github" | "unsupported";
```

### Step 7.2: Add GitHub lookup state and actions

```typescript
// Add to PopupControllerState interface
export interface PopupControllerState {
  // ... existing fields ...
  githubLookup: GitHubLookupState;
}

// Add to actions returned by usePopupApp
export function usePopupApp() {
  // ... existing code ...
  return {
    // ... existing actions ...
    lookupGitHubPr: githubLookupController.lookup,
    clearGitHubLookup: () => {
      // Reset state
    },
  };
}
```

### Step 7.3: Add GitHub action to getState

```typescript
// In getState() method, add:
const githubActions: FeatureAction[] = state.pageType === "github"
  ? [
      {
        key: "github-lookup",
        label: "🔍 反查 Meegle 工作项",
        disabled: false,
      },
    ]
  : [];

return {
  // ... existing state ...
  githubActions,
  githubLookup: githubLookupController.getState(),
};
```

### Step 7.4: Commit

```bash
git add extension/src/popup-shared/popup-controller.ts
git commit -m "feat(extension): add GitHub lookup to popup controller

- Add 'github' to PopupPageType
- Integrate GitHubLookupController state and actions
- Add githubActions to getState return value"
```

---

## Task 8: Extension - Create GitHub Lookup Result Component

**Files:**
- Create: `extension/src/popup-react/components/GithubLookupResult.tsx`

### Step 8.1: Implement result component

```tsx
// extension/src/popup-react/components/GithubLookupResult.tsx
import type { GitHubLookupState } from "../../popup-shared/controllers/github-lookup.js";

interface GithubLookupResultProps {
  state: GitHubLookupState;
}

export function GithubLookupResult({ state }: GithubLookupResultProps) {
  if (state.isLoading) {
    return (
      <div className="github-lookup-loading">
        <div className="spinner" />
        <span>正在查询 Meegle...</span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="github-lookup-error">
        <span className="error-icon">⚠️</span>
        <span>{state.error}</span>
      </div>
    );
  }

  if (!state.result) {
    return null;
  }

  const { extractedIds, workitems, notFound } = state.result;

  return (
    <div className="github-lookup-result">
      <div className="extracted-ids">
        <h4>提取到 {extractedIds.length} 个 Meegle ID:</h4>
        <div className="id-list">{extractedIds.join(", ")}</div>
      </div>

      {workitems.length > 0 && (
        <div className="workitems-list">
          <h4>工作项详情:</h4>
          {workitems.map((item) => (
            <div key={item.id} className="workitem-card">
              <div className="workitem-header">
                <span className="workitem-type">{item.type}</span>
                <span className="workitem-id">#{item.id}</span>
              </div>
              <div className="workitem-name">{item.name}</div>
              <div className="workitem-status">
                <span className={`status-badge ${item.status}`}>{item.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {notFound.length > 0 && (
        <div className="not-found">
          <h4>未找到的工作项:</h4>
          <div className="id-list">{notFound.join(", ")}</div>
        </div>
      )}
    </div>
  );
}
```

### Step 8.2: Commit

```bash
git add extension/src/popup-react/components/GithubLookupResult.tsx
git commit -m "feat(extension): add GitHub lookup result component

- Display extracted IDs, workitem details, and not-found IDs
- Handle loading, error, and success states"
```

---

## Task 9: Extension - Update AutomationPage for GitHub

**Files:**
- Modify: `extension/src/popup-react/pages/AutomationPage.tsx`

### Step 9.1: Import and integrate GitHub components

```tsx
// Add imports
import type { GitHubLookupState } from "../../popup-shared/controllers/github-lookup.js";
import { GithubLookupResult } from "../components/GithubLookupResult.js";

// Update AutomationPageProps
type AutomationPageProps = Pick<
  PopupControllerState,
  "state" | "viewModel" | "larkActions" | "meegleActions" | "githubActions" | "githubLookup"
> & {
  onFeature: (key: string) => void | Promise<void>;
};

// Update component to render GitHub section
export function AutomationPage({
  state,
  viewModel,
  larkActions,
  meegleActions,
  githubActions,
  githubLookup,
  onFeature,
}: AutomationPageProps) {
  return (
    <div className="automation-page" data-test="automation-page">
      {viewModel.showUnsupported ? <UnsupportedPageView /> : null}
      
      {!viewModel.showUnsupported && state.pageType === "lark" ? (
        <FeatureActionsCard title="Lark 功能" actions={larkActions} onAction={onFeature} />
      ) : null}
      
      {!viewModel.showUnsupported && state.pageType === "meegle" ? (
        <FeatureActionsCard
          title="Meegle 功能"
          actions={meegleActions}
          onAction={onFeature}
        />
      ) : null}
      
      {!viewModel.showUnsupported && state.pageType === "github" ? (
        <>
          <FeatureActionsCard
            title="GitHub 功能"
            actions={githubActions}
            onAction={onFeature}
          />
          <GithubLookupResult state={githubLookup} />
        </>
      ) : null}
    </div>
  );
}
```

### Step 9.2: Commit

```bash
git add extension/src/popup-react/pages/AutomationPage.tsx
git commit -m "feat(extension): add GitHub support to AutomationPage

- Render GitHub feature actions card
- Display GitHubLookupResult component below actions
- Handle github pageType"
```

---

## Task 10: Extension - Update PopupAppView

**Files:**
- Modify: `extension/src/popup-react/PopupAppView.tsx`

### Step 10.1: Pass githubLookup state

```tsx
// In PopupAppView, pass githubLookup to AutomationPage
<AutomationPage
  state={state}
  viewModel={viewModel}
  larkActions={larkActions}
  meegleActions={meegleActions}
  githubActions={state.githubActions}
  githubLookup={state.githubLookup}
  onFeature={runFeatureAction}
/>
```

### Step 10.2: Commit

```bash
git add extension/src/popup-react/PopupAppView.tsx
git commit -m "feat(extension): wire GitHub lookup state in PopupAppView

- Pass githubActions and githubLookup to AutomationPage"
```

---

## Task 11: Manual Testing

### Step 11.1: Configure environment

```bash
# In server/.env
GITHUB_TOKEN=ghp_your_personal_access_token
```

### Step 11.2: Start server and extension

```bash
# Terminal 1: Start server
cd /home/uynil/projects/tw-itdog/server
npm run dev

# Terminal 2: Start extension
cd /home/uynil/projects/tw-itdog/extension
npm run dev
```

### Step 11.3: Test scenarios

1. **Open GitHub PR page** - Verify extension detects GitHub platform
2. **Click "反查 Meegle 工作项"** - Verify loading state
3. **Verify result display** - Shows extracted IDs and workitem details
4. **Test error cases**:
   - PR with no Meegle IDs → "未找到" message
   - Invalid GitHub Token → Error message
   - Network failure → Retry option

### Step 11.4: Final commit

```bash
git add .
git commit -m "test: manual testing complete for GitHub PR Meegle lookup

- Verified end-to-end flow from GitHub PR to Meegle workitem display
- Tested error handling for missing IDs and API failures"
```

---

## Spec Coverage Checklist

| Spec Requirement | Implementing Task |
|------------------|-------------------|
| Server-side GitHub API | Task 1, 3, 4 |
| Meegle ID extraction (4 formats) | Task 2 |
| Extract from commits, title, description, comments | Task 3 |
| Popup display with loading/error states | Task 6, 8, 9 |
| GitHub platform detection | Task 5 |
| Error handling (INVALID_PR_URL, GITHUB_API_ERROR, NO_MEEGLE_ID_FOUND) | Task 3, 4, 6 |

---

## Execution Choice

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-github-pr-meegle-lookup.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
