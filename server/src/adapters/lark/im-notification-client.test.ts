import { createHash } from "node:crypto";
import { LarkImNotificationClientImpl, LarkImNotificationError } from "./im-notification-client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function createFetchImpl(sendResponse: Response | Error) {
  const sendImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
    if (sendResponse instanceof Error) {
      throw sendResponse;
    }
    return sendResponse;
  });
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes("tenant_access_token")) {
      return jsonResponse(200, { code: 0, tenant_access_token: "token-1", expire: 7200 });
    }
    return sendImpl(input, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, sendImpl };
}

describe("LarkImNotificationClientImpl", () => {
  it("sends a text message to the chat with an idempotency uuid", async () => {
    const { fetchImpl, sendImpl } = createFetchImpl(jsonResponse(200, { code: 0, data: { message_id: "om_1" } }));
    const client = new LarkImNotificationClientImpl({
      appId: "app",
      appSecret: "secret",
      baseUrl: "https://open.larksuite.com",
      fetchImpl,
    });

    await expect(client.sendMessageToChat({ chatId: "oc_1", text: "hello", idempotencyKey: "key-1" }))
      .resolves.toEqual({ messageId: "om_1" });

    const sendUrl = new URL(String(sendImpl.mock.calls[0][0]));
    expect(sendUrl.searchParams.get("receive_id_type")).toBe("chat_id");
    expect(sendUrl.searchParams.has("uuid")).toBe(false);
    expect(JSON.parse(String(sendImpl.mock.calls[0][1]?.body))).toMatchObject({
      uuid: createHash("sha256").update("key-1").digest("hex").slice(0, 32),
      receive_id: "oc_1",
      msg_type: "text",
      content: JSON.stringify({ text: "hello" }),
    });
  });

  it("maps a rejected send to a retryable typed error", async () => {
    const { fetchImpl } = createFetchImpl(jsonResponse(400, { code: 230001, msg: "bad chat" }));
    const client = new LarkImNotificationClientImpl({ appId: "app", appSecret: "secret", fetchImpl });

    await expect(client.sendMessageToChat({ chatId: "oc_missing", text: "hello" })).rejects.toMatchObject({
      name: "LarkImNotificationError",
      kind: "retryable",
      errorCode: "LARK_IM_SEND_REJECTED",
      responseCode: 230001,
    });
  });

  it("maps a timed-out send to an uncertain outcome", async () => {
    const { fetchImpl } = createFetchImpl(new Error("aborted"));
    const client = new LarkImNotificationClientImpl({ appId: "app", appSecret: "secret", fetchImpl });

    await expect(client.sendMessageToChat({ chatId: "oc_1", text: "hello" })).rejects.toMatchObject({
      name: "LarkImNotificationError",
      kind: "uncertain",
      errorCode: "LARK_IM_SEND_UNCERTAIN",
    });
  });

  it("treats a success envelope without message id as uncertain", async () => {
    const { fetchImpl } = createFetchImpl(jsonResponse(200, { code: 0, data: {} }));
    const client = new LarkImNotificationClientImpl({ appId: "app", appSecret: "secret", fetchImpl });

    await expect(client.sendMessageToChat({ chatId: "oc_1", text: "hello" })).rejects.toMatchObject({
      kind: "uncertain",
      errorCode: "LARK_IM_SEND_MESSAGE_ID_MISSING",
    });
  });
});

it("does not automatically retry when the bot is outside the target chat", async () => {
  const { fetchImpl } = createFetchImpl(jsonResponse(400, { code: 230002, msg: "Bot/User can NOT be out of the chat." }));
  const client = new LarkImNotificationClientImpl({ appId: "app", appSecret: "secret", fetchImpl });
  await expect(client.sendMessageToChat({ chatId: "oc_1", text: "hello" })).rejects.toMatchObject({
    kind: "permanent", errorCode: "LARK_IM_NOT_IN_CHAT", responseCode: 230002,
  });
});


it("retries token transport failures before attempting any message send", async () => {
  const fetchImpl = vi.fn()
    .mockRejectedValueOnce(new Error("token request timeout"))
    .mockResolvedValueOnce(jsonResponse(200, { code: 0, tenant_access_token: "token", expire: 7200 }))
    .mockResolvedValueOnce(jsonResponse(200, { code: 0, data: { message_id: "om_sent" } }));
  const client = new LarkImNotificationClientImpl({ appId: "app", appSecret: "secret", fetchImpl });
  const input = { chatId: "oc_1", text: "hello", idempotencyKey: "same-notification" };
  await expect(client.sendMessageToChat(input)).rejects.toMatchObject({
    kind: "retryable", errorCode: "LARK_TENANT_TOKEN_REQUEST_FAILED",
  });
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(String(fetchImpl.mock.calls[0][0])).toContain("tenant_access_token");
  await expect(client.sendMessageToChat(input)).resolves.toEqual({ messageId: "om_sent" });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});
