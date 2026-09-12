import { createLarkTicketAiSessionService } from "./lark-ticket-ai-session.service.js";
import { WikiQaError } from "../../domain/wiki-qa.js";
import { LarkTicketThreadContextError } from "./lark-ticket-thread-context.service.js";

const ticket = { baseId: "app_wiki", tableId: "tbl_wiki", recordId: "rec_wiki" };
const request = { ticket, operatorLarkId: "ou_wiki", masterUserId: "usr_wiki", larkBaseUrl: "https://open.larksuite.com", actionKey: "lark-ticket-wiki-qa", message: "wiki 问答", actionRunId: "run_wiki" };

function fixture() {
  const record = { ...ticket, title: "PL report missing account", detailDescription: "40500 不显示", sourceFields: { "解决方案": "未处理" }, syncedAt: "2026-09-11T00:00:00.000Z" };
  const snapshot = { ...ticket, snapshotVersion: 1, historyComplete: true, threadId: "thread_wiki", messages: [],
    preparedMessages: [{ messageId: "om_wiki", senderRole: "user", text: "UK Odoo 17：PL 报表缺少科目。", hasArtifact: false }],
  };
  const wikiQaService = { answer: vi.fn().mockResolvedValue({ question: "PL报表缺少科目", evidence: [], answerMarkdown: "回复草稿。[1]\n来源：docs/llm-wiki/concepts/report.md" }) };
  const acpService = { chat: vi.fn(), assertSessionAccess: vi.fn() };
  const analysisService = { update: vi.fn() };
  const ownershipStore = { attachTicket: vi.fn() };
  const threadContextService = { ensure: vi.fn().mockResolvedValue({ source: "cache", decision: "cache", snapshot }) };
  const service = createLarkTicketAiSessionService({
    syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([record]) } as never,
    ownershipStore: ownershipStore as never, acpService: acpService as never, analysisService: analysisService as never,
    wikiQaService, threadContextService: threadContextService as never,
  });
  return { service, record, snapshot, wikiQaService, acpService, analysisService, ownershipStore, threadContextService };
}

describe("Ticket wiki QA integration", () => {
  it("uses the fixed Ticket thread, emits a one-shot draft, and performs no analysis or ACP writes", async () => {
    const f = fixture();
    const emit = vi.fn();
    await f.service.chat(request, emit);
    expect(f.wikiQaService.answer).toHaveBeenCalledWith(expect.objectContaining({
      actionRunId: request.actionRunId,
      ticketContext: expect.stringContaining("UK Odoo 17：PL 报表缺少科目。"),
    }));
    const context = f.wikiQaService.answer.mock.calls[0][0].ticketContext;
    expect(context).toContain("Message 1 (om_wiki)");
    expect(context).toContain("解决方案");
    expect(context).not.toContain("wiki 问答");
    expect(emit.mock.calls.map(([event]) => event.event)).toEqual(["acp.session.update", "done"]);
    expect(f.acpService.chat).not.toHaveBeenCalled();
    expect(f.analysisService.update).not.toHaveBeenCalled();
    expect(f.ownershipStore.attachTicket).not.toHaveBeenCalled();
  });

  it.each(["incomplete", "empty", "wrong-ticket", "missing-fields", "invalid-version"])("stops before retrieval when materials are invalid: %s", async (kind) => {
    const f = fixture();
    if (kind === "incomplete") f.snapshot.historyComplete = false;
    if (kind === "empty") f.snapshot.preparedMessages = [];
    if (kind === "wrong-ticket") f.snapshot.recordId = "rec_another";
    if (kind === "missing-fields") f.record.sourceFields = {} as typeof f.record.sourceFields;
    if (kind === "invalid-version") f.snapshot.snapshotVersion = 0;
    await expect(f.service.chat(request, vi.fn())).rejects.toMatchObject({ code: "SUPPORT_QA_MATERIALS_UNAVAILABLE", diagnostic: { actionRunId: "run_wiki" } });
    expect(f.wikiQaService.answer).not.toHaveBeenCalled();
  });

  it("preserves retrieval and material failures without emitting done", async () => {
    const f = fixture();
    const emit = vi.fn();
    f.wikiQaService.answer.mockRejectedValue(new WikiQaError("WIKI_QA_UNAVAILABLE", "missing wiki", { layer: "adapter", module: "wiki-knowledge-reader", stage: "server.wiki_qa.retrieve", actionRunId: "run_wiki" }));
    await expect(f.service.chat(request, emit)).rejects.toMatchObject({ code: "WIKI_QA_UNAVAILABLE" });
    expect(emit).not.toHaveBeenCalled();
    f.threadContextService.ensure.mockRejectedValue(new LarkTicketThreadContextError("LARK_THREAD_CONTEXT_UNAVAILABLE", "missing thread"));
    await expect(f.service.chat(request, emit)).rejects.toMatchObject({ code: "LARK_THREAD_CONTEXT_UNAVAILABLE", diagnostic: { stage: "server.wiki_qa.materials" } });
  });

  it("suppresses completion when cancelled while answering", async () => {
    const f = fixture();
    const abort = new AbortController();
    f.wikiQaService.answer.mockImplementation(async () => { abort.abort(); return { question: "", evidence: [], answerMarkdown: "late draft" }; });
    const emit = vi.fn();
    await expect(f.service.chat({ ...request, signal: abort.signal }, emit)).rejects.toMatchObject({ name: "AbortError" });
    expect(emit).not.toHaveBeenCalled();
  });
});
