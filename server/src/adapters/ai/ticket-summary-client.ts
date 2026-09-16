import {
  createDeepSeekChatClient,
  DeepSeekChatError,
  type DeepSeekChatErrorCode,
} from "../deepseek/deepseek-chat-client.js";
import {
  createZcodeChatClient,
  ZcodeChatError,
  type ZcodeChatErrorCode,
} from "../zcode/zcode-chat-client.js";
import type { JsonCompletionClient } from "./json-completion-client.js";

export type TicketSummaryProvider = "deepseek" | "zcode";
export type TicketSummaryClientErrorCode = DeepSeekChatErrorCode | ZcodeChatErrorCode | "TICKET_SUMMARY_PROVIDER_INVALID";
export type TicketSummaryJsonCompletionClient = JsonCompletionClient;

export class TicketSummaryClientConfigError extends Error {
  readonly code = "TICKET_SUMMARY_PROVIDER_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "TicketSummaryClientConfigError";
  }
}

export interface TicketSummaryClientDeps {
  provider?: TicketSummaryProvider;
  model?: string;
  timeoutMs?: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export function createTicketSummaryJsonCompletionClient(
  deps: TicketSummaryClientDeps = {},
): TicketSummaryJsonCompletionClient {
  const provider = deps.provider ?? readTicketSummaryProvider();
  const model = deps.model ?? (process.env.LARK_TICKET_SUMMARY_MODEL?.trim() || undefined);
  const timeoutMs = deps.timeoutMs ?? readPositiveInt(process.env.LARK_TICKET_SUMMARY_TIMEOUT_MS);
  if (provider === "zcode") {
    return createZcodeChatClient({
      ...(deps.apiKey === undefined ? {} : { apiKey: deps.apiKey }),
      ...(model === undefined ? {} : { model }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    });
  }
  return createDeepSeekChatClient({
    ...(deps.apiKey === undefined ? {} : { apiKey: deps.apiKey }),
    ...(model === undefined ? {} : { model }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
  });
}

export function readTicketSummaryProvider(
  value = process.env.LARK_TICKET_SUMMARY_PROVIDER,
): TicketSummaryProvider {
  const provider = value?.trim().toLowerCase() || "deepseek";
  if (provider === "deepseek" || provider === "zcode") return provider;
  throw new TicketSummaryClientConfigError(
    "LARK_TICKET_SUMMARY_PROVIDER must be either deepseek or zcode.",
  );
}

export function isTicketSummaryClientError(error: unknown): error is DeepSeekChatError | ZcodeChatError | TicketSummaryClientConfigError {
  return error instanceof DeepSeekChatError
    || error instanceof ZcodeChatError
    || error instanceof TicketSummaryClientConfigError;
}

function readPositiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
