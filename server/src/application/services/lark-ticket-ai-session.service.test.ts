import { describe, expect, it, vi } from "vitest";
import {
  createLarkTicketAiSessionService,
} from "./lark-ticket-ai-session.service.js";
import { DeepSeekChatError } from "../../adapters/deepseek/deepseek-chat-client.js";
import { SupportTicketAnalysisError } from "./support-ticket-analysis.service.js";

const ticket = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };

function createDirectSummaryTestService(
  deepSeekClient: { createJsonCompletion: ReturnType<typeof vi.fn> },
  analysisService: { update: ReturnType<typeof vi.fn> },
) {
  return createLarkTicketAiSessionService({
    syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{
      ...ticket, title: "Ticket", ticketNumber: "LT-10", syncedAt: "2026-09-04T00:00:00.000Z",
    }]) } as never,
    ownershipStore: {} as never,
    deepSeekClient,
    analysisService: analysisService as never,
    workflowPromptStore: { getByKey: vi.fn().mockResolvedValue({ prompt: "{{ticket_context}} {{user_message}}" }) } as never,
    threadContextService: { ensure: vi.fn().mockResolvedValue({
      source: "postgres",
      decision: "cached",
      snapshot: {
        ...ticket, threadId: "thread_1", messages: [], preparedMessages: [{ messageId: "om_1", senderRole: "user", text: "问题", hasArtifact: false }], snapshotVersion: 1, historyComplete: true, dirty: false, createdAt: "2026-09-04T00:00:00.000Z", updatedAt: "2026-09-04T00:00:00.000Z",
      },
    }) } as never,
  });
}

const validDirectSummaryResult = {
  version: "support-analysis-result-v1",
  analysis: {
    segmentKey: "primary",
    intent: { intentType: "other", intentSubtype: "unclassified", confidence: 0.5, summary: "总结", keywords: [], evidenceMessageIds: ["om_1"] },
    result: { resolutionStatus: "pending", solutionSummary: null, solutionSteps: [], resolverRef: null, resolvedAt: null, autoResolvable: false, suggestedAutomation: null, confidence: 0.5 },
    quality: { scores: {}, summary: "证据不足", criticalIssues: [], warnings: [] },
  },
  summary: "问题总结",
};

