import { describe, expect, it, vi } from "vitest";
import {
  executeGitHubPrReview,
  submitGitHubPrReview,
} from "./github-pr-review.service.js";

describe("github PR review service", () => {
  it("reviews changed Odoo code with the database prompt and writes the result to the PR", async () => {
    const githubClient = {
      parsePrUrl: vi.fn(() => ({ owner: "TenwaysCom", repo: "Tenways", pullNumber: 1036 })),
      getPullRequest: vi.fn(async () => ({
        title: "[TW-1] Fix sale flow",
        body: "Fix the flow",
        html_url: "https://github.com/TenwaysCom/Tenways/pull/1036",
      })),
      getPullRequestFiles: vi.fn(async () => [
        { filename: "Tenways/tw_sale/models/sale_order.py", status: "modified", additions: 1, deletions: 0, changes: 1, patch: "+    return super().write(vals)" },
        { filename: "Tenways/tw_sale/i18n/zh_CN.po", status: "modified", additions: 1, deletions: 0, changes: 1, patch: "+translation" },
      ]),
      createPullRequestComment: vi.fn(async () => ({ id: 1, html_url: "https://github.com/Tenways/Tenways/pull/1036#issuecomment-1" })),
    };
    const workflowPromptStore = {
      getByKey: vi.fn(async () => ({
        key: "github.pr.quick_scan",
        prompt: "Review {{pr_url}}\n{{pr_diff}}",
        note: null,
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
      })),
      upsert: vi.fn(),
    };
    const acpService = {
      chatOneShot: vi.fn(async (_input, emit) => {
        emit({
          event: "acp.session.update",
          data: { sessionId: "sess_1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "## 风险汇总\n无 ISSUE" } } },
        });
      }),
    };

    const result = await executeGitHubPrReview({
      prUrl: "https://github.com/TenwaysCom/Tenways/pull/1036",
      masterUserId: "usr_1",
      actionRunId: "run_1",
      operation: "github.pr.quick_scan",
    }, {
      githubClient: githubClient as never,
      resolvedUserStore: { getById: vi.fn(async () => ({ larkId: "ou_1" })) } as never,
      workflowPromptStore,
      acpService: acpService as never,
      euOdooGuideRoot: "/guides/eu-odoo",
      validateEuOdooGuideRoot: vi.fn(async () => {}),
    });

    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({ operatorLarkId: "ou_1", message: expect.stringContaining("sale_order.py") }),
      expect.any(Function),
    );
    expect(acpService.chatOneShot.mock.calls[0]?.[0].message).toContain(
      "在审查此 PR 前，必须读取并遵循以下目录中的指南文档：/guides/eu-odoo",
    );
    expect(acpService.chatOneShot.mock.calls[0]?.[0].message).not.toContain("zh_CN.po");
    expect(githubClient.createPullRequestComment).toHaveBeenCalledWith(
      "TenwaysCom", "Tenways", 1036, expect.stringContaining("## Octo Quick scan"),
    );
    expect(result).toMatchObject({ ok: true, data: { commentUrl: expect.stringContaining("issuecomment") } });
  });

  it("queues a review and persists its completed status without blocking the caller", async () => {
    const runs = new Map<string, Record<string, unknown>>();
    const reviewRunStore = {
      get: vi.fn(async (actionRunId: string) => runs.get(actionRunId)),
      create: vi.fn(async (input: Record<string, unknown>) => {
        const run = {
          ...input,
          status: "queued",
          commentUrl: null,
          reviewedFiles: [],
          diffTruncated: null,
          errorCode: null,
          errorMessage: null,
          createdAt: "2026-07-14T00:00:00.000Z",
          startedAt: null,
          completedAt: null,
          updatedAt: "2026-07-14T00:00:00.000Z",
        };
        runs.set(String(input.actionRunId), run);
        return run;
      }),
      markRunning: vi.fn(async (actionRunId: string) => {
        Object.assign(runs.get(actionRunId)!, { status: "running" });
      }),
      markSucceeded: vi.fn(async (input: Record<string, unknown>) => {
        Object.assign(runs.get(String(input.actionRunId))!, { status: "succeeded", ...input });
      }),
      markFailed: vi.fn(),
    };
    const githubClient = {
      parsePrUrl: vi.fn(() => ({ owner: "TenwaysCom", repo: "Tenways", pullNumber: 1036 })),
      getPullRequest: vi.fn(async () => ({ title: "Review", body: "", html_url: "https://github.com/TenwaysCom/Tenways/pull/1036" })),
      getPullRequestFiles: vi.fn(async () => [{ filename: "Tenways/tw_sale/models/sale_order.py", patch: "+x" }]),
      createPullRequestComment: vi.fn(async () => ({ html_url: "https://github.com/TenwaysCom/Tenways/pull/1036#comment" })),
    };
    const response = await submitGitHubPrReview({
      prUrl: "https://github.com/TenwaysCom/Tenways/pull/1036",
      masterUserId: "usr_1",
      actionRunId: "queued_run",
      operation: "github.pr.quick_scan",
    }, {
      githubClient: githubClient as never,
      reviewRunStore: reviewRunStore as never,
      resolvedUserStore: { getById: vi.fn(async () => ({ larkId: "ou_1" })) } as never,
      workflowPromptStore: { getByKey: vi.fn(async () => ({ prompt: "{{pr_diff}}" })) } as never,
      acpService: { chatOneShot: vi.fn(async (_input, emit) => emit({ event: "acp.session.update", data: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "review" } } } })) } as never,
      euOdooGuideRoot: "/guides/eu-odoo",
      validateEuOdooGuideRoot: vi.fn(async () => {}),
    });

    expect(response).toEqual({ ok: true, data: { actionRunId: "queued_run", status: "queued" } });
    await vi.waitFor(() => expect(reviewRunStore.markSucceeded).toHaveBeenCalledWith(expect.objectContaining({ actionRunId: "queued_run" })));
    expect(runs.get("queued_run")).toMatchObject({ status: "succeeded" });
  });

  it("stops before reading the PR when the configured EU Odoo guide is unavailable", async () => {
    const githubClient = {
      parsePrUrl: vi.fn(() => ({ owner: "TenwaysCom", repo: "Tenways", pullNumber: 1036 })),
      getPullRequest: vi.fn(),
      getPullRequestFiles: vi.fn(),
      createPullRequestComment: vi.fn(),
    };
    const acpService = { chatOneShot: vi.fn() };

    await expect(executeGitHubPrReview({
      prUrl: "https://github.com/TenwaysCom/Tenways/pull/1036",
      masterUserId: "usr_1",
      operation: "github.pr.quick_scan",
    }, {
      githubClient: githubClient as never,
      resolvedUserStore: { getById: vi.fn(async () => ({ larkId: "ou_1" })) } as never,
      acpService: acpService as never,
      euOdooGuideRoot: "/guides/eu-odoo",
      validateEuOdooGuideRoot: vi.fn(async () => {
        throw new Error("EU_ODOO_GUIDE_ROOT_UNAVAILABLE: permission denied");
      }),
    })).rejects.toThrow("EU_ODOO_GUIDE_ROOT_UNAVAILABLE");

    expect(githubClient.getPullRequest).not.toHaveBeenCalled();
    expect(acpService.chatOneShot).not.toHaveBeenCalled();
    expect(githubClient.createPullRequestComment).not.toHaveBeenCalled();
  });
});
