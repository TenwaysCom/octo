import { createHash, randomUUID } from "node:crypto";

import { logger } from "../../logger.js";

const imLogger = logger.child({ module: "lark-im-notification-client" });

export type LarkImSendFailureKind = "retryable" | "uncertain" | "permanent";

/**
 * 明确失败（收到 Lark 错误响应）可有限重试；请求结果不确定（超时、连接中断）
 * 由消费方保存 outcome_unknown 待对账，不盲目重发。
 */
export class LarkImNotificationError extends Error {
  constructor(
    readonly kind: LarkImSendFailureKind,
    readonly errorCode: string,
    message: string,
    readonly statusCode?: number,
    readonly responseCode?: number,
  ) {
    super(message);
    this.name = "LarkImNotificationError";
  }
}

export interface LarkImNotificationClient {
  sendMessageToChat(input: { chatId: string; text: string; idempotencyKey?: string }): Promise<{ messageId: string }>;
}

export interface LarkImNotificationClientOptions {
  appId: string;
  appSecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type TenantTokenResponse = {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
};

type LarkMessageSendData = {
  message_id?: unknown;
};

type LarkEnvelope<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

export class LarkImNotificationClientImpl implements LarkImNotificationClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private tenantAccessToken?: { token: string; expiresAtMs: number };

  constructor(private readonly options: LarkImNotificationClientOptions) {
    this.baseUrl = options.baseUrl?.replace(/\/+$/, "") || "https://open.larksuite.com";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async sendMessageToChat(input: { chatId: string; text: string; idempotencyKey?: string }): Promise<{ messageId: string }> {
    const token = await this.getTenantAccessToken();
    const url = new URL("/open-apis/im/v1/messages", this.baseUrl);
    url.searchParams.set("receive_id_type", "chat_id");
    // Lark uuid 仅在一小时内去重；超出窗口的未知结果不可依赖它自动重发。
    const uuid = input.idempotencyKey
      ? createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 32)
      : randomUUID();

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uuid,
          receive_id: input.chatId,
          msg_type: "text",
          content: JSON.stringify({ text: input.text }),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new LarkImNotificationError(
        "uncertain",
        "LARK_IM_SEND_UNCERTAIN",
        "Lark 消息发送结果不确定（网络或超时）",
      );
    }

    const body = await readJson<LarkEnvelope<LarkMessageSendData>>(response);
    if (body.code === 230002) {
      throw new LarkImNotificationError(
        "permanent", "LARK_IM_NOT_IN_CHAT", "机器人不在目标群中，需先入群后再人工重试", response.status, body.code,
      );
    }
    if (!response.ok || body.code !== 0) {
      imLogger.warn({
        status: response.status,
        code: body.code,
      }, "LARK_IM_NOTIFICATION_SEND_FAILED");
      throw new LarkImNotificationError(
        "retryable",
        "LARK_IM_SEND_REJECTED",
        body.msg || `Lark message send failed: ${response.status}`,
        response.status,
        body.code,
      );
    }

    const messageId = typeof body.data?.message_id === "string" ? body.data.message_id : "";
    if (!messageId) {
      throw new LarkImNotificationError(
        "uncertain",
        "LARK_IM_SEND_MESSAGE_ID_MISSING",
        "Lark 消息发送未返回 message_id",
      );
    }
    return { messageId };
  }

  private async getTenantAccessToken(): Promise<string> {
    if (this.tenantAccessToken && this.tenantAccessToken.expiresAtMs > Date.now() + 60_000) {
      return this.tenantAccessToken.token;
    }

    const url = new URL("/open-apis/auth/v3/tenant_access_token/internal", this.baseUrl);
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: this.options.appId,
          app_secret: this.options.appSecret,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new LarkImNotificationError(
        "retryable",
        "LARK_TENANT_TOKEN_REQUEST_FAILED",
        "获取 Lark tenant access token 失败（网络或超时），消息尚未发送",
      );
    }

    const body = await readJson<TenantTokenResponse>(response);
    if (!response.ok || body.code !== 0 || !body.tenant_access_token) {
      imLogger.warn({ status: response.status, code: body.code }, "LARK_TENANT_TOKEN_REQUEST_FAILED");
      throw new LarkImNotificationError(
        "retryable",
        "LARK_TENANT_TOKEN_REQUEST_FAILED",
        body.msg || `Failed to get Lark tenant access token: ${response.status}`,
        response.status,
        body.code,
      );
    }

    this.tenantAccessToken = {
      token: body.tenant_access_token,
      expiresAtMs: Date.now() + Math.max((body.expire ?? 7200) - 60, 60) * 1000,
    };
    return body.tenant_access_token;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}
