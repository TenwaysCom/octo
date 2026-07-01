import type { MeegleClient } from "../../adapters/meegle/meegle-client.js";
import { KimiAcpRuntimeError } from "../../adapters/kimi-acp/kimi-acp-runtime.js";
import {
  createStoryAcpLimiter,
  executeMeegleStoryPrdToSimplified,
} from "./meegle-story-prd-to-simplified.service.js";

describe("meegle story PRD to simplified service", () => {
  it("reads Story Summary, runs Kimi ACP, and overwrites Tech Summary", async () => {
    const updateWorkitem = vi.fn().mockResolvedValue({
      id: "123456",
      key: "STORY-1",
      name: "Story title",
      type: "story",
      status: "open",
      fields: {},
    });
    const client = {
      getWorkitemDetails: vi.fn().mockResolvedValue([
        {
          id: "123456",
          key: "STORY-1",
          name: "Story title",
          type: "story",
          status: "open",
          fields: {
            fields: [
              {
                field_key: "field_e67b43",
                field_value: "Need a clearer checkout flow",
              },
            ],
          },
        },
      ]),
      updateWorkitem,
    } as unknown as MeegleClient;
    const acpService = {
      assertSessionAccess: vi.fn(),
      chatOneShot: vi.fn(async (_input, emit) => {
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "sess_1",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: "### A1. 需求概述\n简化内容",
              },
            },
          },
        });
        emit({
          event: "done",
          data: {
            sessionId: "sess_1",
            stopReason: "end_turn",
          },
        });
      }),
      chat: vi.fn(),
    };

    const result = await executeMeegleStoryPrdToSimplified(
      {
        projectKey: "OPS",
        workItemTypeKey: "story",
        workItemId: "123456",
        masterUserId: "usr_1",
        baseUrl: "https://project.larksuite.com",
        actionRunId: "run_1",
      },
      {
        resolvedUserStore: {
          getById: vi.fn().mockResolvedValue({
            id: "usr_1",
            status: "active",
            larkTenantKey: "tenant_1",
            larkId: "ou_1",
            larkEmail: null,
            larkName: null,
            larkAvatarUrl: null,
            meegleBaseUrl: "https://project.larksuite.com",
            meegleUserKey: "meegle_1",
            githubId: null,
            role: null,
            createdAt: "2026-06-18T00:00:00.000Z",
            updatedAt: "2026-06-18T00:00:00.000Z",
          }),
          getByLarkId: vi.fn(),
          getByLarkIdentity: vi.fn(),
          getByMeegleIdentity: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        refreshCredential: vi.fn().mockResolvedValue({
          tokenStatus: "ready",
          userToken: "token_1",
        }),
        createMeegleClient: vi.fn().mockResolvedValue(client),
        workflowPromptStore: {
          getByKey: vi.fn().mockResolvedValue({
            key: "meegle.story.prd_to_simplified",
            prompt: "自定义研发Review\n标题={{storyTitle}}\n需求={{storySummary}}",
            note: "test prompt",
            createdAt: "2026-06-18T00:00:00.000Z",
            updatedAt: "2026-06-18T00:00:00.000Z",
          }),
          upsert: vi.fn(),
        },
        acpService,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.updatedField).toBe("techSummary");
      expect(result.data.analysisSummary).toContain("简化内容");
    }
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorLarkId: "ou_1",
        message: expect.stringContaining("自定义研发Review"),
      }),
      expect.any(Function),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorLarkId: "ou_1",
        message: expect.stringContaining("Need a clearer checkout flow"),
      }),
      expect.any(Function),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(acpService.chat).not.toHaveBeenCalled();
    expect(updateWorkitem).toHaveBeenCalledWith(
      "OPS",
      "story",
      "123456",
      [
        {
          fieldKey: "field_44d048",
          fieldValue: "### A1. 需求概述\n简化内容",
        },
      ],
    );
  });

  it("rejects non-story workitems before calling ACP", async () => {
    const acpService = {
      assertSessionAccess: vi.fn(),
      chatOneShot: vi.fn(),
      chat: vi.fn(),
    };

    const result = await executeMeegleStoryPrdToSimplified(
      {
        projectKey: "OPS",
        workItemTypeKey: "issue",
        workItemId: "123456",
        masterUserId: "usr_1",
        baseUrl: "https://project.larksuite.com",
      },
      {
        acpService,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.errorCode).toBe("MEEGLE_STORY_TYPE_UNSUPPORTED");
    }
    expect(acpService.chatOneShot).not.toHaveBeenCalled();
    expect(acpService.chat).not.toHaveBeenCalled();
  });

  it("returns ACP initialize timeout errors without updating Tech Summary", async () => {
    const updateWorkitem = vi.fn();
    const client = {
      getWorkitemDetails: vi.fn().mockResolvedValue([
        {
          id: "123456",
          key: "STORY-1",
          name: "Story title",
          type: "story",
          status: "open",
          fields: {
            fields: [
              {
                field_key: "field_e67b43",
                field_value: "Need a clearer checkout flow",
              },
            ],
          },
        },
      ]),
      updateWorkitem,
    } as unknown as MeegleClient;
    const acpService = {
      assertSessionAccess: vi.fn(),
      chatOneShot: vi.fn(async () => {
        throw new KimiAcpRuntimeError(
          "ACP_INITIALIZE_TIMEOUT",
          "adapter.acp.initialize",
          "Kimi ACP initialize timed out after 25ms.",
        );
      }),
      chat: vi.fn(),
    };

    const result = await executeMeegleStoryPrdToSimplified(
      {
        projectKey: "OPS",
        workItemTypeKey: "story",
        workItemId: "123456",
        masterUserId: "usr_1",
        baseUrl: "https://project.larksuite.com",
        actionRunId: "run_1",
      },
      {
        resolvedUserStore: {
          getById: vi.fn().mockResolvedValue({
            id: "usr_1",
            status: "active",
            larkTenantKey: "tenant_1",
            larkId: "ou_1",
            larkEmail: null,
            larkName: null,
            larkAvatarUrl: null,
            meegleBaseUrl: "https://project.larksuite.com",
            meegleUserKey: "meegle_1",
            githubId: null,
            role: null,
            createdAt: "2026-06-18T00:00:00.000Z",
            updatedAt: "2026-06-18T00:00:00.000Z",
          }),
          getByLarkId: vi.fn(),
          getByLarkIdentity: vi.fn(),
          getByMeegleIdentity: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        refreshCredential: vi.fn().mockResolvedValue({
          tokenStatus: "ready",
          userToken: "token_1",
        }),
        createMeegleClient: vi.fn().mockResolvedValue(client),
        workflowPromptStore: {
          getByKey: vi.fn().mockResolvedValue(undefined),
          upsert: vi.fn(),
        },
        acpService,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        layer: "adapter",
        stage: "adapter.acp.initialize",
        errorCode: "ACP_INITIALIZE_TIMEOUT",
        actionRunId: "run_1",
      });
    }
    expect(updateWorkitem).not.toHaveBeenCalled();
  });

  it("returns concurrency limited errors without calling ACP or updating Tech Summary", async () => {
    const updateWorkitem = vi.fn();
    const client = {
      getWorkitemDetails: vi.fn().mockResolvedValue([
        {
          id: "123456",
          key: "STORY-1",
          name: "Story title",
          type: "story",
          status: "open",
          fields: {
            fields: [
              {
                field_key: "field_e67b43",
                field_value: "Need a clearer checkout flow",
              },
            ],
          },
        },
      ]),
      updateWorkitem,
    } as unknown as MeegleClient;
    const acpService = {
      assertSessionAccess: vi.fn(),
      chatOneShot: vi.fn(),
      chat: vi.fn(),
    };

    const result = await executeMeegleStoryPrdToSimplified(
      {
        projectKey: "OPS",
        workItemTypeKey: "story",
        workItemId: "123456",
        masterUserId: "usr_1",
        baseUrl: "https://project.larksuite.com",
        actionRunId: "run_limited",
      },
      {
        resolvedUserStore: {
          getById: vi.fn().mockResolvedValue({
            id: "usr_1",
            status: "active",
            larkTenantKey: "tenant_1",
            larkId: "ou_1",
            larkEmail: null,
            larkName: null,
            larkAvatarUrl: null,
            meegleBaseUrl: "https://project.larksuite.com",
            meegleUserKey: "meegle_1",
            githubId: null,
            role: null,
            createdAt: "2026-06-18T00:00:00.000Z",
            updatedAt: "2026-06-18T00:00:00.000Z",
          }),
          getByLarkId: vi.fn(),
          getByLarkIdentity: vi.fn(),
          getByMeegleIdentity: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        refreshCredential: vi.fn().mockResolvedValue({
          tokenStatus: "ready",
          userToken: "token_1",
        }),
        createMeegleClient: vi.fn().mockResolvedValue(client),
        workflowPromptStore: {
          getByKey: vi.fn().mockResolvedValue(undefined),
          upsert: vi.fn(),
        },
        acpService,
        acpLimiter: createStoryAcpLimiter({
          limit: 0,
        }),
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        layer: "adapter",
        stage: "adapter.acp.queue",
        errorCode: "ACP_CONCURRENCY_LIMITED",
        actionRunId: "run_limited",
      });
    }
    expect(acpService.chatOneShot).not.toHaveBeenCalled();
    expect(acpService.chat).not.toHaveBeenCalled();
    expect(updateWorkitem).not.toHaveBeenCalled();
  });

  it("rejects a second story ACP task while the concurrency slot is occupied", async () => {
    const limiter = createStoryAcpLimiter({
      limit: 1,
    });
    let releaseFirstTask!: () => void;
    const firstTask = limiter.run(
      () =>
        new Promise<string>((resolve) => {
          releaseFirstTask = () => resolve("first done");
        }),
    );

    await expect(limiter.run(async () => "second done")).rejects.toMatchObject({
      name: "StoryAcpConcurrencyLimitError",
      code: "ACP_CONCURRENCY_LIMITED",
      stage: "adapter.acp.queue",
    });

    releaseFirstTask();
    await expect(firstTask).resolves.toBe("first done");
    await expect(limiter.run(async () => "third done")).resolves.toBe("third done");
  });
});
