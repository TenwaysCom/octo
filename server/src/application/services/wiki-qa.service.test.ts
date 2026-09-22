import { createWikiQaService } from "./wiki-qa.service.js";
import { WikiQaError, type WikiCandidate } from "../../domain/wiki-qa.js";
import { createWikiQaRerankClient } from "../../adapters/ai/wiki-qa-rerank-client.js";

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
    .mockResolvedValueOnce({ content: JSON.stringify({ answerMarkdown }), model: "test-model" }),
  };
  const rerankClient = { rerank: vi.fn().mockResolvedValue({ mode: "general", content: JSON.stringify(ranking), model: "rerank-model" }) };
  const promptStore = { getByKey: vi.fn().mockResolvedValue(undefined) };
  const extractLog = vi.fn();
  const answerLog = vi.fn();
  return { reader, client, rerankClient, promptStore, extractLog, answerLog, service: createWikiQaService({ reader, client, rerankClient, promptStore, extractLog, answerLog }) };
}

describe("wiki QA service", () => {
  it("emits ordered stage transitions before starting each operation", async () => {
    const f = fixture();
    const onProgress = vi.fn();
    f.reader.search.mockImplementation(async () => {
      expect(onProgress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "retrieve", status: "started" });
      return [candidate()];
    });
    await f.service.answer({ ...input, onProgress });
    expect(onProgress.mock.calls.map(([event]) => `${event.phase}:${event.status}`)).toEqual([
      "extract:started", "extract:completed", "retrieve:started", "retrieve:completed",
      "rerank:started", "rerank:completed", "evidence:started", "evidence:completed", "answer:started", "answer:completed",
    ]);
    expect(onProgress.mock.calls.every(([event]) => event.actionRunId === input.actionRunId && event.layer === "server" && event.module === "wiki-qa")).toBe(true);
    expect(onProgress.mock.calls[3][0].message).toContain("1 篇候选");
  });

  it("reports stage failure without later progress or exposing provider errors", async () => {
    const f = fixture();
    const onProgress = vi.fn();
    f.rerankClient.rerank.mockRejectedValue(new Error("private provider payload"));
    await expect(f.service.answer({ ...input, onProgress })).rejects.toMatchObject({ code: "WIKI_QA_MODEL_FAILED" });
    expect(onProgress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "rerank", status: "failed", errorCode: "WIKI_QA_MODEL_FAILED" });
    expect(onProgress.mock.calls.some(([event]) => event.phase === "answer")).toBe(false);
    expect(JSON.stringify(onProgress.mock.calls)).not.toContain("private provider payload");
  });

  it("does not report an answer as completed until its references pass validation", async () => {
    const f = fixture(undefined, undefined, "无效来源。[9]");
    const onProgress = vi.fn();
    await expect(f.service.answer({ ...input, onProgress })).rejects.toMatchObject({ code: "WIKI_QA_REFERENCE_INVALID" });
    expect(onProgress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "answer", status: "failed" });
    expect(onProgress.mock.calls.some(([event]) => event.phase === "answer" && event.status === "completed")).toBe(false);
  });

  it("reports cancellation instead of completion even if a dependency returns a late result", async () => {
    const f = fixture();
    const controller = new AbortController();
    const onProgress = vi.fn();
    f.reader.search.mockImplementation(async () => { controller.abort(); return [candidate()]; });
    await expect(f.service.answer({ ...input, signal: controller.signal, onProgress })).rejects.toMatchObject({ name: "AbortError" });
    expect(onProgress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "retrieve", status: "cancelled", errorCode: "ABORTED" });
  });

  it("skips unused ranking stages when retrieval returns no candidates", async () => {
    const f = fixture([], { matches: [] }, "未找到相关资料。");
    const onProgress = vi.fn();
    await f.service.answer({ ...input, onProgress });
    expect(onProgress.mock.calls.map(([event]) => `${event.phase}:${event.status}`)).toEqual([
      "extract:started", "extract:completed", "retrieve:started", "retrieve:completed", "answer:started", "answer:completed",
    ]);
  });

  it("logs only the rendered answer input and model output to the independent answer sink", async () => {
    const f = fixture();
    await f.service.answer(input);
    expect(f.answerLog).toHaveBeenCalledTimes(2);
    expect(f.answerLog.mock.calls[0][0]).toEqual({ event: "input", actionRunId: input.actionRunId,
      prompt: f.client.createJsonCompletion.mock.calls[1][0].prompt });
    expect(f.answerLog.mock.calls[1][0]).toMatchObject({ event: "output", actionRunId: input.actionRunId,
      model: "test-model", output: JSON.stringify({ answerMarkdown: "可以先核对 PL 报表的分组配置。[1]" }), valid: true });
  });

  it.each(["not-json", '{"answerMarkdown":42}'])("retains invalid answer output and records validation failure: %s", async (content) => {
    const f = fixture();
    f.client.createJsonCompletion.mockReset()
      .mockResolvedValueOnce({ content: JSON.stringify(extracted), model: "test-model" })
      .mockResolvedValueOnce({ content, model: "test-model" });
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_OUTPUT_INVALID" });
    expect(f.answerLog.mock.calls[1][0]).toMatchObject({ event: "output", output: content, valid: false });
    expect(f.answerLog.mock.calls[2][0]).toMatchObject({ event: "failed", errorCode: "WIKI_QA_OUTPUT_INVALID" });
  });

  it("records answer provider errors without exposing raw exceptions or inventing output", async () => {
    const f = fixture();
    f.client.createJsonCompletion.mockReset()
      .mockResolvedValueOnce({ content: JSON.stringify(extracted), model: "test-model" })
      .mockRejectedValueOnce(new Error("private-provider-error"));
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_MODEL_FAILED" });
    expect(f.answerLog.mock.calls.map(([event]) => event.event)).toEqual(["input", "failed"]);
    expect(JSON.stringify(f.answerLog.mock.calls)).not.toContain("private-provider-error");
  });

  it("distinguishes valid answer JSON from a later reference-validation failure", async () => {
    const f = fixture(undefined, undefined, "错误引用。[9]");
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_REFERENCE_INVALID" });
    expect(f.answerLog.mock.calls[1][0]).toMatchObject({ event: "output", valid: true });
    expect(f.answerLog.mock.calls[2][0]).toMatchObject({ event: "failed", errorCode: "WIKI_QA_REFERENCE_INVALID" });
  });

  it("logs the rendered extraction input and output, excluding rerank and answer", async () => {
    const f = fixture();
    await f.service.answer(input);
    expect(f.extractLog).toHaveBeenCalledTimes(2);
    expect(f.extractLog.mock.calls[0][0]).toEqual({ event: "input", actionRunId: input.actionRunId, prompt: f.client.createJsonCompletion.mock.calls[0][0].prompt });
    expect(f.extractLog.mock.calls[1][0]).toMatchObject({ event: "output", actionRunId: input.actionRunId, model: "test-model", output: JSON.stringify(extracted), valid: true });
  });

  it.each(["not-json", '{"question":123}'])("retains invalid extraction output: %s", async (content) => {
    const f = fixture();
    f.client.createJsonCompletion.mockReset().mockResolvedValue({ content, model: "test" });
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_OUTPUT_INVALID" });
    expect(f.extractLog.mock.calls[1][0]).toMatchObject({ event: "output", output: content, valid: false });
  });

  it("records model failure without logging raw exceptions or inventing output", async () => {
    const f = fixture();
    f.client.createJsonCompletion.mockReset().mockRejectedValue(new Error("private payload"));
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_MODEL_FAILED" });
    expect(f.extractLog).toHaveBeenCalledTimes(2);
    expect(f.extractLog.mock.calls[1][0]).toMatchObject({ event: "failed", errorCode: "WIKI_QA_MODEL_FAILED" });
    expect(JSON.stringify(f.extractLog.mock.calls)).not.toContain("private payload");
  });

  it("extracts bilingual search terms, ranks three unique pages and supplies numbered evidence to the answer", async () => {
    const f = fixture([candidate(), candidate("wiki-2"), candidate("wiki-3"), candidate("wiki-4")], { matches: [match("wiki-3"), match(), match("wiki-2")] });
    const result = await f.service.answer(input);
    expect(f.reader.search).toHaveBeenCalledWith({ ...extracted, signal: undefined });
    expect(result.evidence.map((hit) => hit.path)).toEqual(["concepts/faq/wiki-3.md", "concepts/faq/wiki-1.md", "concepts/faq/wiki-2.md"]);
    expect(result.evidence.map((hit) => hit.sourceId)).toEqual([1, 2, 3]);
    expect(result.answerMarkdown).toContain("草稿");
    expect(result.answerMarkdown).toContain("来源：docs/llm-wiki/concepts/faq/wiki-3.md");
    expect(f.client.createJsonCompletion.mock.calls[1][0].prompt).toContain('"sourceId":1');
    expect(f.client.createJsonCompletion).toHaveBeenCalledTimes(2);
    expect(f.rerankClient.rerank).toHaveBeenCalledTimes(1);
    expect(f.rerankClient.rerank).toHaveBeenCalledWith(expect.objectContaining({ actionRunId: input.actionRunId }));
    expect(f.client.createJsonCompletion.mock.calls.every(([request]) => request.actionRunId === input.actionRunId && !('tools' in request))).toBe(true);
    expect(f.promptStore.getByKey.mock.calls.flat()).toEqual(["lark_ticket.wiki_qa.extract", "lark_ticket.wiki_qa.rerank", "lark_ticket.wiki_qa.answer"]);
  });

  it("reranks all ten recalled bundles and supplies only the selected three to the answer", async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => candidate(`wiki-${i + 1}`));
    const f = fixture(candidates, { matches: [match("wiki-10"), match("wiki-5"), match("wiki-7")] });
    const result = await f.service.answer(input);
    const prompt = f.rerankClient.rerank.mock.calls[0][0].prompt;
    const sent = JSON.parse(prompt.split("candidates：")[1]);
    expect(sent).toEqual(candidates);
    expect(f.rerankClient.rerank.mock.calls[0][0].topN).toBe(5);
    expect(result.evidence.map((item) => item.path)).toEqual([candidates[9].path, candidates[4].path, candidates[6].path]);
    const answerPrompt = f.client.createJsonCompletion.mock.calls[1][0].prompt;
    for (const index of [9, 4, 6]) expect(answerPrompt).toContain(candidates[index].path);
    for (const index of [0, 1, 2, 3, 5, 7, 8]) expect(answerPrompt).not.toContain(candidates[index].path);
    expect(f.client.createJsonCompletion.mock.calls[0][0].prompt).toContain(input.ticketContext);
    expect(f.client.createJsonCompletion.mock.calls[1][0].prompt).toContain(input.ticketContext);
  });

  it("rejects candidates that were not included in the rerank request", async () => {
    const f = fixture(Array.from({ length: 10 }, (_, i) => candidate(`wiki-${i + 1}`)), { matches: [match("wiki-11")] });
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_REFERENCE_INVALID" });
    expect(f.client.createJsonCompletion).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to the shared model after a rerank failure", async () => {
    const f = fixture();
    f.rerankClient.rerank.mockRejectedValue(new Error("rerank unavailable"));
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_MODEL_FAILED", diagnostic: { stage: "server.wiki_qa.rerank" } });
    expect(f.client.createJsonCompletion).toHaveBeenCalledTimes(1);
    expect(f.rerankClient.rerank).toHaveBeenCalledTimes(1);
  });

  it("wires environment overrides only into reranking, keeping the extraction and answer client", async () => {
    const f = fixture();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ matches: [match()] }) }, finish_reason: "stop" }],
    }), { status: 200 }));
    vi.stubEnv("WIKI_QA_RERANK_MODE", "general");
    vi.stubEnv("WIKI_QA_RERANK_URL", "https://ranker.example/v1/chat/completions");
    vi.stubEnv("WIKI_QA_RERANK_MODEL", "independent-ranker");
    vi.stubEnv("WIKI_QA_RERANK_API_KEY", "ranker-test-key");
    vi.stubEnv("WIKI_QA_RERANK_TIMEOUT_MS", "60000");
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const service = createWikiQaService({ reader: f.reader, client: f.client, promptStore: f.promptStore });
      const result = await service.answer(input);
      expect(result.evidence).toHaveLength(1);
      expect(f.client.createJsonCompletion).toHaveBeenCalledTimes(2);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0][0]).toBe("https://ranker.example/v1/chat/completions");
      expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe("independent-ranker");
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("maps dedicated scores across all ten bundles without claiming verified applicability", async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => candidate(`wiki-${i + 1}`));
    const f = fixture(candidates);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { index: 4, relevance_score: 0.75 }, { index: 9, relevance_score: 0.9 },
    ] }), { status: 200 }));
    const rerankClient = createWikiQaRerankClient({ env: {
      WIKI_QA_RERANK_MODE: "rerank", WIKI_QA_RERANK_URL: "https://ranker.example/v1/rerank", WIKI_QA_RERANK_MODEL: "bge",
    }, fetchImpl });
    const service = createWikiQaService({ reader: f.reader, client: f.client, promptStore: f.promptStore, rerankClient });
    const result = await service.answer(input);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.query).toBe(extracted.question);
    expect(body.documents.map((document: string) => JSON.parse(document))).toEqual(candidates.map(({ title, environments, content }) => ({ title, environments, content })));
    expect(body.documents.join("\n")).not.toContain("sourceEvidence");
    expect(body.documents.join("\n")).not.toContain("核对分组后显示");
    expect(body.top_n).toBe(5);
    expect(result.evidence.map((item) => item.path)).toEqual([candidates[9].path, candidates[4].path]);
    expect(result.evidence.map((item) => item.sourceId)).toEqual([1, 2]);
    expect(result.evidence.every((item) => item.applicability === "historical_reference")).toBe(true);
    expect(result.evidence[0].sourceEvidence).toEqual(candidates[9].sourceEvidence);
    expect(result.evidence[0].limitations).toContain("专用重排仅评估相关性，原始证据与处理前提尚未逐项核验");
    expect(f.client.createJsonCompletion.mock.calls[1][0].prompt).toContain("historical_reference");
    expect(f.client.createJsonCompletion).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps source links on the server while sending readable knowledge to dedicated rerank", async () => {
    const page = { ...candidate(), content: "核对配置：[处理说明](../../raw/transcripts/ticket-1.md)" };
    const f = fixture([page]);
    await f.service.answer(input);
    const document = JSON.parse(f.rerankClient.rerank.mock.calls[0][0].documents[0]);
    expect(document).toEqual({ title: page.title, environments: page.environments, content: "核对配置：处理说明" });
    expect(f.rerankClient.rerank.mock.calls[0][0].prompt).toContain("raw/transcripts/ticket-1.md");
    expect(f.client.createJsonCompletion.mock.calls[1][0].prompt).toContain("raw/transcripts/ticket-1.md");
  });

  it("keeps the no-evidence answer flow when dedicated reranking returns no results", async () => {
    const f = fixture([candidate()], { matches: [] }, "没有足够的相关资料，请提供当前报错。");
    f.rerankClient.rerank.mockResolvedValue({ mode: "rerank", model: "bge", results: [] });
    const result = await f.service.answer(input);
    expect(result.evidence).toEqual([]);
    expect(result.answerMarkdown).not.toContain("参考资料");
    expect(f.client.createJsonCompletion).toHaveBeenCalledTimes(2);
  });

  it("selects original evidence only after reranking and passes the selected snippets to the answer", async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => candidate(`wiki-${i + 1}`));
    const f = fixture(candidates, { matches: [match("wiki-10")] });
    const source = { ...candidates[9].sourceEvidence[0], content: "M12\nPL 报表配置缺失。\n\nM21\n纠正：尚未验证完成。" };
    const selectEvidence = vi.fn().mockImplementation(() => {
      expect(f.rerankClient.rerank).toHaveBeenCalledTimes(1);
      return [source];
    });
    const service = createWikiQaService({ reader: { ...f.reader, selectEvidence }, client: f.client, rerankClient: f.rerankClient, promptStore: f.promptStore });
    const result = await service.answer(input);
    expect(selectEvidence).toHaveBeenCalledExactlyOnceWith({ candidate: candidates[9], question: extracted,
      evidenceIds: [source.id], signal: undefined });
    expect(result.evidence[0].sourceEvidence).toEqual([source]);
    expect(f.client.createJsonCompletion.mock.calls[1][0].prompt).toContain("M21");
    expect(f.client.createJsonCompletion.mock.calls[1][0].prompt).not.toContain("核对分组后显示");
  });

  it("demotes an applicable result if original evidence cannot be safely excerpted", async () => {
    const f = fixture();
    const service = createWikiQaService({ reader: { ...f.reader, selectEvidence: () => [] }, client: f.client,
      rerankClient: f.rerankClient, promptStore: f.promptStore });
    const result = await service.answer(input);
    expect(result.evidence[0]).toMatchObject({ applicability: "historical_reference", sourceEvidence: [] });
    expect(result.evidence[0].limitations).toContain("未找到支撑当前判断的原始证据");
  });

  it.each([
    { matches: [match("invented")] },
    { matches: [match(), match()] },
    { matches: [{ ...match(), evidenceIds: ["invented-source"] }] },
    { matches: [{ ...match(), evidenceIds: ["wiki-1-source-1", "wiki-1-source-1"] }] },
  ])("rejects invalid references instead of fabricating evidence", async (ranking) => {
    const f = fixture([candidate()], ranking);
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_REFERENCE_INVALID" });
    expect(f.client.createJsonCompletion).toHaveBeenCalledTimes(1);
    expect(f.rerankClient.rerank).toHaveBeenCalledTimes(1);
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
    expect(f.client.createJsonCompletion.mock.calls[1][0].prompt).toContain("与 wiki-1 冲突");
  });

  it("does not forward unrelated branches from a multi-incident wiki page", async () => {
    const page = { ...candidate(), content: "---\nsources: [raw/transcripts/ticket-1.md]\n---\n# 财务知识\n- PL 分组为空时核对配置 [ticket-1](../../raw/transcripts/ticket-1.md)。\n- 权益科目不结转属于另一个问题 [ticket-2](../../raw/transcripts/ticket-2.md)。" };
    const f = fixture([page]);
    const result = await f.service.answer(input);
    expect(result.evidence[0].content).toContain("PL 分组");
    expect(result.evidence[0].content).not.toContain("权益科目");
    expect(f.client.createJsonCompletion.mock.calls[1][0].prompt).not.toContain("权益科目");
  });

  it("retains prerequisites with selected wiki claims and supports pages with frontmatter-only source links", async () => {
    const page = { ...candidate(), content: "## 报表\n只有确认配置缺失才适用。\n\nPL 分组检查 [证据](raw/transcripts/ticket-1.md)\n\n尚未确认时不能修改。\n## 库存\n其他事故 [证据](raw/transcripts/ticket-2.md)" };
    const result = await fixture([page]).service.answer(input);
    expect(result.evidence[0].content).toContain("只有确认配置缺失");
    expect(result.evidence[0].content).toContain("尚未确认时不能修改");
    expect(result.evidence[0].content).not.toContain("其他事故");
    expect((await fixture().service.answer(input)).evidence[0].content).toContain("核对 PL 报表分组配置");
  });

  it("demotes a model's applicable label when treatment prerequisites are unconfirmed", async () => {
    const f = fixture([candidate()], { matches: [{ ...match(), conditionsMatched: false }] });
    expect((await f.service.answer(input)).evidence[0].applicability).toBe("historical_reference");
  });

  it("answers zero hits without reranking or padding references", async () => {
    const f = fixture([], { matches: [] }, "未找到相关知识资料；请提供当前报错原文。");
    const result = await f.service.answer(input);
    expect(f.rerankClient.rerank).not.toHaveBeenCalled();
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

it("filters unsupported error cards and assigns consecutive citation IDs", async () => {
  const unrelated = { ...candidate("wiki-1"), content: "claim server error" };
  const supported = { ...candidate("wiki-2"), content: "NotFoundError: insertBefore fails" };
  const f = fixture([unrelated, supported], { matches: [match("wiki-1"), match("wiki-2")] });
  f.client.createJsonCompletion.mockReset().mockResolvedValueOnce({ content: JSON.stringify({ ...extracted, question: "OwlError Caused by: NotFoundError" }), model: "test" });
  const result = await f.service.retrieve(input);
  expect(result.evidence.map((item) => [item.path, item.sourceId])).toEqual([[supported.path, 1]]);
});
it("allows zero supporting cards and shares extraction and answer reasoning effort", async () => {
  const f = fixture(undefined, undefined, "没有对应错误的资料。");
  f.client.createJsonCompletion.mockReset()
    .mockResolvedValueOnce({ content: JSON.stringify({ ...extracted, question: "NotFoundError: insertBefore" }), model: "test" })
    .mockResolvedValueOnce({ content: JSON.stringify({ answerMarkdown: "没有对应错误的资料。" }), model: "test", diagnostics: { responseHeadersMs: 1, totalMs: 2, promptTokens: 100 } });
  const result = await f.service.answer({ ...input, answerContext: "compact current issue" });
  expect(result.evidence).toEqual([]);
  expect(f.client.createJsonCompletion.mock.calls[0][0]).toMatchObject({ reasoningEffort: "low" });
  expect(f.client.createJsonCompletion.mock.calls[1][0]).toMatchObject({ reasoningEffort: "low", collectDiagnostics: true });
  expect(f.client.createJsonCompletion.mock.calls[1][0].prompt).toContain("compact current issue");
  expect(f.answerLog.mock.calls[1][0].diagnostics).toMatchObject({ promptTokens: 100 });
});

it.each(["low", "high", "max", "provider"])("shares configured %s effort between extraction and answer", async (effort) => {
  vi.stubEnv("WIKI_QA_ANSWER_REASONING_EFFORT", effort);
  try {
    const f = fixture();
    await f.service.answer(input);
    for (const [call] of f.client.createJsonCompletion.mock.calls) {
      expect(call.reasoningEffort).toBe(effort === "provider" ? undefined : effort);
    }
    expect(f.rerankClient.rerank.mock.calls[0][0]).not.toHaveProperty("reasoningEffort");
  } finally { vi.unstubAllEnvs(); }
});

it("deduplicates keywords before limiting to 20 and keeps raw extraction output in logs", async () => {
  const f = fixture([], { matches: [] });
  const keywords = [" report ", "REPORT", "报表", ...Array.from({ length: 21 }, (_, i) => `keyword-${i}`)];
  const output = JSON.stringify({ ...extracted, keywords });
  f.client.createJsonCompletion.mockReset().mockResolvedValueOnce({ content: output, model: "test" });
  await f.service.retrieve(input);
  expect(f.reader.search.mock.calls[0][0].keywords).toEqual(["report", "报表", ...Array.from({ length: 18 }, (_, i) => `keyword-${i}`)]);
  expect(f.extractLog.mock.calls[1][0]).toMatchObject({ output, valid: true });
});
it.each([42, " ", "x".repeat(121)])("rejects invalid keywords even beyond the first 20: %s", async (invalid) => {
  const f = fixture();
  const keywords = [...Array.from({ length: 20 }, (_, i) => `keyword-${i}`), invalid];
  f.client.createJsonCompletion.mockReset().mockResolvedValueOnce({ content: JSON.stringify({ ...extracted, keywords }), model: "test" });
  await expect(f.service.retrieve(input)).rejects.toMatchObject({ code: "WIKI_QA_OUTPUT_INVALID" });
  expect(f.reader.search).not.toHaveBeenCalled();
});

it.each(["general", "rerank"])("uses ranks four and five after relevance filtering in %s mode", async (mode) => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({ ...candidate(`wiki-${i + 1}`),
    content: i === 0 || i === 2 ? "generic server error" : "NotFoundError: insertBefore" }));
  const f = fixture(candidates, { matches: candidates.slice(0, 5).map((item) => match(item.id)) });
  if (mode === "rerank") f.rerankClient.rerank.mockResolvedValue({ mode: "rerank", model: "bge", results: candidates.slice(0, 5).map((_, index) => ({ index, relevance_score: 1 - index / 20 })) });
  f.client.createJsonCompletion.mockReset()
    .mockResolvedValueOnce({ content: JSON.stringify({ ...extracted, question: "NotFoundError: insertBefore" }), model: "test" })
    .mockResolvedValueOnce({ content: JSON.stringify({ answerMarkdown: "历史参考。[1][2][3]" }), model: "test" });
  const result = await f.service.answer(input);
  expect(f.rerankClient.rerank.mock.calls[0][0]).toMatchObject({ topN: 5 });
  expect(result.evidence.map((item) => item.path)).toEqual([candidates[1].path, candidates[3].path, candidates[4].path]);
  expect(result.evidence.map((item) => item.sourceId)).toEqual([1, 2, 3]);
  const prompt = f.client.createJsonCompletion.mock.calls[1][0].prompt;
  for (const i of [0, 2, 5, 6, 7, 8, 9]) expect(prompt).not.toContain(candidates[i].path);
});
it("caps five relevant ranked cards at three answer sources", async () => {
  const candidates = Array.from({ length: 5 }, (_, i) => candidate(`wiki-${i + 1}`));
  const f = fixture(candidates, { matches: candidates.map((item) => match(item.id)) });
  const result = await f.service.answer(input);
  expect(result.evidence.map((item) => item.path)).toEqual(candidates.slice(0, 3).map((item) => item.path));
  expect(f.client.createJsonCompletion.mock.calls[1][0].prompt).not.toContain(candidates[3].path);
});
it("still validates the fifth ranked reference before limiting answer sources", async () => {
  const candidates = Array.from({ length: 5 }, (_, i) => candidate(`wiki-${i + 1}`));
  const f = fixture(candidates, { matches: [...candidates.slice(0, 4).map((item) => match(item.id)), match("invented")] });
  await expect(f.service.retrieve(input)).rejects.toMatchObject({ code: "WIKI_QA_REFERENCE_INVALID" });
});

