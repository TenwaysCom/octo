import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateDefaultBranchName,
  parseSystemValue,
  previewBranchCreate,
  executeBranchCreate,
} from "./github-branch-create.service.js";
import { GitHubClient } from "../../adapters/github/github-client.js";

vi.mock("../../application/services/meegle-client.factory.js", () => ({
  createMeegleClient: vi.fn(),
}));

vi.mock("../../application/services/meegle-credential.service.js", () => ({
  refreshCredential: vi.fn(),
}));

vi.mock("../../modules/meegle-auth/meegle-auth.service.js", () => ({
  getConfiguredMeegleAuthServiceDeps: vi.fn(() => ({
    authAdapter: {},
    tokenStore: { get: vi.fn() },
    meegleAuthBaseUrl: "https://project.larksuite.com",
  })),
}));

vi.mock("../../adapters/postgres/resolved-user-store.js", () => ({
  getResolvedUserStore: vi.fn(() => ({
    getById: vi.fn(() => Promise.resolve({ meegleUserKey: "test-user-key" })),
  })),
}));

import { createMeegleClient } from "../../application/services/meegle-client.factory.js";
import { refreshCredential } from "../../application/services/meegle-credential.service.js";

const mockCreateMeegleClient = vi.mocked(createMeegleClient);
const mockRefreshCredential = vi.mocked(refreshCredential);

