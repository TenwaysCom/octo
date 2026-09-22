import { createWikiQaRerankClient } from "./wiki-qa-rerank-client.js";

const input = { query: "question", documents: ["first", "second", "third", "fourth"], topN: 3, prompt: "Return matching evidence IDs as JSON.", actionRunId: "rerank-run" };
const defaultUrl = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const customUrl = "https://model.example/v1/chat/completions";
const completion = (content = '{"matches":[]}', finishReason = "stop") => new Response(JSON.stringify({
  choices: [{ finish_reason: finishReason, message: { content } }],
}), { status: 200 });

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("wiki QA rerank client", () => {
  const dedicatedEnv = { WIKI_QA_RERANK_MODE: "rerank", WIKI_QA_RERANK_URL: "https://api.siliconflow.cn/v1/rerank", WIKI_QA_RERANK_MODEL: "BAAI/bge-reranker-v2-m3" };

  it.each(["general", "rerank"] as const)("logs actual %s request and response without authentication headers", async (mode) => {
    const diagnosticLog = vi.fn();
    const output = '{"results":[{"index":1,"relevance_score":0.8}]}';
    const fetchImpl = vi.fn().mockResolvedValue(mode === "rerank" ? new Response(output) : completion());
    const client = createWikiQaRerankClient({ env: { ...dedicatedEnv, WIKI_QA_RERANK_MODE: mode, WIKI_QA_RERANK_API_KEY: "private-key" }, fetchImpl, diagnosticLog });
    await client.rerank(input);
    expect(diagnosticLog).toHaveBeenCalledTimes(2);
    expect(diagnosticLog.mock.calls[0][0]).toMatchObject({ event: "input", mode, actionRunId: input.actionRunId, requestBody: fetchImpl.mock.calls[0][1].body });
    const response = diagnosticLog.mock.calls[1][0];
    expect(response).toMatchObject({ event: "output", mode, statusCode: 200, actionRunId: input.actionRunId });
    expect(JSON.parse(response.output)).toHaveProperty(mode === "rerank" ? "results" : "choices");
    expect(JSON.stringify(diagnosticLog.mock.calls)).not.toContain("private-key");
    expect(JSON.stringify(diagnosticLog.mock.calls)).not.toContain("Authorization");
  });

  it("retains invalid output and associates the validation failure", async () => {
    const diagnosticLog = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response("invalid-json"));
    await expect(createWikiQaRerankClient({ env: dedicatedEnv, fetchImpl, diagnosticLog }).rerank(input))
      .rejects.toMatchObject({ code: "WIKI_QA_RERANK_RESPONSE_INVALID" });
    expect(diagnosticLog.mock.calls.map(([entry]) => entry.event)).toEqual(["input", "output", "failed"]);
    expect(diagnosticLog.mock.calls[1][0].output).toBe("invalid-json");
    expect(diagnosticLog.mock.calls[2][0].errorCode).toBe("WIKI_QA_RERANK_RESPONSE_INVALID");
  });

  it("records failed HTTP status without raw error response bodies", async () => {
    const diagnosticLog = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response("private response", { status: 401 }));
    await expect(createWikiQaRerankClient({ env: dedicatedEnv, fetchImpl, diagnosticLog }).rerank(input))
      .rejects.toMatchObject({ code: "WIKI_QA_RERANK_REQUEST_FAILED" });
    expect(diagnosticLog.mock.calls.map(([entry]) => entry.event)).toEqual(["input", "failed"]);
    expect(diagnosticLog.mock.calls[1][0]).toMatchObject({ statusCode: 401, errorCode: "WIKI_QA_RERANK_REQUEST_FAILED" });
    expect(JSON.stringify(diagnosticLog.mock.calls)).not.toContain("private response");
  });

  it("uses the dedicated query/documents protocol and returns validated scores in rank order", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { index: 0, relevance_score: 0.3 }, { index: 2, relevance_score: 0.9 }, { index: 1, relevance_score: 0.3 },
    ] }), { status: 200 }));
    const result = await createWikiQaRerankClient({ env: { ...dedicatedEnv, WIKI_QA_RERANK_API_KEY: "dedicated-key" }, fetchImpl }).rerank(input);
    expect(result).toEqual({ mode: "rerank", model: dedicatedEnv.WIKI_QA_RERANK_MODEL, results: [
      { index: 2, relevance_score: 0.9 }, { index: 0, relevance_score: 0.3 }, { index: 1, relevance_score: 0.3 },
    ] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(dedicatedEnv.WIKI_QA_RERANK_URL);
    expect(init.headers.Authorization).toBe("Bearer dedicated-key");
    expect(JSON.parse(init.body)).toEqual({
      model: dedicatedEnv.WIKI_QA_RERANK_MODEL, query: input.query, documents: input.documents, top_n: 3, return_documents: false,
    });
    expect(init.redirect).toBe("error");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    { results: [{ index: 4, relevance_score: 1 }] },
    { results: [{ index: -1, relevance_score: 1 }] },
    { results: [{ index: 0.5, relevance_score: 1 }] },
    { results: [{ index: 0, relevance_score: 1 }, { index: 0, relevance_score: 0.5 }] },
    { results: [0, 1, 2, 3].map((index) => ({ index, relevance_score: 1 })) },
    { results: [{ index: 0, relevance_score: "0.8" }] },
    { results: [{ index: 0, relevance_score: null }] },
    { results: [{ index: 0 }] },
    { choices: [{ message: { content: "{}" } }] },
  ])("rejects invalid dedicated responses without silently changing protocol: %#", async (payload) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(createWikiQaRerankClient({ env: dedicatedEnv, fetchImpl }).rerank(input))
      .rejects.toMatchObject({ code: "WIKI_QA_RERANK_RESPONSE_INVALID" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("accepts an empty dedicated result without fabricating hits", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"results":[]}', { status: 200 }));
    await expect(createWikiQaRerankClient({ env: dedicatedEnv, fetchImpl }).rerank(input))
      .resolves.toMatchObject({ mode: "rerank", results: [] });
  });

  it.each([
    { WIKI_QA_RERANK_MODE: "unknown" },
    { WIKI_QA_RERANK_MODE: "" },
    { WIKI_QA_RERANK_MODE: "rerank" },
    { WIKI_QA_RERANK_MODE: "rerank", WIKI_QA_RERANK_URL: dedicatedEnv.WIKI_QA_RERANK_URL },
    { WIKI_QA_RERANK_MODE: "rerank", WIKI_QA_RERANK_MODEL: dedicatedEnv.WIKI_QA_RERANK_MODEL },
  ])("rejects an invalid mode or missing dedicated endpoint/model: %#", (env) => {
    expect(() => createWikiQaRerankClient({ env: { ZCODE_API_KEY: "unused-key", ...env } }))
      .toThrow(expect.objectContaining({ code: "WIKI_QA_RERANK_CONFIG_INVALID" }));
  });

  it("defaults to glm-5.3-flash and the ZCode key independently of the shared model", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion());
    const client = createWikiQaRerankClient({ env: {
      ZCODE_API_KEY: "zcode-test-key", LARK_TICKET_SUMMARY_PROVIDER: "deepseek", LARK_TICKET_SUMMARY_MODEL: "other-model",
    }, fetchImpl });
    await expect(client.rerank(input)).resolves.toEqual({ mode: "general", content: '{"matches":[]}', model: "glm-5.3-flash" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(defaultUrl);
    expect(init.headers.Authorization).toBe("Bearer zcode-test-key");
    expect(JSON.parse(init.body)).toMatchObject({ model: "glm-5.3-flash", messages: [
      { role: "system" }, { role: "user", content: input.prompt },
    ], response_format: { type: "json_object" } });
    expect(init.redirect).toBe("error");
  });

  it("uses the exact configured endpoint, model and dedicated credential", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion());
    await createWikiQaRerankClient({ env: {
      WIKI_QA_RERANK_URL: customUrl, WIKI_QA_RERANK_MODEL: "fast-ranker", WIKI_QA_RERANK_API_KEY: "dedicated-test-key",
      ZCODE_API_KEY: "must-not-use", DEEPSEEK_API_KEY: "must-not-use-either",
    }, fetchImpl }).rerank(input);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(customUrl);
    expect(init.headers.Authorization).toBe("Bearer dedicated-test-key");
    expect(JSON.parse(init.body).model).toBe("fast-ranker");
    expect(init.body).not.toContain("dedicated-test-key");
    expect(init.body).not.toContain("must-not-use");
  });

  it.each([undefined, ""])("does not send provider credentials to a custom no-auth endpoint: %s", async (key) => {
    const fetchImpl = vi.fn().mockResolvedValue(completion());
    await createWikiQaRerankClient({ env: {
      WIKI_QA_RERANK_URL: customUrl, WIKI_QA_RERANK_API_KEY: key, ZCODE_API_KEY: "must-not-leak",
    }, fetchImpl }).rerank(input);
    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });

  it.each([
    {},
    { ZCODE_API_KEY: "existing-key", WIKI_QA_RERANK_API_KEY: "" },
    { WIKI_QA_RERANK_URL: "" },
    { WIKI_QA_RERANK_URL: "invalid" },
    { WIKI_QA_RERANK_URL: "file:///private" },
    { WIKI_QA_RERANK_URL: "https://user:password@model.example/v1/chat/completions" },
    { WIKI_QA_RERANK_URL: customUrl, WIKI_QA_RERANK_MODEL: " " },
    { WIKI_QA_RERANK_URL: customUrl, WIKI_QA_RERANK_TIMEOUT_MS: "0" },
    { WIKI_QA_RERANK_URL: customUrl, WIKI_QA_RERANK_TIMEOUT_MS: "bad" },
    { WIKI_QA_RERANK_URL: customUrl, WIKI_QA_RERANK_TIMEOUT_MS: "2147483648" },
  ])("rejects invalid or unauthenticated default configuration before fetch: %#", (env) => {
    const fetchImpl = vi.fn();
    expect(() => createWikiQaRerankClient({ env, fetchImpl })).toThrow(expect.objectContaining({ code: "WIKI_QA_RERANK_CONFIG_INVALID" }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([429, 401, 503, 302])("normalizes HTTP %s without leaking response content or retrying", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("private provider response", { status }));
    const result = createWikiQaRerankClient({ env: { WIKI_QA_RERANK_URL: customUrl }, fetchImpl }).rerank(input);
    await expect(result).rejects.toMatchObject({ code: "WIKI_QA_RERANK_REQUEST_FAILED", statusCode: status });
    await expect(result).rejects.not.toThrow("private provider response");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["malformed", "empty", "truncated"])("rejects %s response", async (kind) => {
    const response = kind === "malformed" ? new Response("invalid-json", { status: 200 })
      : kind === "empty" ? completion("") : completion("{}", "length");
    const client = createWikiQaRerankClient({ env: { WIKI_QA_RERANK_URL: customUrl }, fetchImpl: vi.fn().mockResolvedValue(response) });
    await expect(client.rerank(input)).rejects.toMatchObject({ code: "WIKI_QA_RERANK_RESPONSE_INVALID" });
  });

  it.each([
    [{}, 60_000],
    [{ LARK_TICKET_SUMMARY_TIMEOUT_MS: "350000" }, 350_000],
    [{ LARK_TICKET_SUMMARY_TIMEOUT_MS: "350000", WIKI_QA_RERANK_TIMEOUT_MS: "5000" }, 5_000],
  ] as const)("preserves or explicitly overrides the timeout: %j", async (config, timeoutMs) => {
    vi.useFakeTimers();
    const timerSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimerSpy = vi.spyOn(globalThis, "clearTimeout");
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const result = createWikiQaRerankClient({ env: { WIKI_QA_RERANK_URL: customUrl, ...config }, fetchImpl }).rerank(input);
    const requestTimer = timerSpy.mock.results[0].value;
    const assertion = expect(result).rejects.toMatchObject({ code: "WIKI_QA_RERANK_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(timeoutMs - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(clearTimerSpy).toHaveBeenCalledWith(requestTimer);
  });

  it("honors cancellation before a request and during the response body", async () => {
    const fetchImpl = vi.fn();
    const client = createWikiQaRerankClient({ env: { WIKI_QA_RERANK_URL: customUrl }, fetchImpl });
    const abort = new AbortController();
    abort.abort(new Error("user cancelled"));
    await expect(client.rerank({ ...input, signal: abort.signal })).rejects.toThrow("user cancelled");
    expect(fetchImpl).not.toHaveBeenCalled();

    const active = new AbortController();
    fetchImpl.mockResolvedValue({ ok: true, status: 200, text: async () => {
      active.abort(new Error("cancelled while reading"));
      return JSON.stringify({ choices: [{ message: { content: "{}" } }] });
    } });
    await expect(client.rerank({ ...input, signal: active.signal })).rejects.toThrow("cancelled while reading");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
