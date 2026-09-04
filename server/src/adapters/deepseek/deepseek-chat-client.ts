import { logger } from "../../logger.js";

const deepSeekLogger = logger.child({ module: "deepseek-chat-client" });

export type DeepSeekChatErrorCode =
  | "DEEPSEEK_API_KEY_MISSING"
  | "DEEPSEEK_TIMEOUT"
  | "DEEPSEEK_REQUEST_FAILED"
  | "DEEPSEEK_RESPONSE_INVALID";

export class DeepSeekChatError extends Error {
  constructor(
    readonly code: DeepSeekChatErrorCode,
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "DeepSeekChatError";
  }
}

export interface DeepSeekJsonCompletionClient {
  createJsonCompletion(input: {
    prompt: string;
    actionRunId: string;
    signal?: AbortSignal;
  }): Promise<{ content: string; model: string }>;
}

export interface DeepSeekChatClientDeps {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 60_000;
const ENDPOINT = "https://api.deepseek.com/chat/completions";

export function createDeepSeekChatClient(
  deps: DeepSeekChatClientDeps = {},
): DeepSeekJsonCompletionClient {
  const apiKey = deps.apiKey ?? process.env.DEEPSEEK_API_KEY?.trim();
  const model = deps.model ?? (process.env.DEEPSEEK_LARK_TICKET_SUMMARY_MODEL?.trim() || DEFAULT_MODEL);
  const timeoutMs = deps.timeoutMs ?? readPositiveInt(
    process.env.DEEPSEEK_LARK_TICKET_SUMMARY_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    async createJsonCompletion(input) {
      const baseLog = {
        provider: "deepseek",
        model,
        actionRunId: input.actionRunId,
        layer: "adapter",
      };
      if (!apiKey) {
        deepSeekLogger.warn({ ...baseLog, durationMs: 0, stage: "adapter.deepseek.config", errorCode: "DEEPSEEK_API_KEY_MISSING" }, "DEEPSEEK_API_KEY_MISSING");
        throw new DeepSeekChatError("DEEPSEEK_API_KEY_MISSING", "DeepSeek API key is not configured.");
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
          deepSeekLogger.warn({ ...baseLog, statusCode: response.status, durationMs, stage: "adapter.deepseek.response", errorCode: "DEEPSEEK_REQUEST_FAILED" }, "DEEPSEEK_REQUEST_FAILED");
          throw new DeepSeekChatError("DEEPSEEK_REQUEST_FAILED", `DeepSeek request failed with status ${response.status}.`, response.status);
        }
        const data = await response.json().catch(() => undefined) as {
          model?: unknown;
          choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
        } | undefined;
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim() || data?.choices?.[0]?.finish_reason === "length") {
          deepSeekLogger.warn({ ...baseLog, statusCode: response.status, durationMs, stage: "adapter.deepseek.response", errorCode: "DEEPSEEK_RESPONSE_INVALID" }, "DEEPSEEK_RESPONSE_INVALID");
          throw new DeepSeekChatError("DEEPSEEK_RESPONSE_INVALID", "DeepSeek returned an empty or truncated completion.");
        }
        const responseModel = typeof data?.model === "string" ? data.model : model;
        deepSeekLogger.info({ ...baseLog, model: responseModel, statusCode: response.status, durationMs, stage: "adapter.deepseek.completed" }, "DEEPSEEK_COMPLETION_COMPLETED");
        return { content: content.trim(), model: responseModel };
      } catch (error) {
        if (error instanceof DeepSeekChatError) {
          throw error;
        }
        const durationMs = Date.now() - startedAt;
        if (controller.signal.aborted) {
          deepSeekLogger.warn({ ...baseLog, durationMs, stage: "adapter.deepseek.timeout", errorCode: "DEEPSEEK_TIMEOUT" }, "DEEPSEEK_TIMEOUT");
          throw new DeepSeekChatError("DEEPSEEK_TIMEOUT", `DeepSeek request timed out after ${timeoutMs}ms.`);
        }
        deepSeekLogger.warn({ ...baseLog, durationMs, stage: "adapter.deepseek.request", errorCode: "DEEPSEEK_REQUEST_FAILED" }, "DEEPSEEK_REQUEST_FAILED");
        throw new DeepSeekChatError("DEEPSEEK_REQUEST_FAILED", "DeepSeek request failed before a valid response was received.");
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
