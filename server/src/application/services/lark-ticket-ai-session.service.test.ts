import { describe, expect, it, vi } from "vitest";
import {
  createLarkTicketAiSessionService,
} from "./lark-ticket-ai-session.service.js";

const ticket = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };

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

  it("lists only sessions already associated with the requested Ticket", async () => {
    const ownershipStore = {
      listByTicket: vi.fn().mockResolvedValue([{
        sessionId: "sess_1",
        title: "Create a PRD",
        updatedAt: "2026-08-12T00:00:00.000Z",
      }]),
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

  it("uses the action catalog prompt and permission context for a new quick-action Session", async () => {
    const ownershipStore = {
      getBySessionId: vi.fn(),
      listByTicket: vi.fn(),
      attachTicket: vi.fn().mockResolvedValue({ sessionId: "sess_2" }),
      touch: vi.fn(),
    };
    const acpService = {
      assertSessionAccess: vi.fn(),
      chat: vi.fn(async (_input, emit) => {
        emit({ event: "session.created", data: { sessionId: "sess_2" } });
        emit({ event: "done", data: { sessionId: "sess_2", stopReason: "end_turn" } });
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
      workflowPromptStore: {
        getByKey: vi.fn().mockResolvedValue({ prompt: "Skill: {{skill_path}}\n{{ticket_context}}\n{{user_message}}" }),
      } as never,
      resolveAction: vi.fn().mockResolvedValue({
        action: {
          key: "lark-ticket-support-qa-summarize",
          promptKey: "lark_ticket.support_qa.summarize",
          skillProfile: "support_qa_eu",
          skillId: "support_qa_query",
          executionPolicy: "shell",
        },
        workspaceDir: "/srv/odoo/eu",
        skillPath: "/srv/odoo/eu/.agents/skills/query-support-qa/SKILL.md",
      }),
    });

    await service.chat({
      operatorLarkId: "ou_1",
      ticket,
      message: "请总结问题",
      actionKey: "lark-ticket-support-qa-summarize",
    }, vi.fn());

    expect(acpService.chat).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("query-support-qa/SKILL.md"),
      permissionContext: expect.objectContaining({
        executionPolicy: "shell",
        workspaceDir: "/srv/odoo/eu",
        ticketNumber: "LT-10",
      }),
    }), expect.any(Function), expect.any(Object));
    expect(ownershipStore.attachTicket).toHaveBeenCalledWith(expect.objectContaining({ ticketNumber: "LT-10" }));
  });
});
