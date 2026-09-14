import { createWikiQaService } from "./wiki-qa.service.js";
import { WikiQaError, type WikiCandidate } from "../../domain/wiki-qa.js";

const candidate = (id = "wiki-1"): WikiCandidate => ({
  id, path: `concepts/faq/${id}.md`, title: "报表科目显示", status: "draft", environments: ["UK Odoo 17"],
  content: "核对 PL 报表分组配置", sourceEvidence: [{ id: `${id}-source-1`, path: "raw/transcripts/ticket-1.md", content: "核对分组后显示。", complete: true }],
  limitations: ["草稿资料，尚未人工确认"], historicalOnly: false,
});
const extracted = { question: "PL 报表缺少科目怎么办？", keywords: ["报表", "report"], objects: ["account.account"], environments: ["UK Odoo 17"] };
const match = (id = "wiki-1") => ({ candidateId: id, applicability: "applicable", conditionsMatched: true, evidenceIds: [`${id}-source-1`], limitations: [] as string[] });
const input = { ticketContext: "UK Odoo 17，PL 缺少科目。", actionRunId: "wiki-run-1" };

function fixture(candidates = [candidate()], ranking = { matches: [match()] }, answerMarkdown = "可以先核对 PL 报表的分组配置。[1]") {
  const reader = { search: vi.fn().mockResolvedValue(candidates) };
  const client = { createJsonCompletion: vi.fn()
    .mockResolvedValueOnce({ content: JSON.stringify(extracted), model: "test-model" })
    .mockResolvedValueOnce({ content: JSON.stringify(candidates.length ? ranking : { answerMarkdown }), model: "test-model" })
    .mockResolvedValueOnce({ content: JSON.stringify({ answerMarkdown }), model: "test-model" }),
  };
  const promptStore = { getByKey: vi.fn().mockResolvedValue(undefined) };
  return { reader, client, promptStore, service: createWikiQaService({ reader, client, promptStore }) };
}

