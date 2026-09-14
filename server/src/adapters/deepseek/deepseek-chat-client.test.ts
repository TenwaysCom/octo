import { createDeepSeekChatClient } from "./deepseek-chat-client.js";

describe("DeepSeek chat client", () => {
  it("requests structured JSON from deepseek-v4-flash without exposing the key in the payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "deepseek-v4-flash",
      choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = createDeepSeekChatClient({ apiKey: "secret-key", fetchImpl });

    await expect(client.createJsonCompletion({ prompt: "return json", actionRunId: "run_1" }))
      .resolves.toEqual({ content: '{"ok":true}', model: "deepseek-v4-flash" });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer secret-key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    expect(init.body).not.toContain("secret-key");
  });

  it("fails before fetch when the API key is missing", async () => {
    const fetchImpl = vi.fn();
    const client = createDeepSeekChatClient({ apiKey: "", fetchImpl });
    await expect(client.createJsonCompletion({ prompt: "return json", actionRunId: "run_1" }))
      .rejects.toMatchObject({ code: "DEEPSEEK_API_KEY_MISSING" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes non-success responses without returning their body", async () => {
    const client = createDeepSeekChatClient({
      apiKey: "secret-key",
      fetchImpl: vi.fn().mockResolvedValue(new Response("provider details", { status: 429 })),
    });
    await expect(client.createJsonCompletion({ prompt: "return json", actionRunId: "run_1" }))
      .rejects.toMatchObject({ code: "DEEPSEEK_REQUEST_FAILED", statusCode: 429 });
  });

  it("rejects empty or truncated completions", async () => {
    const client = createDeepSeekChatClient({
      apiKey: "secret-key",
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: "{}" } }],
      }), { status: 200 })),
    });
    await expect(client.createJsonCompletion({ prompt: "return json", actionRunId: "run_1" }))
      .rejects.toMatchObject({ code: "DEEPSEEK_RESPONSE_INVALID" });
  });

  it("normalizes request timeouts", async () => {
    const fetchImpl = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const client = createDeepSeekChatClient({ apiKey: "secret-key", timeoutMs: 1, fetchImpl });

    await expect(client.createJsonCompletion({ prompt: "return json", actionRunId: "run_timeout" }))
      .rejects.toMatchObject({ code: "DEEPSEEK_TIMEOUT" });
  });
});
