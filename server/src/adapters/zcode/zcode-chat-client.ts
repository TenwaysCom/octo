import type { JsonCompletionClient } from "../ai/json-completion-client.js";
import { createModelRequestClient } from "../ai/model-request-client.js";
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
    readonly causeCode?: string,
    readonly providerErrorCode?: string,
  ) {
    super(message);
    this.name = "ZcodeChatError";
  }
}

export interface ZcodeJsonCompletionClient extends JsonCompletionClient {
  createJsonCompletion(input: Parameters<JsonCompletionClient["createJsonCompletion"]>[0] & {
    imageDataUri?: string;
  }): ReturnType<JsonCompletionClient["createJsonCompletion"]>;
}

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
      const userContent = input.imageDataUri ? [
        { type: "image_url", image_url: { url: input.imageDataUri } },
        { type: "text", text: input.prompt },
      ] : input.prompt;
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (input.signal?.aborted) {
        abort();
      } else {
        input.signal?.addEventListener("abort", abort, { once: true });
      }
      const timeoutId = globalThis.setTimeout(abort, timeoutMs);
      const startedAt = Date.now();
      const reasoningEffort = /^glm-5\.3(?:-flash)?$/i.test(model) ? input.reasoningEffort : undefined;
      // Injected fetch implementations own their transport (e.g. test doubles).
      const dispatcher = deps.fetchImpl ? undefined : createModelRequestClient(new URL(ENDPOINT).origin);
      let statusCode: number | undefined;
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
              { role: "user", content: userContent },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
            ...(input.imageDataUri ? { max_tokens: 1600, thinking: { type: "disabled" } } : {}),
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          }),
          signal: controller.signal,
          ...(dispatcher ? { dispatcher } : {}),
        });
        statusCode = response.status;
        const durationMs = Date.now() - startedAt;
        const readResponse = () => input.imageDataUri ? readBoundedJson(response, 32768) : response.json();
        if (!response.ok) {
          // Only retain a numeric error code; provider text can contain private data.
          const payload = await readResponse().catch((error: unknown) => {
            if (input.imageDataUri && controller.signal.aborted) throw error;
            return undefined;
          }) as { error?: { code?: unknown } } | undefined;
          const code = payload?.error?.code;
          const providerErrorCode = (typeof code === "string" || typeof code === "number") && /^\d{1,8}$/.test(String(code))
            ? String(code) : undefined;
          zcodeLogger.warn({ ...baseLog, statusCode: response.status, providerErrorCode, durationMs: Date.now() - startedAt, stage: "adapter.zcode.response", errorCode: "ZCODE_REQUEST_FAILED" }, "ZCODE_REQUEST_FAILED");
          throw new ZcodeChatError("ZCODE_REQUEST_FAILED", `ZCode request failed with status ${response.status}.`, response.status, undefined, providerErrorCode);
        }
        const data = await readResponse().catch((error: unknown) => {
          if (error instanceof SyntaxError) return undefined;
          throw error;
        }) as {
          model?: unknown;
          usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } };
          choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
        } | undefined;
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim() || data?.choices?.[0]?.finish_reason === "length") {
          zcodeLogger.warn({ ...baseLog, statusCode: response.status, durationMs, stage: "adapter.zcode.response", errorCode: "ZCODE_RESPONSE_INVALID" }, "ZCODE_RESPONSE_INVALID");
          throw new ZcodeChatError("ZCODE_RESPONSE_INVALID", "ZCode returned an empty or truncated completion.", response.status);
        }
        const providerModel = data?.model;
        if (input.imageDataUri && typeof providerModel !== "string") {
          zcodeLogger.warn({ ...baseLog, statusCode: response.status, durationMs, stage: "adapter.zcode.response", errorCode: "ZCODE_RESPONSE_INVALID" }, "ZCODE_RESPONSE_INVALID");
          throw new ZcodeChatError("ZCODE_RESPONSE_INVALID", "ZCode did not return a model identifier for the image completion.", response.status);
        }
        const responseModel = typeof providerModel === "string" ? providerModel : model;
        const logModel = input.imageDataUri && !/^[A-Za-z0-9_.-]{1,128}$/.test(responseModel) ? model : responseModel;
        zcodeLogger.info({ ...baseLog, model: logModel, statusCode: response.status, durationMs: Date.now() - startedAt, responseHeadersMs: durationMs, stage: "adapter.zcode.completed" }, "ZCODE_COMPLETION_COMPLETED");
        const number = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
        return { content: content.trim(), model: responseModel, ...(input.collectDiagnostics ? { diagnostics: {
          responseHeadersMs: durationMs, totalMs: Date.now() - startedAt, httpStatus: response.status, reasoningEffort,
          promptTokens: number(data?.usage?.prompt_tokens), completionTokens: number(data?.usage?.completion_tokens),
          totalTokens: number(data?.usage?.total_tokens), reasoningTokens: number(data?.usage?.completion_tokens_details?.reasoning_tokens),
        } } : {}) };
      } catch (error) {
        if (error instanceof ZcodeChatError) {
          throw error;
        }
        const durationMs = Date.now() - startedAt;
        if (controller.signal.aborted) {
          zcodeLogger.warn({ ...baseLog, durationMs, statusCode, stage: "adapter.zcode.timeout", errorCode: "ZCODE_TIMEOUT" }, "ZCODE_TIMEOUT");
          throw new ZcodeChatError("ZCODE_TIMEOUT", `ZCode request timed out after ${timeoutMs}ms.`, statusCode);
        }
        const code = (error as { cause?: { code?: unknown }; code?: unknown } | undefined)?.cause?.code
          ?? (error as { code?: unknown } | undefined)?.code;
        const causeCode = typeof code === "string" && /^(?:UND_ERR_(?:HEADERS|BODY|CONNECT)_TIMEOUT|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)$/.test(code) ? code : undefined;
        zcodeLogger.warn({ ...baseLog, durationMs, causeCode, stage: "adapter.zcode.request", errorCode: "ZCODE_REQUEST_FAILED" }, "ZCODE_REQUEST_FAILED");
        throw new ZcodeChatError("ZCODE_REQUEST_FAILED", "ZCode request failed before a valid response was received.", undefined, causeCode);
      } finally {
        globalThis.clearTimeout(timeoutId);
        input.signal?.removeEventListener("abort", abort);
        await dispatcher?.destroy();
      }
    },
  };
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new SyntaxError("Missing provider body.");
  let size = 0;
  const decoder = new TextDecoder();
  let body = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(body + decoder.decode());
      size += value.byteLength;
      if (size > maxBytes) throw new SyntaxError("Provider body exceeded the vision response limit.");
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