describe("wiki QA service", () => {
  it("extracts bilingual search terms, ranks three unique pages and supplies numbered evidence to the answer", async () => {
    const f = fixture([candidate(), candidate("wiki-2"), candidate("wiki-3"), candidate("wiki-4")], { matches: [match("wiki-3"), match(), match("wiki-2")] });
    const result = await f.service.answer(input);
    expect(f.reader.search).toHaveBeenCalledWith({ ...extracted, signal: undefined });
    expect(result.evidence.map((hit) => hit.path)).toEqual(["concepts/faq/wiki-3.md", "concepts/faq/wiki-1.md", "concepts/faq/wiki-2.md"]);
    expect(result.evidence.map((hit) => hit.sourceId)).toEqual([1, 2, 3]);
    expect(result.answerMarkdown).toContain("草稿");
    expect(result.answerMarkdown).toContain("来源：docs/llm-wiki/concepts/faq/wiki-3.md");
    expect(f.client.createJsonCompletion.mock.calls[2][0].prompt).toContain('"sourceId":1');
    expect(f.client.createJsonCompletion.mock.calls.every(([request]) => request.actionRunId === input.actionRunId && !('tools' in request))).toBe(true);
    expect(f.promptStore.getByKey.mock.calls.flat()).toEqual(["lark_ticket.wiki_qa.extract", "lark_ticket.wiki_qa.rerank", "lark_ticket.wiki_qa.answer"]);
  });

  it.each([
    { matches: [match("invented")] },
    { matches: [match(), match()] },
    { matches: [{ ...match(), evidenceIds: ["invented-source"] }] },
    { matches: [{ ...match(), evidenceIds: ["wiki-1-source-1", "wiki-1-source-1"] }] },
  ])("rejects invalid references instead of fabricating evidence", async (ranking) => {
    const f = fixture([candidate()], ranking);
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_REFERENCE_INVALID" });
    expect(f.client.createJsonCompletion).toHaveBeenCalledTimes(2);
  });

  it("does not allow the model to promote historical-only or unsupported material", async () => {
    const f = fixture([{ ...candidate(), historicalOnly: true }, candidate("wiki-2")], { matches: [match(), { ...match("wiki-2"), evidenceIds: [] }] });
    const result = await f.service.answer(input);
    expect(result.evidence.every((hit) => hit.applicability === "historical_reference")).toBe(true);
    expect(result.answerMarkdown).toContain("仅供历史参考");
  });

  it("preserves conflicting evidence and limitations", async () => {
    const f = fixture([candidate(), candidate("wiki-2")], { matches: [
      { ...match(), limitations: ["与 wiki-2 的适用规则冲突"] }, { ...match("wiki-2"), limitations: ["与 wiki-1 冲突，需确认版本"] },
    ] });
    expect((await f.service.answer(input)).evidence[1].limitations).toContain("与 wiki-1 冲突，需确认版本");
    expect(f.client.createJsonCompletion.mock.calls[2][0].prompt).toContain("与 wiki-1 冲突");
  });

  it("does not forward unrelated branches from a multi-incident wiki page", async () => {
    const page = { ...candidate(), content: "---\nsources: [raw/transcripts/ticket-1.md]\n---\n# 财务知识\n- PL 分组为空时核对配置 [ticket-1](../../raw/transcripts/ticket-1.md)。\n- 权益科目不结转属于另一个问题 [ticket-2](../../raw/transcripts/ticket-2.md)。" };
    const f = fixture([page]);
    const result = await f.service.answer(input);
    expect(result.evidence[0].content).toContain("PL 分组");
    expect(result.evidence[0].content).not.toContain("权益科目");
    expect(f.client.createJsonCompletion.mock.calls[2][0].prompt).not.toContain("权益科目");
  });

  it("demotes a model's applicable label when treatment prerequisites are unconfirmed", async () => {
    const f = fixture([candidate()], { matches: [{ ...match(), conditionsMatched: false }] });
    expect((await f.service.answer(input)).evidence[0].applicability).toBe("historical_reference");
  });

  it("answers zero hits without reranking or padding references", async () => {
    const f = fixture([], { matches: [] }, "未找到相关知识资料；请提供当前报错原文。");
    const result = await f.service.answer(input);
    expect(result.evidence).toEqual([]);
    expect(result.answerMarkdown).not.toContain("参考资料");
    expect(f.client.createJsonCompletion).toHaveBeenCalledTimes(2);
  });

  it.each(["请参考[4]。", "请参考[1, 9]。", "[文档](https://invented.invalid)", "请参考[^unknown]。", "请参考[source-missing]。"]) ("rejects fabricated answer citations: %s", async (answer) => {
    await expect(fixture([candidate()], { matches: [match()] }, answer).service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_REFERENCE_INVALID" });
  });

  it("reports invalid model output and reader failures as separate stages", async () => {
    const f = fixture();
    f.client.createJsonCompletion.mockReset().mockResolvedValue({ content: "not-json", model: "test" });
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_OUTPUT_INVALID", diagnostic: { stage: "server.wiki_qa.extract" } });
    const readFailure = fixture();
    readFailure.reader.search.mockRejectedValue(new WikiQaError("WIKI_QA_UNAVAILABLE", "unavailable", { layer: "adapter", module: "wiki-knowledge-reader", stage: "server.wiki_qa.retrieve" }));
    await expect(readFailure.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_UNAVAILABLE", diagnostic: { actionRunId: input.actionRunId } });
    expect(readFailure.client.createJsonCompletion).toHaveBeenCalledTimes(1);
  });

  it("keeps existing redaction markers separate from source citations", async () => {
    const f = fixture([candidate()], { matches: [match()] }, "请核对 [REFERENCE] 的配置，再联系 [EMAIL]。[1]");
    await expect(f.service.answer(input)).resolves.toMatchObject({ answerMarkdown: expect.stringContaining("[EMAIL]。[1]") });
  });

  it("honors cancellation and model failure without returning a successful answer", async () => {
    const f = fixture();
    await expect(f.service.answer({ ...input, signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
    expect(f.client.createJsonCompletion).not.toHaveBeenCalled();
    f.client.createJsonCompletion.mockReset().mockRejectedValue(new Error("provider failed"));
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_MODEL_FAILED", diagnostic: { stage: "server.wiki_qa.extract" } });
  });
});
