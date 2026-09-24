import { createZcodeChatClient } from "./zcode-chat-client.js";

describe("ZCode chat client", () => {
  for (const status of [200, 503]) {
    it(`uses and disposes a dedicated dispatcher for native fetch (${status})`, async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: "{}" } }],
      }), { status }));
      vi.stubGlobal("fetch", fetchImpl);
      try {
        const client = createZcodeChatClient({ apiKey: "test-key", timeoutMs: 350_000 });
        const result = client.createJsonCompletion({ prompt: "test", actionRunId: "transport-test" });
        if (status === 200) await expect(result).resolves.toMatchObject({ content: "{}" });
        else await expect(result).rejects.toMatchObject({ code: "ZCODE_REQUEST_FAILED" });
        const init = fetchImpl.mock.calls[0][1];
        expect(init.dispatcher.dispatch).toBeTypeOf("function");
        expect(init.dispatcher.destroyed).toBe(true);
        expect(init.signal).toBeInstanceOf(AbortSignal);
      } finally { vi.unstubAllGlobals(); }
    });
  }

  it("uses the 智谱 OpenAI-compatible endpoint for structured JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "glm-5.3",
      choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = createZcodeChatClient({ apiKey: "secret-key", model: "glm-5.3", fetchImpl });

    await expect(client.createJsonCompletion({ prompt: "return json", actionRunId: "run_1" }))
      .resolves.toEqual({ content: '{"ok":true}', model: "glm-5.3" });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer secret-key");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "glm-5.3",
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    expect(init.body).not.toContain("secret-key");
  });

  it("fails before fetch when the API key is missing", async () => {
    const fetchImpl = vi.fn();
    const client = createZcodeChatClient({ apiKey: "", fetchImpl });

    await expect(client.createJsonCompletion({ prompt: "return json", actionRunId: "run_1" }))
      .rejects.toMatchObject({ code: "ZCODE_API_KEY_MISSING" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes provider failures without returning their body", async () => {
    const client = createZcodeChatClient({
      apiKey: "secret-key",
      fetchImpl: vi.fn().mockResolvedValue(new Response("provider details", { status: 429 })),
    });

    await expect(client.createJsonCompletion({ prompt: "return json", actionRunId: "run_1" }))
      .rejects.toMatchObject({ code: "ZCODE_REQUEST_FAILED", statusCode: 429 });
  });

  it("rejects empty or truncated completions", async () => {
    const client = createZcodeChatClient({
      apiKey: "secret-key",
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: "{}" } }],
      }), { status: 200 })),
    });

    await expect(client.createJsonCompletion({ prompt: "return json", actionRunId: "run_1" }))
      .rejects.toMatchObject({ code: "ZCODE_RESPONSE_INVALID" });
  });

  it("normalizes request timeouts", async () => {
    const fetchImpl = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const client = createZcodeChatClient({ apiKey: "secret-key", timeoutMs: 1, fetchImpl });

    await expect(client.createJsonCompletion({ prompt: "return json", actionRunId: "run_timeout" }))
      .rejects.toMatchObject({ code: "ZCODE_TIMEOUT" });
  });
});

it("sends opt-in reasoning effort only to supported models and returns numeric telemetry", async () => {
  for (const model of ["glm-5.3-flash", "other-model"]) {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{}", reasoning_content: "private reasoning" } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, completion_tokens_details: { reasoning_tokens: 12 } },
    })));
    const result = await createZcodeChatClient({ apiKey: "secret", model, fetchImpl }).createJsonCompletion({ prompt: "test", actionRunId: "r", reasoningEffort: "low", collectDiagnostics: true });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).reasoning_effort).toBe(model === "glm-5.3-flash" ? "low" : undefined);
    expect(result.diagnostics).toMatchObject({ promptTokens: 100, completionTokens: 20, reasoningTokens: 12 });
    expect(result.diagnostics!.totalMs).toBeGreaterThanOrEqual(result.diagnostics!.responseHeadersMs);
    expect(JSON.stringify(result)).not.toContain("private reasoning");
  }
});
it("retains allowlisted transport codes for fetch and body failures without raw exceptions", async () => {
  for (const code of ["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "private-code"]) {
    const error = Object.assign(new Error("private response"), { cause: { code } });
    const fetchImpl = code === "UND_ERR_BODY_TIMEOUT"
      ? vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(error) })
      : vi.fn().mockRejectedValue(error);
    try {
      await createZcodeChatClient({ apiKey: "secret", fetchImpl }).createJsonCompletion({ prompt: "test", actionRunId: "r" });
      expect.unreachable();
    } catch (result) {
      expect(result).toMatchObject({ code: "ZCODE_REQUEST_FAILED", causeCode: code === "private-code" ? undefined : code });
      expect(String(result)).not.toContain("private response");
    }
  }
});
