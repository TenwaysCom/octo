import { describe, expect, it } from "vitest";

describe("acp-kimi dto", () => {
  it("accepts the first-turn popup contract with operatorLarkId and message", async () => {
    const { validateAcpKimiChatRequest } = await import(
      "../src/modules/acp-kimi/acp-kimi.dto.js"
    );

    expect(
      validateAcpKimiChatRequest({
        operatorLarkId: "ou_123",
        message: "请帮我总结当前会话。",
      }),
    ).toEqual({
      operatorLarkId: "ou_123",
      message: "请帮我总结当前会话。",
    });
  });

  it("rejects missing or empty first-turn fields", async () => {
    const { validateAcpKimiChatRequest } = await import(
      "../src/modules/acp-kimi/acp-kimi.dto.js"
    );

    expect(() => validateAcpKimiChatRequest({ message: "ok" })).toThrow(
      /operatorLarkId/i,
    );
    expect(() =>
      validateAcpKimiChatRequest({
        operatorLarkId: "",
        message: "ok",
      }),
    ).toThrow(/operatorLarkId|too_small/i);
    expect(() =>
      validateAcpKimiChatRequest({
        operatorLarkId: "ou_123",
        message: "",
      }),
    ).toThrow(/message|too_small/i);
  });
});
