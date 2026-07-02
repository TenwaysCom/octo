import type { MeegleClient } from "../../adapters/meegle/meegle-client.js";
import {
  createBugAcpLimiter,
  executeLarkBugAnalyze,
} from "./lark-bug-analyze.service.js";

function createResolvedUserStore() {
  return {
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
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    }),
    getByLarkId: vi.fn(),
    getByLarkIdentity: vi.fn(),
    getByMeegleIdentity: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
}

describe("meegle production bug analyze service", () => {
  it("requires a real Lark Base record id before reading or updating record fields", async () => {
    const result = await executeLarkBugAnalyze(
      {
        baseId: "base_1",
        tableId: "tbl_1",
        viewId: "vew_1",
        masterUserId: "usr_1",
        baseUrl: "https://nsghpcq7ar4z.sg.larksuite.com",
        actionRunId: "run_missing_record",
      },
      {
        resolvedUserStore: createResolvedUserStore(),
        createLarkClient: vi.fn(),
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.errorCode).toBe("LARK_RECORD_ID_REQUIRED");
      expect(result.error.stage).toBe("server.action.received");
      expect(result.error.actionRunId).toBe("run_missing_record");
    }
  });

  it("reads bug description plus root and first 50 thread messages from Lark Message Link", async () => {
    const getRecord = vi.fn().mockResolvedValue({
      record_id: "rec_1",
      fields: {
        bug_description: "Record fallback bug description",
        "Details Description": "Existing record details",
        "Lark Message Link": "https://applink.larksuite.com/client/thread/open?threadid=thread_1&chatid=chat_1",
      },
    });
    const getThreadMessages = vi.fn().mockResolvedValue({
      items: [
        ...Array.from({ length: 50 }, (_item, index) => ({
          message_id: `om_${index + 1}`,
          root_id: "om_root",
          content: JSON.stringify({ text: `Thread reply ${index + 1}` }),
        })),
        {
          message_id: "om_51",
          root_id: "om_root",
          content: JSON.stringify({ text: "Thread reply 51 should be truncated" }),
        },
      ],
      hasMore: false,
    });
    const getMessage = vi.fn().mockResolvedValue({
      message_id: "thread_1",
      content: JSON.stringify({ text: "Thread root message itself" }),
    });
    const updateRecord = vi.fn().mockResolvedValue({
      record_id: "rec_1",
      fields: {},
    });
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
                text: "### A1. Bug 概述\nLark message analysis",
              },
            },
          },
        });
      }),
      chat: vi.fn(),
    };

    const result = await executeLarkBugAnalyze(
      {
        baseId: "base_1",
        tableId: "tbl_1",
        recordId: "rec_1",
        masterUserId: "usr_1",
        baseUrl: "https://nsghpcq7ar4z.sg.larksuite.com",
        actionRunId: "run_lark_message",
      },
      {
        resolvedUserStore: createResolvedUserStore(),
        getLarkTokenStore: () => ({
          get: vi.fn().mockResolvedValue({
            masterUserId: "usr_1",
            tenantKey: "tenant_1",
            larkUserId: "ou_1",
            baseUrl: "https://open.larksuite.com",
            userToken: "lark_token",
            userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            credentialStatus: "active",
          }),
          save: vi.fn(),
          delete: vi.fn(),
        }),
        createLarkClient: vi.fn(() => ({
          getRecord,
          getMessage,
          getThreadMessages,
          updateRecord,
        }) as never),
        workflowPromptStore: {
          getByKey: vi.fn().mockResolvedValue({
            key: "lark.bug.analyze",
            prompt: "分析 Lark Bug\nbug={{bug_description}}",
            note: "test prompt",
            createdAt: "2026-06-30T00:00:00.000Z",
            updatedAt: "2026-06-30T00:00:00.000Z",
          }),
          upsert: vi.fn(),
        },
        acpService,
      },
    );

    expect(result.ok).toBe(true);
    expect(getMessage).toHaveBeenCalledWith("thread_1");
    expect(getThreadMessages).toHaveBeenCalledWith("thread_1");
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Thread root message itself"),
      }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Thread reply 1"),
      }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Thread reply 50"),
      }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.not.stringContaining("Thread reply 51 should be truncated"),
      }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.not.stringContaining("Record fallback bug description"),
      }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(updateRecord).toHaveBeenCalledWith(
      "base_1",
      "tbl_1",
      "rec_1",
      {
        "Details Description": "Existing record details\n\n### Bug 分析\n### A1. Bug 概述\nLark message analysis",
      },
    );
  });

  it("uses Issue Description instead of the Lark record bug_description field for prompt bug_description", async () => {
    const getRecord = vi.fn().mockResolvedValue({
      record_id: "rec_1",
      fields: {
        bug_description: "Legacy bug_description should not be used",
        "Issue Description": "Issue Description bug text",
        "Details Description": "Existing details",
      },
    });
    const updateRecord = vi.fn().mockResolvedValue({
      record_id: "rec_1",
      fields: {},
    });
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
                text: "### A1. Bug 概述\nIssue description analysis",
              },
            },
          },
        });
      }),
      chat: vi.fn(),
    };

    const result = await executeLarkBugAnalyze(
      {
        baseId: "base_1",
        tableId: "tbl_1",
        recordId: "rec_1",
        masterUserId: "usr_1",
        baseUrl: "https://nsghpcq7ar4z.sg.larksuite.com",
        actionRunId: "run_lark_issue",
      },
      {
        resolvedUserStore: createResolvedUserStore(),
        getLarkTokenStore: () => ({
          get: vi.fn().mockResolvedValue({
            masterUserId: "usr_1",
            tenantKey: "tenant_1",
            larkUserId: "ou_1",
            baseUrl: "https://open.larksuite.com",
            userToken: "lark_token",
            userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            credentialStatus: "active",
          }),
          save: vi.fn(),
          delete: vi.fn(),
        }),
        createLarkClient: vi.fn(() => ({ getRecord, updateRecord }) as never),
        workflowPromptStore: {
          getByKey: vi.fn().mockResolvedValue({
            key: "lark.bug.analyze",
            prompt: "分析 Lark Bug\nbug={{bug_description}}",
            note: "test prompt",
            createdAt: "2026-06-30T00:00:00.000Z",
            updatedAt: "2026-06-30T00:00:00.000Z",
          }),
          upsert: vi.fn(),
        },
        acpService,
      },
    );

    expect(result.ok).toBe(true);
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Issue Description bug text"),
      }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.not.stringContaining("Legacy bug_description should not be used"),
      }),
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("analyzes a Lark record without writing Meegle fields and appends Lark details", async () => {
    const updateRecord = vi.fn().mockResolvedValue({
      record_id: "rec_1",
      fields: {},
    });
    const getRecord = vi.fn().mockResolvedValue({
      record_id: "rec_1",
      fields: {
        "Issue Description": "Checkout fails after selecting a coupon",
        "Details Description": "Existing details",
        "Issue 类型": "Production Bug",
        Priority: "P0",
      },
    });
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
                text: "### A1. Bug 概述\nLark bug analysis",
              },
            },
          },
        });
      }),
      chat: vi.fn(),
    };
    const createMeegleClient = vi.fn();

    const result = await executeLarkBugAnalyze(
      {
        baseId: "base_1",
        tableId: "tbl_1",
        recordId: "rec_1",
        masterUserId: "usr_1",
        baseUrl: "https://nsghpcq7ar4z.sg.larksuite.com",
        actionRunId: "run_lark",
      },
      {
        resolvedUserStore: createResolvedUserStore(),
        getLarkTokenStore: () => ({
          get: vi.fn().mockResolvedValue({
            masterUserId: "usr_1",
            tenantKey: "tenant_1",
            larkUserId: "ou_1",
            baseUrl: "https://open.larksuite.com",
            userToken: "lark_token",
            userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            credentialStatus: "active",
          }),
          save: vi.fn(),
          delete: vi.fn(),
        }),
        createLarkClient: vi.fn(() => ({ getRecord, updateRecord }) as never),
        createMeegleClient,
        workflowPromptStore: {
          getByKey: vi.fn().mockResolvedValue({
            key: "lark.bug.analyze",
            prompt: "分析 Lark Bug\n标题={{bugTitle}}\n字段={{bugFields}}",
            note: "test prompt",
            createdAt: "2026-06-30T00:00:00.000Z",
            updatedAt: "2026-06-30T00:00:00.000Z",
          }),
          upsert: vi.fn(),
        },
        acpService,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.workItemTypeKey).toBe("lark_record");
      expect(result.data.updatedField).toBe("Details Description");
      expect(result.data.analysisSummary).toContain("Lark bug analysis");
    }
    expect(getRecord).toHaveBeenCalledWith("base_1", "tbl_1", "rec_1");
    expect(updateRecord).toHaveBeenCalledWith(
      "base_1",
      "tbl_1",
      "rec_1",
      {
        "Details Description": "Existing details\n\n### Bug 分析\n### A1. Bug 概述\nLark bug analysis",
      },
    );
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorLarkId: "ou_1",
        message: expect.stringContaining("Checkout fails after selecting a coupon"),
      }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(createMeegleClient).not.toHaveBeenCalled();
  });

  it("reads a Production Bug, runs Kimi ACP, and writes the analysis summary", async () => {
    const updateWorkitem = vi.fn().mockResolvedValue({
      id: "123456",
      key: "BUG-1",
      name: "Checkout fails",
      type: "production_bug",
      status: "open",
      fields: {},
    });
    const client = {
      getWorkitemDetails: vi.fn().mockResolvedValue([
        {
          id: "123456",
          key: "BUG-1",
          name: "Checkout fails",
          type: "production_bug",
          status: "open",
          fields: {
            description: "User cannot pay after selecting a coupon",
            fields: [
              {
                field_key: "priority",
                field_name: "Priority",
                field_value: { name: "High" },
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
                text: "### A1. Bug 概述\n支付失败分析",
              },
            },
          },
        });
      }),
      chat: vi.fn(),
    };

    const result = await executeLarkBugAnalyze(
      {
        projectKey: "OPS",
        workItemTypeKey: "production_bug",
        workItemId: "123456",
        masterUserId: "usr_1",
        baseUrl: "https://project.larksuite.com",
        actionRunId: "run_1",
      },
      {
        resolvedUserStore: createResolvedUserStore(),
        refreshCredential: vi.fn().mockResolvedValue({
          tokenStatus: "ready",
          userToken: "token_1",
        }),
        createMeegleClient: vi.fn().mockResolvedValue(client),
        workflowPromptStore: {
          getByKey: vi.fn().mockResolvedValue({
            key: "lark.bug.analyze",
            prompt: "自定义 Bug 分析\n标题={{bugTitle}}\n字段={{bugFields}}",
            note: "test prompt",
            createdAt: "2026-06-30T00:00:00.000Z",
            updatedAt: "2026-06-30T00:00:00.000Z",
          }),
          upsert: vi.fn(),
        },
        acpService,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.updatedField).toBe("analysisSummary");
      expect(result.data.analysisSummary).toContain("支付失败分析");
    }
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorLarkId: "ou_1",
        message: expect.stringContaining("自定义 Bug 分析"),
      }),
      expect.any(Function),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(acpService.chatOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("User cannot pay after selecting a coupon"),
      }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(updateWorkitem).toHaveBeenCalledWith(
      "OPS",
      "6932e40429d1cd8aac635c82",
      "123456",
      [
        {
          fieldKey: "field_c22a1a",
          fieldValue: "### A1. Bug 概述\n支付失败分析",
        },
      ],
    );
  });

  it("rejects non-production bug workitems before calling ACP", async () => {
    const acpService = {
      assertSessionAccess: vi.fn(),
      chatOneShot: vi.fn(),
      chat: vi.fn(),
    };

    const result = await executeLarkBugAnalyze(
      {
        projectKey: "OPS",
        workItemTypeKey: "story",
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
      expect(result.error.errorCode).toBe("MEEGLE_PRODUCTION_BUG_TYPE_UNSUPPORTED");
    }
    expect(acpService.chatOneShot).not.toHaveBeenCalled();
    expect(acpService.chat).not.toHaveBeenCalled();
  });

  it("returns concurrency limited errors without calling ACP or updating Meegle", async () => {
    const updateWorkitem = vi.fn();
    const client = {
      getWorkitemDetails: vi.fn().mockResolvedValue([
        {
          id: "123456",
          key: "BUG-1",
          name: "Checkout fails",
          type: "production_bug",
          status: "open",
          fields: {
            description: "User cannot pay",
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

    const result = await executeLarkBugAnalyze(
      {
        projectKey: "OPS",
        workItemTypeKey: "production_bug",
        workItemId: "123456",
        masterUserId: "usr_1",
        baseUrl: "https://project.larksuite.com",
        actionRunId: "run_limited",
      },
      {
        resolvedUserStore: createResolvedUserStore(),
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
        acpLimiter: createBugAcpLimiter({
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
    expect(updateWorkitem).not.toHaveBeenCalled();
  });
});
