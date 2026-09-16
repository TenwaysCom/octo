import { createZcodeChatClient } from "./zcode-chat-client.js";

describe("ZCode chat client", () => {
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