describe("github-branch-create service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshCredential.mockResolvedValue({
      tokenStatus: "ready",
      userToken: "test-token",
      baseUrl: "https://project.larksuite.com",
    } as Awaited<ReturnType<typeof refreshCredential>>);
  });

  describe("parseSystemValue", () => {
    it("should parse cascade select JSON with parent and child", () => {
      const raw = JSON.stringify([
        { value: "cyvssley1", label: "Odoo" },
        { value: "ihib59zp4", label: "Odoo EU" },
      ]);
      const result = parseSystemValue(raw);
      expect(result).toEqual({ systemValue: "ihib59zp4", systemLabel: "Odoo EU" });
    });

    it("should return null for invalid JSON", () => {
      const result = parseSystemValue("not-json");
      expect(result).toBeNull();
    });

    it("should return null for empty array", () => {
      const result = parseSystemValue("[]");
      expect(result).toBeNull();
    });
  });

  describe("generateDefaultBranchName", () => {
    it("should generate feat branch with date for non-bug", () => {
      const name = generateDefaultBranchName("12345", "Add new feature", false);
      expect(name.startsWith("feat/")).toBe(true);
      expect(name.includes("m-12345")).toBe(true);
      expect(name.length).toBeLessThanOrEqual(50);
    });

    it("should generate fix branch with date for bug", () => {
      const name = generateDefaultBranchName("12345", "Fix crash bug", true);
      expect(name.startsWith("fix/")).toBe(true);
      expect(name.includes("m-12345")).toBe(true);
      expect(name.length).toBeLessThanOrEqual(50);
    });

    it("should include slug when title is short enough", () => {
      // Use a very short title so it fits within 30 chars
      const name = generateDefaultBranchName("1", "X", false);
      expect(name).toBe("feat/20260423-m-1-x");
      expect(name.length).toBeLessThanOrEqual(50);
    });

    it("should truncate long titles to 30 chars", () => {
      const longTitle = "This is a very long title that should be truncated properly";
      const name = generateDefaultBranchName("12345", longTitle, false);
      expect(name.length).toBeLessThanOrEqual(50);
    });

    it("should keep meaningful slug content for chinese titles", () => {
      const name = generateDefaultBranchName("8692984", "科目必录字段", false);
      expect(name.startsWith("feat/")).toBe(true);
      expect(name.includes("m-8692984")).toBe(true);
      expect(name).not.toBe("feat/20260424-m-8692984");
      expect(name.length).toBeLessThanOrEqual(50);
    });
  });

  describe("previewBranchCreate", () => {
    it("should return preview for production bug when system is the parent odoo option", async () => {
      mockCreateMeegleClient.mockResolvedValue({
        getWorkitemDetails: vi.fn(() =>
          Promise.resolve([
            {
              id: "11237978",
              key: "BUG-1",
              name: "Production bug",
              type: "production_bug",
              status: "Open",
              fields: {
                field_4976fc: "cyvssley1",
              },
            },
          ])
        ),
      } as unknown as Awaited<ReturnType<typeof createMeegleClient>>);

      const result = await previewBranchCreate({
        projectKey: "test",
        workItemTypeKey: "production_bug",
        workItemId: "11237978",
        masterUserId: "user-1",
        baseUrl: "https://project.larksuite.com",
      });

      expect(result.ok).toBe(true);
      expect(result.repo).toBe("TenwaysCom/Tenways");
      expect(result.systemValue).toBe("cyvssley1");
      expect(result.systemLabel).toBe("Odoo");
    });

    it("should prefer the child option when production bug returns a tree_select object", async () => {
      mockCreateMeegleClient.mockResolvedValue({
        getWorkitemDetails: vi.fn(() =>
          Promise.resolve([
            {
              id: "11237978",
              key: "BUG-2",
              name: "Production bug",
              type: "production_bug",
              status: "Open",
              fields: {
                field_4976fc: {
                  value: "cyvssley1",
                  label: "Odoo",
                  children: {
                    value: "76xrqgsmz",
                    label: "Odoo US",
                    children: null,
                  },
                },
              },
            },
          ])
        ),
      } as unknown as Awaited<ReturnType<typeof createMeegleClient>>);

      const result = await previewBranchCreate({
        projectKey: "test",
        workItemTypeKey: "production_bug",
        workItemId: "11237978",
        masterUserId: "user-1",
        baseUrl: "https://project.larksuite.com",
      });

      expect(result.ok).toBe(true);
      expect(result.repo).toBe("TWS-lance/odoo_tenways");
      expect(result.systemValue).toBe("76xrqgsmz");
      expect(result.systemLabel).toBe("Odoo US");
    });

    it("should return preview for story using the current system field key", async () => {
      mockCreateMeegleClient.mockResolvedValue({
        getWorkitemDetails: vi.fn(() =>
          Promise.resolve([
            {
              id: "12345",
              key: "TEST-123",
              name: "Test workitem",
              type: "story",
              status: "Open",
              fields: {
                field_0dba3a: JSON.stringify([
                  { value: "cyvssley1", label: "Odoo" },
                  { value: "ihib59zp4", label: "Odoo EU" },
                ]),
              },
            },
          ])
        ),
      } as unknown as Awaited<ReturnType<typeof createMeegleClient>>);

      const result = await previewBranchCreate({
        projectKey: "test",
        workItemTypeKey: "story",
        workItemId: "12345",
        masterUserId: "user-1",
        baseUrl: "https://project.larksuite.com",
      });

      expect(result.ok).toBe(true);
      expect(result.repo).toBe("TenwaysCom/Tenways");
      expect(result.systemValue).toBe("ihib59zp4");
      expect(result.systemLabel).toBe("Odoo EU");
    });

    it("should return preview for story using the new odoo us option id", async () => {
      mockCreateMeegleClient.mockResolvedValue({
        getWorkitemDetails: vi.fn(() =>
          Promise.resolve([
            {
              id: "8692984",
              key: "STORY-1",
              name: "Story workitem",
              type: "story",
              status: "Open",
              fields: {
                field_0dba3a: "8h79nr2_o",
              },
            },
          ])
        ),
      } as unknown as Awaited<ReturnType<typeof createMeegleClient>>);

      const result = await previewBranchCreate({
        projectKey: "test",
        workItemTypeKey: "story",
        workItemId: "8692984",
        masterUserId: "user-1",
        baseUrl: "https://project.larksuite.com",
      });

      expect(result.ok).toBe(true);
      expect(result.repo).toBe("TWS-lance/odoo_tenways");
      expect(result.systemValue).toBe("8h79nr2_o");
      expect(result.systemLabel).toBe("Odoo US");
    });

    it("should return preview for Odoo EU system", async () => {
      mockCreateMeegleClient.mockResolvedValue({
        getWorkitemDetails: vi.fn(() =>
          Promise.resolve([
            {
              id: "12345",
              key: "TEST-123",
              name: "Test workitem",
              type: "story",
              status: "Open",
              fields: {
                field_00f541: JSON.stringify([
                  { value: "cyvssley1", label: "Odoo" },
                  { value: "ihib59zp4", label: "Odoo EU" },
                ]),
              },
            },
          ])
        ),
      } as unknown as Awaited<ReturnType<typeof createMeegleClient>>);

      const result = await previewBranchCreate({
        projectKey: "test",
        workItemTypeKey: "story",
        workItemId: "12345",
        masterUserId: "user-1",
        baseUrl: "https://project.larksuite.com",
      });

      expect(result.ok).toBe(true);
      expect(result.repo).toBe("TenwaysCom/Tenways");
      expect(result.systemValue).toBe("ihib59zp4");
      expect(result.systemLabel).toBe("Odoo EU");
      expect(result.workItemTitle).toBe("Test workitem");
      expect(result.defaultBranchName.startsWith("feat/")).toBe(true);
    });

    it("should fall back from child to parent when the child option is not mapped", async () => {
      mockCreateMeegleClient.mockResolvedValue({
        getWorkitemDetails: vi.fn(() =>
          Promise.resolve([
            {
              id: "12345",
              key: "TEST-124",
              name: "Odoo workitem",
              type: "story",
              status: "Open",
              fields: {
                field_0dba3a: JSON.stringify([
                  { value: "cyvssley1", label: "Odoo" },
                  { value: "child-not-mapped", label: "Odoo Unknown Child" },
                ]),
              },
            },
          ])
        ),
      } as unknown as Awaited<ReturnType<typeof createMeegleClient>>);

      const result = await previewBranchCreate({
        projectKey: "test",
        workItemTypeKey: "story",
        workItemId: "12345",
        masterUserId: "user-1",
        baseUrl: "https://project.larksuite.com",
      });

      expect(result.ok).toBe(true);
      expect(result.repo).toBe("TenwaysCom/Tenways");
      expect(result.systemValue).toBe("cyvssley1");
      expect(result.systemLabel).toBe("Odoo");
    });

    it("should throw for unsupported system", async () => {
      mockCreateMeegleClient.mockResolvedValue({
        getWorkitemDetails: vi.fn(() =>
          Promise.resolve([
            {
              id: "12345",
              key: "TEST-123",
              name: "Test workitem",
              type: "story",
              status: "Open",
              fields: {
                field_00f541: JSON.stringify([
                  { value: "unknown", label: "Unknown System" },
                ]),
              },
            },
          ])
        ),
      } as unknown as Awaited<ReturnType<typeof createMeegleClient>>);

      await expect(
        previewBranchCreate({
          projectKey: "test",
          workItemTypeKey: "story",
          workItemId: "12345",
          masterUserId: "user-1",
          baseUrl: "https://project.larksuite.com",
        })
      ).rejects.toThrow("暂无对应的 GitHub 仓库");
    });

    it("should throw when System field is missing", async () => {
      mockCreateMeegleClient.mockResolvedValue({
        getWorkitemDetails: vi.fn(() =>
          Promise.resolve([
            {
              id: "12345",
              key: "TEST-123",
              name: "Test workitem",
              type: "story",
              status: "Open",
              fields: {},
            },
          ])
        ),
      } as unknown as Awaited<ReturnType<typeof createMeegleClient>>);

      await expect(
        previewBranchCreate({
          projectKey: "test",
          workItemTypeKey: "story",
          workItemId: "12345",
          masterUserId: "user-1",
          baseUrl: "https://project.larksuite.com",
        })
      ).rejects.toThrow("未设置 System 字段");
    });
  });

  describe("executeBranchCreate", () => {
    it("should create branch after preview", async () => {
      mockCreateMeegleClient.mockResolvedValue({
        getWorkitemDetails: vi.fn(() =>
          Promise.resolve([
            {
              id: "12345",
              key: "TEST-123",
              name: "Test workitem",
              type: "story",
              status: "Open",
              fields: {
                field_00f541: JSON.stringify([
                  { value: "cyvssley1", label: "Odoo" },
                  { value: "ihib59zp4", label: "Odoo EU" },
                ]),
              },
            },
          ])
        ),
      } as unknown as Awaited<ReturnType<typeof createMeegleClient>>);

      const mockGithubClient = {
        createBranch: vi.fn(() =>
          Promise.resolve({
            ref: "refs/heads/feat/20260101-m-12345-test",
            object: { sha: "abc", type: "commit", url: "" },
          })
        ),
      } as unknown as GitHubClient;

      const result = await executeBranchCreate(
        {
          projectKey: "test",
          workItemTypeKey: "story",
          workItemId: "12345",
          masterUserId: "user-1",
          baseUrl: "https://project.larksuite.com",
          branchName: "feat/20260101-m-12345-test",
        },
        { githubClient: mockGithubClient }
      );

      expect(result.ok).toBe(true);
      expect(result.repo).toBe("TenwaysCom/Tenways");
      expect(result.branchName).toBe("feat/20260101-m-12345-test");
      expect(result.branchUrl).toBe("https://github.com/TenwaysCom/Tenways/tree/feat/20260101-m-12345-test");
    });

    it("should throw when github client is not configured", async () => {
      mockCreateMeegleClient.mockResolvedValue({
        getWorkitemDetails: vi.fn(() =>
          Promise.resolve([
            {
              id: "12345",
              key: "TEST-123",
              name: "Test workitem",
              type: "story",
              status: "Open",
              fields: {
                field_00f541: JSON.stringify([
                  { value: "cyvssley1", label: "Odoo" },
                  { value: "ihib59zp4", label: "Odoo EU" },
                ]),
              },
            },
          ])
        ),
      } as unknown as Awaited<ReturnType<typeof createMeegleClient>>);

      await expect(
        executeBranchCreate({
          projectKey: "test",
          workItemTypeKey: "story",
          workItemId: "12345",
          masterUserId: "user-1",
          baseUrl: "https://project.larksuite.com",
          branchName: "feat/test",
        })
      ).rejects.toThrow("GitHub client is not configured");
    });
  });
});