it.each([
  { configured: "", scores: [0.9, 0.7, 0.6999], kept: [0, 1] },
  { configured: "0.8", scores: [0.9, 0.8, 0.79], kept: [0, 1] },
  { configured: "0.7", scores: [0.69, 0.4, 0.1], kept: [] },
  { configured: "0", scores: [0.5, 0.1, 0], kept: [0, 1, 2] },
])("applies minimum score before answering: %j", async ({ configured, scores, kept }) => {
  vi.stubEnv("WIKI_QA_RERANK_MIN_SCORE", configured);
  try {
    const candidates = scores.map((_, index) => candidate(`wiki-${index + 1}`));
    const f = fixture(candidates, undefined, kept.length ? "参考资料。[1]" : "未找到相关资料。");
    f.rerankClient.rerank.mockResolvedValue({ mode: "rerank", model: "bge", results: scores.map((relevance_score, index) => ({ index, relevance_score })) });
    const result = await f.service.answer(input);
    expect(result.evidence.map((item) => item.path)).toEqual(kept.map((index) => candidates[index].path));
    expect(result.evidence.map((item) => item.sourceId)).toEqual(kept.map((_, index) => index + 1));
  } finally { vi.unstubAllEnvs(); }
});
it.each(["invalid", "-0.1", "1.1", "Infinity"])("rejects invalid minimum score %s", async (configured) => {
  vi.stubEnv("WIKI_QA_RERANK_MIN_SCORE", configured);
  try {
    const f = fixture();
    f.rerankClient.rerank.mockResolvedValue({ mode: "rerank", model: "bge", results: [{ index: 0, relevance_score: 0.9 }] });
    await expect(f.service.answer(input)).rejects.toMatchObject({ code: "WIKI_QA_MODEL_FAILED" });
    expect(f.client.createJsonCompletion).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllEnvs(); }
});
it("does not apply dedicated score configuration to general reranking", async () => {
  vi.stubEnv("WIKI_QA_RERANK_MIN_SCORE", "invalid");
  try {
    const f = fixture();
    expect((await f.service.answer(input)).evidence).toHaveLength(1);
  } finally { vi.unstubAllEnvs(); }
});
