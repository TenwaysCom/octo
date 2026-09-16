import type { JsonCompletionClient } from "../ai/json-completion-client.js";
import { logger } from "../../logger.js";

const zcodeLogger = logger.child({ module: "zcode-chat-client" });

export type ZcodeChatErrorCode =
  | "ZCODE_API_KEY_MISSING"
  | "ZCODE_TIMEOUT"
  | "ZCODE_REQUEST_FAILED"
  | "ZCODE_RESPONSE_INVALID";

export class ZcodeChatError extends Error {
  constructor(
    readonly code: ZcodeChatErrorCode,
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ZcodeChatError";
  }
}

export type ZcodeJsonCompletionClient = JsonCompletionClient;

export interface ZcodeChatClientDeps {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL = "glm-5.3";
const DEFAULT_TIMEOUT_MS = 60_000;
const ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

export function createZcodeChatClient(
  deps: ZcodeChatClientDeps = {},
): ZcodeJsonCompletionClient {
  const apiKey = deps.apiKey ?? process.env.ZCODE_API_KEY?.trim();
  const model = deps.model ?? (process.env.LARK_TICKET_SUMMARY_MODEL?.trim() || DEFAULT_MODEL);
  const timeoutMs = deps.timeoutMs ?? readPositiveInt(
    process.env.LARK_TICKET_SUMMARY_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    async createJsonCompletion(input) {
      const baseLog = {
        provider: "zcode",
        model,
        actionRunId: input.actionRunId,
        layer: "adapter",
      };
      if (!apiKey) {
        zcodeLogger.warn({ ...baseLog, durationMs: 0, stage: "adapter.zcode.config", errorCode: "ZCODE_API_KEY_MISSING" }, "ZCODE_API_KEY_MISSING");
        throw new ZcodeChatError("ZCODE_API_KEY_MISSING", "ZCode API key is not configured.");
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (input.signal?.aborted) {
        abort();
      } else {
        input.signal?.addEventListener("abort", abort, { once: true });
      }
      const timeoutId = globalThis.setTimeout(abort, timeoutMs);
      const startedAt = Date.now();
      try {
        const response = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: "Return only a valid JSON object that conforms to the requested schema.",
              },
              { role: "user", content: input.prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
          }),
          signal: controller.signal,
        });
        const durationMs = Date.now() - startedAt;
        if (!response.ok) {
          zcodeLogger.warn({ ...baseLog, statusCode: response.status, durationMs, stage: "adapter.zcode.response", errorCode: "ZCODE_REQUEST_FAILED" }, "ZCODE_REQUEST_FAILED");
          throw new ZcodeChatError("ZCODE_REQUEST_FAILED", `ZCode request failed with status ${response.status}.`, response.status);
        }
        const data = await response.json().catch(() => undefined) as {
          model?: unknown;
          choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
        } | undefined;
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim() || data?.choices?.[0]?.finish_reason === "length") {
          zcodeLogger.warn({ ...baseLog, statusCode: response.status, durationMs, stage: "adapter.zcode.response", errorCode: "ZCODE_RESPONSE_INVALID" }, "ZCODE_RESPONSE_INVALID");
          throw new ZcodeChatError("ZCODE_RESPONSE_INVALID", "ZCode returned an empty or truncated completion.");
        }
        const responseModel = typeof data?.model === "string" ? data.model : model;
        zcodeLogger.info({ ...baseLog, model: responseModel, statusCode: response.status, durationMs, stage: "adapter.zcode.completed" }, "ZCODE_COMPLETION_COMPLETED");
        return { content: content.trim(), model: responseModel };
      } catch (error) {
        if (error instanceof ZcodeChatError) {
          throw error;
        }
        const durationMs = Date.now() - startedAt;
        if (controller.signal.aborted) {
          zcodeLogger.warn({ ...baseLog, durationMs, stage: "adapter.zcode.timeout", errorCode: "ZCODE_TIMEOUT" }, "ZCODE_TIMEOUT");
          throw new ZcodeChatError("ZCODE_TIMEOUT", `ZCode request timed out after ${timeoutMs}ms.`);
        }
        zcodeLogger.warn({ ...baseLog, durationMs, stage: "adapter.zcode.request", errorCode: "ZCODE_REQUEST_FAILED" }, "ZCODE_REQUEST_FAILED");
        throw new ZcodeChatError("ZCODE_REQUEST_FAILED", "ZCode request failed before a valid response was received.");
      } finally {
        globalThis.clearTimeout(timeoutId);
        input.signal?.removeEventListener("abort", abort);
      }
    },
  };
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