describe("Lark Ticket AI Session service", () => {
  it("starts a Kimi session with server-built Ticket context and associates it after creation", async () => {
    const ownershipStore = {
      getBySessionId: vi.fn(),
      listByTicket: vi.fn(),
      attachTicket: vi.fn().mockResolvedValue({ sessionId: "sess_1" }),
      touch: vi.fn(),
    };
    const acpService = {
      assertSessionAccess: vi.fn(),
      chat: vi.fn(async (_input, emit) => {
        emit({ event: "session.created", data: { sessionId: "sess_1" } });
        emit({ event: "done", data: { sessionId: "sess_1", stopReason: "end_turn" } });
      }),
    };
    const service = createLarkTicketAiSessionService({
      syncStore: {
        getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{
          ...ticket,
          title: "Create ticket AI Chat",
          issueType: "Feature",
          ticketNumber: "LT-10",
          detailDescription: "Build the page.",
          syncedAt: "2026-08-12T00:00:00.000Z",
        }]),
      } as never,
      ownershipStore: ownershipStore as never,
      acpService: acpService as never,
    });
    const events: unknown[] = [];

    await service.chat({
      operatorLarkId: "ou_1",
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket,
      message: "Please create a PRD",
      actionRunId: "run_1",
    }, (event) => events.push(event));

    expect(acpService.chat).toHaveBeenCalledWith(expect.objectContaining({
      operatorLarkId: "ou_1",
      actionRunId: "run_1",
      message: expect.stringContaining("Title: Create ticket AI Chat"),
    }), expect.any(Function), expect.objectContaining({ session: null }));
    expect(ownershipStore.attachTicket).toHaveBeenCalledWith({
      sessionId: "sess_1",
      operatorLarkId: "ou_1",
      title: "Please create a PRD",
      ticketNumber: "LT-10",
      ...ticket,
    });
    expect(events).toHaveLength(2);
  });

  it("associates a created Session before a later ACP prompt failure", async () => {
    const ownershipStore = {
      getBySessionId: vi.fn(),
      listByTicket: vi.fn(),
      attachTicket: vi.fn().mockResolvedValue({ sessionId: "sess_interrupted" }),
      touch: vi.fn(),
    };
    const acpService = {
      assertSessionAccess: vi.fn(),
      chat: vi.fn(async (_input, emit) => {
        emit({ event: "session.created", data: { sessionId: "sess_interrupted" } });
        await Promise.resolve();
        expect(ownershipStore.attachTicket).toHaveBeenCalledWith(expect.objectContaining({
          sessionId: "sess_interrupted",
          ...ticket,
        }));
        throw new Error("ACP prompt interrupted");
      }),
    };
    const service = createLarkTicketAiSessionService({
      syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{
        ...ticket,
        title: "Interrupted Ticket",
        ticketNumber: "LT-10",
        syncedAt: "2026-08-12T00:00:00.000Z",
      }]) } as never,
      ownershipStore: ownershipStore as never,
      acpService: acpService as never,
    });

    await expect(service.chat({
      operatorLarkId: "ou_1",
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket,
      message: "回答问题",
      actionRunId: "run_interrupted",
    }, vi.fn())).rejects.toThrow("ACP prompt interrupted");
    expect(ownershipStore.attachTicket).toHaveBeenCalledTimes(1);
  });

  it("lists only sessions already associated with the requested Ticket", async () => {
    const ownershipStore = {
      listByTicket: vi.fn().mockResolvedValue([
        {
          sessionId: "sess_1",
          title: "Create a PRD",
          automationActionKey: null,
          updatedAt: "2026-08-12T00:00:00.000Z",
        },
        {
          sessionId: "sess_legacy_summary",
          title: "问题总结",
          automationActionKey: "lark-ticket-support-qa-summarize",
          updatedAt: "2026-08-12T00:00:00.000Z",
        },
      ]),
    };
    const service = createLarkTicketAiSessionService({
      syncStore: {
        getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{
          ...ticket,
          title: "Ticket",
          syncedAt: "2026-08-12T00:00:00.000Z",
        }]),
      } as never,
      ownershipStore: ownershipStore as never,
    });

    await expect(service.listSessions({ operatorLarkId: "ou_1", ticket })).resolves.toEqual([{
      sessionId: "sess_1",
      title: "Create a PRD",
      updatedAt: "2026-08-12T00:00:00.000Z",
    }]);
    expect(ownershipStore.listByTicket).toHaveBeenCalledWith({ operatorLarkId: "ou_1", ...ticket });
  });

  it("does not reopen a legacy ACP Session created by Ticket Summary", async () => {
    const historyService = { loadSession: vi.fn() };
    const service = createLarkTicketAiSessionService({
      ownershipStore: {
        getBySessionId: vi.fn().mockResolvedValue({
          sessionId: "sess_legacy_summary",
          operatorLarkId: "ou_1",
          ticketBaseId: ticket.baseId,
          ticketTableId: ticket.tableId,
          ticketRecordId: ticket.recordId,
          automationActionKey: "lark-ticket-support-qa-summarize",
          deletedAt: null,
        }),
      } as never,
      historyService: historyService as never,
    });

    await expect(service.loadSession({
      operatorLarkId: "ou_1",
      ticket,
      sessionId: "sess_legacy_summary",
    })).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    expect(historyService.loadSession).not.toHaveBeenCalled();
  });

  it("runs Summary through DeepSeek, validates its fixed-snapshot evidence, and writes the analysis directly", async () => {
    const analysis = {
      segmentKey: "primary",
      intent: {
        intentType: "troubleshoot",
        intentSubtype: "workflow_stuck",
        confidence: 0.9,
        summary: "用户无法登录，需要进一步确认报错信息。",
        keywords: ["login"],
        evidenceMessageIds: ["om_1"],
      },
      result: {
        resolutionStatus: "needs_info",
        solutionSummary: null,
        solutionSteps: [],
        resolverRef: null,
        resolvedAt: null,
        autoResolvable: false,
        suggestedAutomation: null,
        confidence: 0.7,
      },
      quality: { scores: {}, summary: "当前证据不足。", criticalIssues: [], warnings: ["缺少报错截图"] },
    };
    const deepSeekClient = {
      createJsonCompletion: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          version: "support-analysis-result-v1",
          analysis,
          summary: "用户无法登录，尚需补充报错信息。",
        }),
        model: "deepseek-v4-flash",
      }),
    };
    const analysisService = { update: vi.fn().mockResolvedValue({ analysisRunId: "analysis_1" }) };
    const ownershipStore = { listByTicket: vi.fn(), getBySessionId: vi.fn() };
    const acpService = { assertSessionAccess: vi.fn(), chat: vi.fn() };
    const service = createLarkTicketAiSessionService({
      syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{
        ...ticket, title: "Login failed", ticketNumber: "LT-10", detailDescription: "Cannot sign in", syncedAt: "2026-09-04T00:00:00.000Z",
      }]) } as never,
      ownershipStore: ownershipStore as never,
      acpService: acpService as never,
      deepSeekClient,
      analysisService: analysisService as never,
      workflowPromptStore: { getByKey: vi.fn().mockResolvedValue(undefined) } as never,
      threadContextService: { ensure: vi.fn().mockResolvedValue({
        decision: "cached",
        source: "postgres",
        snapshot: {
          ...ticket,
          threadId: "thread_1",
          messages: [],
          preparedMessages: [{ messageId: "om_1", senderRole: "user", text: "登录时报错", hasArtifact: false }],
          snapshotVersion: 3,
          historyComplete: true,
          dirty: false,
          createdAt: "2026-09-04T00:00:00.000Z",
          updatedAt: "2026-09-04T00:00:00.000Z",
        },
      }) } as never,
    });
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];

    await service.chat({
      operatorLarkId: "ou_1",
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket,
      message: "问题总结",
      actionKey: "lark-ticket-support-qa-summarize",
      actionRunId: "run_deepseek_1",
    }, (event) => events.push(event as never));

    expect(deepSeekClient.createJsonCompletion).toHaveBeenCalledWith(expect.objectContaining({
      actionRunId: "run_deepseek_1",
      prompt: expect.stringContaining("om_1"),
    }));
    expect(deepSeekClient.createJsonCompletion.mock.calls[0][0].prompt).toContain("evidenceMessageIds");
    expect(deepSeekClient.createJsonCompletion.mock.calls[0][0].prompt).toContain("intentType 只能是以下 10 个值之一");
    expect(analysisService.update).toHaveBeenCalledWith({
      ticket,
      snapshotVersion: 3,
      actionRunId: "run_deepseek_1",
      sourceName: "lark-ticket-support-qa-summarize",
      reviewStatus: "ai_generated",
      reviewerKind: "ai",
      analysis,
    });
    expect(acpService.chat).not.toHaveBeenCalled();
    expect(events.map((event) => event.event)).toEqual(["acp.session.update", "done"]);
    expect(events[0]).toMatchObject({
      data: { update: { content: { type: "text", text: "用户无法登录，尚需补充报错信息。" } } },
    });
    expect(events.some((event) => event.event === "session.created")).toBe(false);
  });

  it("rejects DeepSeek evidence outside the fixed snapshot without writing analysis", async () => {
    const deepSeekClient = { createJsonCompletion: vi.fn().mockResolvedValue({
      model: "deepseek-v4-flash",
      content: JSON.stringify({
        version: "support-analysis-result-v1",
        analysis: {
          segmentKey: "primary",
          intent: { intentType: "other", intentSubtype: "unclassified", confidence: 0.5, summary: "总结", keywords: [], evidenceMessageIds: ["om_other"] },
          result: { resolutionStatus: "pending", solutionSummary: null, solutionSteps: [], resolverRef: null, resolvedAt: null, autoResolvable: false, suggestedAutomation: null, confidence: 0.5 },
          quality: { scores: {}, summary: "证据不足", criticalIssues: [], warnings: [] },
        },
        summary: "总结",
      }),
    }) };
    const analysisService = { update: vi.fn() };
    const service = createLarkTicketAiSessionService({
      syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "Ticket", syncedAt: "2026-09-04T00:00:00.000Z" }]) } as never,
      ownershipStore: {} as never,
      deepSeekClient,
      analysisService: analysisService as never,
      workflowPromptStore: { getByKey: vi.fn().mockResolvedValue({ prompt: "{{ticket_context}} {{user_message}}" }) } as never,
      threadContextService: { ensure: vi.fn().mockResolvedValue({
        source: "postgres",
        decision: "cached",
        snapshot: {
          ...ticket, threadId: "thread_1", messages: [], preparedMessages: [{ messageId: "om_1", senderRole: "user", text: "问题", hasArtifact: false }], snapshotVersion: 1, historyComplete: true, dirty: false, createdAt: "2026-09-04T00:00:00.000Z", updatedAt: "2026-09-04T00:00:00.000Z",
        },
      }) } as never,
    });

    await expect(service.chat({
      operatorLarkId: "ou_1", masterUserId: "usr_1", larkBaseUrl: "https://open.larksuite.com", ticket,
      message: "问题总结", actionKey: "lark-ticket-support-qa-summarize", actionRunId: "run_bad_evidence",
    }, vi.fn())).rejects.toMatchObject({ code: "DEEPSEEK_EVIDENCE_OUTSIDE_SNAPSHOT" });
    expect(analysisService.update).not.toHaveBeenCalled();
  });

  it("does not write analysis when the DeepSeek request fails", async () => {
    const analysisService = { update: vi.fn() };
    const service = createDirectSummaryTestService({
      createJsonCompletion: vi.fn().mockRejectedValue(new DeepSeekChatError("DEEPSEEK_REQUEST_FAILED", "Provider unavailable.")),
    }, analysisService);

    await expect(service.chat({
      operatorLarkId: "ou_1", masterUserId: "usr_1", larkBaseUrl: "https://open.larksuite.com", ticket,
      message: "问题总结", actionKey: "lark-ticket-support-qa-summarize", actionRunId: "run_provider_error",
    }, vi.fn())).rejects.toMatchObject({ code: "DEEPSEEK_REQUEST_FAILED" });
    expect(analysisService.update).not.toHaveBeenCalled();
  });

  it("returns a version conflict when the fixed snapshot expires before writeback", async () => {
    const analysisService = {
      update: vi.fn().mockRejectedValue(new SupportTicketAnalysisError(
        "THREAD_SNAPSHOT_VERSION_CONFLICT",
        "The analysis snapshot version is no longer current.",
        "run_snapshot_conflict",
      )),
    };
    const service = createDirectSummaryTestService({
      createJsonCompletion: vi.fn().mockResolvedValue({
        model: "deepseek-v4-flash",
        content: JSON.stringify(validDirectSummaryResult),
      }),
    }, analysisService);

    await expect(service.chat({
      operatorLarkId: "ou_1", masterUserId: "usr_1", larkBaseUrl: "https://open.larksuite.com", ticket,
      message: "问题总结", actionKey: "lark-ticket-support-qa-summarize", actionRunId: "run_snapshot_conflict",
    }, vi.fn())).rejects.toMatchObject({ code: "THREAD_SNAPSHOT_VERSION_CONFLICT" });
    expect(analysisService.update).toHaveBeenCalledTimes(1);
  });

  it("rejects a Support-QA quick action that ends without a completed Ticket fetch", async () => {
    const ownershipStore = {
      getBySessionId: vi.fn(),
      listByTicket: vi.fn(),
      attachTicket: vi.fn().mockResolvedValue({ sessionId: "sess_no_fetch" }),
      updateRun: vi.fn(),
      touch: vi.fn(),
    };
    const acpService = {
      assertSessionAccess: vi.fn(),
      chat: vi.fn(async (_input, emit) => {
        emit({ event: "session.created", data: { sessionId: "sess_failed" } });
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "sess_failed",
            update: {
              sessionUpdate: "tool_call",
              toolCallId: "12:fetch_failed",
              status: "pending",
            },
          },
        });
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "sess_failed",
            update: {
              sessionUpdate: "tool_call_update",
              toolCallId: "12:fetch_failed",
              status: "in_progress",
              rawInput: {
                command: "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-10 --json",
              },
            },
          },
        });
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "sess_failed",
            update: {
              sessionUpdate: "tool_call_update",
              toolCallId: "12:fetch_failed",
              status: "failed",
            },
          },
        });
        emit({
          event: "acp.session.update",
          data: { sessionId: "sess_failed", update: {
            sessionUpdate: "agent_message_chunk",
            messageId: "assistant_1",
            content: { type: "text", text: "这是一份未验证答案" },
          } },
        });
        emit({ event: "done", data: { sessionId: "sess_failed", stopReason: "end_turn" } });
      }),
    };
    const service = createLarkTicketAiSessionService({
      syncStore: {
        getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{
          ...ticket,
          title: "Ticket title",
          ticketNumber: "LT-10",
          syncedAt: "2026-08-12T00:00:00.000Z",
        }]),
      } as never,
      ownershipStore: ownershipStore as never,
      acpService: acpService as never,
      knowledgeRetriever: { searchApproved: vi.fn().mockResolvedValue([]) } as never,
      workflowPromptStore: {
        getByKey: vi.fn().mockResolvedValue({ prompt: "Skill: {{skill_path}}\n{{ticket_context}}\n{{user_message}}" }),
      } as never,
      threadContextService: {
        ensure: vi.fn().mockResolvedValue({
          decision: "cached",
          source: "postgres",
          snapshot: {
            ...ticket,
            messageLink: "https://example.test/thread",
            threadId: "thread_1",
            messages: [],
            preparedMessages: [{ messageId: "om_1", senderRole: "user", text: "无法登录", hasArtifact: false }],
            snapshotVersion: 3,
            historyComplete: true,
            dirty: false,
            createdAt: "2026-09-01T09:00:00.000Z",
            updatedAt: "2026-09-01T10:00:00.000Z",
          },
        }),
      } as never,
      resolveAction: vi.fn().mockResolvedValue({
        action: {
          key: "lark-ticket-support-qa-answer",
          promptKey: "lark_ticket.support_qa.answer",
          skillProfile: "support_qa_eu",
          skillId: "support_qa_query",
          executionPolicy: "shell",
          provider: "kimi_acp",
          requiresConfirmation: false,
        },
        workspaceDir: "/srv/odoo/eu",
        octoServerDir: "/srv/octo/server",
        skillPath: "/srv/odoo/eu/.agents/skills/query-support-qa/SKILL.md",
      }),
    });
    const events: Array<{ event: string }> = [];

    await expect(service.chat({
      operatorLarkId: "ou_1",
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket,
      message: "请回答问题",
      actionKey: "lark-ticket-support-qa-answer",
      actionRunId: "run_1",
    }, (event) => events.push(event))).rejects.toMatchObject({
      code: "SUPPORT_QA_EVIDENCE_NOT_FETCHED",
      diagnostic: {
        layer: "server",
        module: "lark-ticket-ai-session",
        stage: "server.workflow.completed",
        actionRunId: "run_1",
      },
    });
    expect(events.some((event) => event.event === "done")).toBe(false);
    expect(ownershipStore.attachTicket).toHaveBeenCalled();
    expect(ownershipStore.updateRun).toHaveBeenCalledWith(expect.objectContaining({
      actionRunId: "run_1",
      status: "failed",
      errorCode: "SUPPORT_QA_EVIDENCE_NOT_FETCHED",
      unverifiedOutput: "这是一份未验证答案",
    }));
  });

  it("adds only approved knowledge citations to a new Answer quick-action prompt", async () => {
    const ownershipStore = {
      getBySessionId: vi.fn(),
      listByTicket: vi.fn(),
      attachTicket: vi.fn().mockResolvedValue({ sessionId: "sess_answer" }),
      touch: vi.fn(),
    };
    const acpService = {
      assertSessionAccess: vi.fn(),
      chat: vi.fn(async (_input, emit) => {
        emit({ event: "session.created", data: { sessionId: "sess_answer" } });
        emit({
          event: "acp.session.update",
          data: { sessionId: "sess_answer", update: {
            sessionUpdate: "tool_call_update", toolCallId: "fetch_answer", status: "in_progress",
            rawInput: { command: "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-10 --json" },
          } },
        });
        emit({
          event: "acp.session.update",
          data: { sessionId: "sess_answer", update: {
            sessionUpdate: "tool_call_update", toolCallId: "fetch_answer", status: "completed",
          } },
        });
        emit({ event: "done", data: { sessionId: "sess_answer", stopReason: "end_turn" } });
      }),
    };
    const knowledgeRetriever = {
      searchApproved: vi.fn().mockResolvedValue([{
        documentId: "doc_1",
        chunkId: "chunk_1",
        sourceKind: "approved_case",
        sourceRef: "case:LT-9:segment-2",
        title: "VPN certificate reset",
        redactedContent: "Reset the certificate and ask the requester to reconnect.",
        tags: ["VPN"],
        approvedAt: "2026-09-01T09:00:00.000Z",
        score: 6,
      }]),
    };
    const service = createLarkTicketAiSessionService({
      syncStore: {
        getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{
          ...ticket,
          title: "VPN failed for person@example.com",
          ticketNumber: "LT-10",
          detailDescription: "VPN certificate error",
          syncedAt: "2026-08-12T00:00:00.000Z",
        }]),
      } as never,
      ownershipStore: ownershipStore as never,
      acpService: acpService as never,
      knowledgeRetriever,
      workflowPromptStore: { getByKey: vi.fn().mockResolvedValue({ prompt: "{{ticket_context}}" }) } as never,
      resolveAction: vi.fn().mockResolvedValue({
        action: {
          key: "lark-ticket-support-qa-answer",
          promptKey: "lark_ticket.support_qa.answer",
          skillProfile: "support_qa_eu",
          skillId: "support_qa_query",
          executionPolicy: "shell",
        },
        workspaceDir: "/srv/odoo/eu",
        octoServerDir: "/srv/octo/server",
        skillPath: "/srv/odoo/eu/.agents/skills/query-support-qa/SKILL.md",
      }),
      threadContextService: { ensure: vi.fn().mockResolvedValue({ decision: "cached", source: "postgres" }) } as never,
    });

    await service.chat({
      operatorLarkId: "ou_1",
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket,
      message: "VPN cannot connect",
      actionKey: "lark-ticket-support-qa-answer",
    }, vi.fn());

    expect(knowledgeRetriever.searchApproved).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining("VPN") }));
    expect(acpService.chat).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("source_ref=case:LT-9:segment-2"),
    }), expect.any(Function), expect.any(Object));
    expect(acpService.chat.mock.calls[0][0].message).toContain("mcp__octo_execute__execute");
    expect(acpService.chat.mock.calls[0][0].message).toContain('"subcommand":"fetch","args":["LT-10","--json"]');
    expect(acpService.chat.mock.calls[0][0].message).toContain("不得调用 Bash");
    expect(acpService.chat.mock.calls[0][0].message).not.toContain("person@example.com");
  });

  it("ensures thread context only for a new Session and pins its snapshot metadata", async () => {
    const ownershipStore = {
      getBySessionId: vi.fn().mockResolvedValue({
        sessionId: "sess_3",
        operatorLarkId: "ou_1",
        ticketBaseId: ticket.baseId,
        ticketTableId: ticket.tableId,
        ticketRecordId: ticket.recordId,
        deletedAt: null,
      }),
      listByTicket: vi.fn(),
      attachTicket: vi.fn().mockResolvedValue({ sessionId: "sess_3" }),
      touch: vi.fn(),
    };
    const acpService = {
      assertSessionAccess: vi.fn(),
      chat: vi.fn(async (input, emit) => {
        if (!input.sessionId) emit({ event: "session.created", data: { sessionId: "sess_3" } });
        emit({ event: "done", data: { sessionId: input.sessionId ?? "sess_3", stopReason: "end_turn" } });
      }),
    };
    const threadContextService = {
      ensure: vi.fn().mockResolvedValue({
        decision: "full",
        source: "lark",
        threadId: "thread_1",
        snapshot: {
          ...ticket,
          messageLink: "https://applink.larksuite.com/client/thread/open?threadid=thread_1",
          threadId: "thread_1",
          messages: [{ messageId: "om_1", content: "Thread reply" }],
          snapshotVersion: 4,
          historyComplete: true,
          dirty: false,
          lastSuccessfulSyncAt: "2026-08-26T12:00:00.000Z",
          createdAt: "2026-08-26T11:00:00.000Z",
          updatedAt: "2026-08-26T12:00:00.000Z",
        },
      }),
    };
    const service = createLarkTicketAiSessionService({
      syncStore: {
        getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{
          ...ticket,
          title: "Ticket with thread",
          larkMessageLink: "https://applink.larksuite.com/client/thread/open?threadid=thread_1",
          syncedAt: "2026-08-26T10:00:00.000Z",
        }]),
      } as never,
      ownershipStore: ownershipStore as never,
      acpService: acpService as never,
      threadContextService: threadContextService as never,
    });
    const identity = {
      operatorLarkId: "ou_1",
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket,
    };

    await service.chat({ ...identity, message: "Analyze it" }, vi.fn());
    await service.chat({ ...identity, message: "Continue", sessionId: "sess_3" }, vi.fn());

    expect(threadContextService.ensure).toHaveBeenCalledTimes(1);
    expect(acpService.chat.mock.calls[0][0].message).toContain("Thread reply");
    expect(acpService.chat.mock.calls[1][0].message).toBe("Continue");
    expect(ownershipStore.attachTicket).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread_1",
      threadSnapshotVersion: 4,
      threadContextSyncedAt: "2026-08-26T12:00:00.000Z",
    }));
  });
});
