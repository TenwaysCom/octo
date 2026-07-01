import { describe, expect, it, vi } from "vitest";
import { createKimiChatClient } from "./kimi-chat-client.js";

describe("kimi chat client", () => {
  it("sends master-user-id when opening the kimi event stream", async () => {
    const reader = {
      read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined }),
    };
    const body = {
      getReader: vi.fn(() => reader),
    } as unknown as ReadableStream<Uint8Array>;

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      body,
    } as Response);

    const client = createKimiChatClient({
      baseUrl: "http://localhost:3000",
      masterUserId: "usr_xxx",
    });

    await client.sendMessage({
      operatorLarkId: "ou_xxx",
      message: "hello",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/acp/kimi/chat",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "master-user-id": "usr_xxx",
        }),
      }),
    );
  });
});
