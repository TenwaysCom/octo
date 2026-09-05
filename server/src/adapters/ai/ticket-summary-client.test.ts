import {
  createTicketSummaryJsonCompletionClient,
  readTicketSummaryProvider,
} from "./ticket-summary-client.js";

describe("Ticket summary client", () => {
  it("selects ZCode and applies the shared model configuration", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "glm-5.3",
      choices: [{ finish_reason: "stop", message: { content: "{}" } }],
    }), { status: 200 }));
    const client = createTicketSummaryJsonCompletionClient({
      provider: "zcode",
      apiKey: "zcode-key",
      model: "glm-5.3",
      fetchImpl,
    });

    await client.createJsonCompletion({ prompt: "return json", actionRunId: "run_zcode" });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
    expect(JSON.parse(init.body).model).toBe("glm-5.3");
  });

  it("accepts DeepSeek and rejects invalid shared provider values", () => {
    expect(readTicketSummaryProvider("deepseek")).toBe("deepseek");
    expect(() => readTicketSummaryProvider("unsupported")).toThrow(
      "LARK_TICKET_SUMMARY_PROVIDER must be either deepseek or zcode.",
    );
  });
});
