import type { AcpKimiProxyService } from "./acp-kimi-proxy.service.js";
import { acpKimiProxyService } from "./acp-kimi-proxy.service.js";
import {
  createMeegleClient,
  type MeegleClientFactoryDeps,
} from "./meegle-client.factory.js";
import {
  refreshCredential as refreshMeegleCredential,
  type CredentialStatus,
  type MeegleCredentialServiceDeps,
} from "./meegle-credential.service.js";
import { resolveMeegleStoryFieldKey } from "./meegle-story-field-config.js";
import type { MeegleClient } from "../../adapters/meegle/meegle-client.js";
import { KimiAcpRuntimeError } from "../../adapters/kimi-acp/kimi-acp-runtime.js";
import {
  getResolvedUserStore,
  type ResolvedUserStore,
} from "../../adapters/postgres/resolved-user-store.js";
import {
  getWorkflowPromptStore,
  type WorkflowPromptStore,
} from "../../adapters/postgres/workflow-prompt-store.js";
import {
  DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_TEMPLATE,
  renderWorkflowPromptTemplate,
  STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY,
} from "../../domain/workflow-prompts.js";
import { getConfiguredMeegleAuthServiceDeps } from "../../modules/meegle-auth/meegle-auth.service.js";
import type { MeegleStoryPrdToSimplifiedControllerRequest } from "../../modules/meegle-workitem/meegle-story-prd-to-simplified.dto.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import { logger } from "../../logger.js";

const storyLogger = logger.child({ module: "meegle-story-prd-to-simplified" });

const STORY_WORKITEM_TYPE_KEY = "story";
const DEFAULT_STORY_ACP_TIMEOUT_MS = 110_000;
const DEFAULT_STORY_ACP_CONCURRENCY_LIMIT = 3;

export interface StoryAcpLimiter {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export interface MeegleStoryPrdToSimplifiedResult {
  ok: true;
  data: {
    workItemId: string;
    workItemTypeKey: string;
    updatedField: "techSummary";
    actionRunId?: string;
    analysisSummary: string;
  };
}

export interface MeegleStoryPrdToSimplifiedErrorResponse {
  ok: false;
  error: {
    layer: "server" | "adapter" | "platform";
    module: "meegle-story-prd-to-simplified";
    stage: string;
    errorCode: string;
    errorMessage: string;
    actionRunId?: string;
  };
}

export interface MeegleStoryPrdToSimplifiedDeps extends MeegleClientFactoryDeps {
  resolvedUserStore?: ResolvedUserStore;
  workflowPromptStore?: WorkflowPromptStore;
  acpService?: AcpKimiProxyService;
  acpLimiter?: StoryAcpLimiter;
  createMeegleClient?: (
    config: {
      masterUserId: string;
      meegleUserKey: string;
      baseUrl: string;
    },
    deps?: MeegleClientFactoryDeps,
  ) => Promise<MeegleClient>;
  refreshCredential?: (
    input: {
      masterUserId: string;
      meegleUserKey: string;
      baseUrl: string;
    },
    deps?: Partial<MeegleCredentialServiceDeps>,
  ) => Promise<CredentialStatus>;
}

type MeegleStoryIds = {
  projectKey: string;
  workItemTypeKey: string;
  workItemId: string;
};

export type MeegleStoryPrdToSimplifiedResponse =
  | MeegleStoryPrdToSimplifiedResult
  | MeegleStoryPrdToSimplifiedErrorResponse;

export async function executeMeegleStoryPrdToSimplified(
  request: MeegleStoryPrdToSimplifiedControllerRequest,
  deps: MeegleStoryPrdToSimplifiedDeps = {},
): Promise<MeegleStoryPrdToSimplifiedResponse> {
  const actionRunId = request.actionRunId;

  try {
    const ids = resolveStoryIds(request);
    if (ids.workItemTypeKey !== STORY_WORKITEM_TYPE_KEY) {
      return toError(
        "server.workflow.started",
        "MEEGLE_STORY_TYPE_UNSUPPORTED",
        `Only story workitems are supported, got ${ids.workItemTypeKey}.`,
        actionRunId,
      );
    }

    const userStore = deps.resolvedUserStore ?? getResolvedUserStore();
    const resolvedUser = await userStore.getById(request.masterUserId);
    if (!resolvedUser) {
      return toError(
        "server.identity.resolved",
        "IDENTITY_NOT_FOUND",
        "Master user was not found.",
        actionRunId,
      );
    }

    if (!resolvedUser.meegleUserKey) {
      return toError(
        "server.identity.resolved",
        "MEEGLE_BINDING_REQUIRED",
        "Current user is not bound to a Meegle identity.",
        actionRunId,
      );
    }

    if (!resolvedUser.larkId) {
      return toError(
        "server.identity.resolved",
        "LARK_IDENTITY_REQUIRED",
        "Current user is missing a Lark identity for Kimi ACP.",
        actionRunId,
      );
    }

    const refreshInput = {
      masterUserId: request.masterUserId,
      meegleUserKey: resolvedUser.meegleUserKey,
      baseUrl: request.baseUrl,
    };
    const refreshResult = deps.refreshCredential
      ? await deps.refreshCredential(refreshInput)
      : await refreshDefaultMeegleCredential(refreshInput);

    if (refreshResult.tokenStatus !== "ready" || !refreshResult.userToken) {
      return toError(
        "server.auth.checked",
        "MEEGLE_AUTH_REQUIRED",
        "Meegle authorization is missing or expired.",
        actionRunId,
      );
    }

    const clientFactory = deps.createMeegleClient ?? createMeegleClient;
    const meegleClient = await clientFactory(
      {
        masterUserId: request.masterUserId,
        meegleUserKey: resolvedUser.meegleUserKey,
        baseUrl: request.baseUrl,
      },
      deps,
    );

    const workitems = await meegleClient.getWorkitemDetails(
      ids.projectKey,
      ids.workItemTypeKey,
      [ids.workItemId],
    );
    const workitem = workitems[0];
    if (!workitem) {
      return toError(
        "adapter.meegle.response",
        "MEEGLE_WORKITEM_NOT_FOUND",
        `Workitem ${ids.workItemId} was not found.`,
        actionRunId,
        "adapter",
      );
    }

    const storySummary = getWorkitemFieldValue(
      workitem.fields,
      resolveMeegleStoryFieldKey("storySummary"),
    );
    if (!storySummary) {
      return toError(
        "server.workflow.started",
        "MEEGLE_STORY_SUMMARY_EMPTY",
        "Story Summary is empty.",
        actionRunId,
      );
    }

    const promptTemplate = await resolveStoryPrdToSimplifiedPromptTemplate(
      deps.workflowPromptStore ?? getWorkflowPromptStore(),
    );
    const analysisSummary = await runStoryPrdToSimplifiedAnalysis(
      {
        operatorLarkId: resolvedUser.larkId,
        storyTitle: workitem.name,
        storySummary,
        promptTemplate,
      },
      deps.acpService ?? acpKimiProxyService,
      deps.acpLimiter ?? defaultStoryAcpLimiter,
    );

    if (!analysisSummary) {
      return toError(
        "server.workflow.completed",
        "ACP_EMPTY_RESULT",
        "Kimi ACP returned an empty result.",
        actionRunId,
      );
    }

    await meegleClient.updateWorkitem(
      ids.projectKey,
      ids.workItemTypeKey,
      ids.workItemId,
      [
        {
          fieldKey: resolveMeegleStoryFieldKey("techSummary"),
          fieldValue: analysisSummary,
        },
      ],
    );

    storyLogger.info({
      actionRunId,
      projectKey: ids.projectKey,
      workItemTypeKey: ids.workItemTypeKey,
      workItemId: ids.workItemId,
      stage: "server.workflow.completed",
    }, "STORY_PRD_TO_SIMPLIFIED_OK");

    return {
      ok: true,
      data: {
        workItemId: ids.workItemId,
        workItemTypeKey: ids.workItemTypeKey,
        updatedField: "techSummary",
        actionRunId,
        analysisSummary,
      },
    };
  } catch (error) {
    const acpError = normalizeAcpError(error);
    if (acpError) {
      return toError(
        acpError.stage,
        acpError.errorCode,
        acpError.errorMessage,
        actionRunId,
        acpError.layer,
      );
    }

    return toError(
      "server.workflow.completed",
      "MEEGLE_STORY_PRD_TO_SIMPLIFIED_FAILED",
      error instanceof Error ? error.message : String(error),
      actionRunId,
    );
  }
}

function resolveStoryIds(
  request: MeegleStoryPrdToSimplifiedControllerRequest,
): MeegleStoryIds {
  if (request.projectKey && request.workItemTypeKey && request.workItemId) {
    return {
      projectKey: request.projectKey,
      workItemTypeKey: request.workItemTypeKey,
      workItemId: request.workItemId,
    };
  }

  if (!request.meegleUrl) {
    throw new Error("Missing Meegle workitem identifiers.");
  }

  const url = new URL(request.meegleUrl);
  const pathParts = url.pathname.split("/").filter(Boolean);
  if (pathParts.length < 4 || pathParts[2] !== "detail") {
    throw new Error(`Invalid Meegle workitem URL: ${request.meegleUrl}`);
  }

  return {
    projectKey: pathParts[0],
    workItemTypeKey: pathParts[1],
    workItemId: pathParts[3],
  };
}

function getWorkitemFieldValue(
  fields: Record<string, unknown>,
  fieldKey: string,
): string {
  const directValue = fields[fieldKey];
  const directText = extractTextValue(directValue);
  if (directText) {
    return directText;
  }

  const fieldValuePairs = fields.fields;
  if (!Array.isArray(fieldValuePairs)) {
    return "";
  }

  const pair = fieldValuePairs.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).field_key === fieldKey,
  ) as Record<string, unknown> | undefined;

  return extractTextValue(pair?.field_value);
}

function extractTextValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "string") {
      return record.value.trim();
    }
    if (typeof record.text === "string") {
      return record.text.trim();
    }
  }

  return "";
}

async function refreshDefaultMeegleCredential(input: {
  masterUserId: string;
  meegleUserKey: string;
  baseUrl: string;
}): Promise<CredentialStatus> {
  const authDeps = getConfiguredMeegleAuthServiceDeps();

  return refreshMeegleCredential(input, {
    authAdapter: authDeps.authAdapter,
    tokenStore: authDeps.tokenStore!,
    meegleAuthBaseUrl: authDeps.meegleAuthBaseUrl,
  });
}

async function runStoryPrdToSimplifiedAnalysis(
  input: {
    operatorLarkId: string;
    storyTitle: string;
    storySummary: string;
    promptTemplate: string;
  },
  acpService: AcpKimiProxyService,
  acpLimiter: StoryAcpLimiter,
): Promise<string> {
  return acpLimiter.run(async () => {
    const chunks: string[] = [];
    const timeoutMs = resolveStoryAcpTimeoutMs();
    const abortController = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    try {
      await acpService.chatOneShot(
        {
          operatorLarkId: input.operatorLarkId,
          message: buildStoryPrdToSimplifiedPrompt(input),
        },
        (event) => {
          const text = getAgentMessageText(event);
          if (text) {
            chunks.push(text);
          }
        },
        {
          signal: abortController.signal,
        },
      );
    } catch (error) {
      if (abortController.signal.aborted && isAbortError(error)) {
        throw new StoryAcpTimeoutError(timeoutMs);
      }

      throw error;
    } finally {
      globalThis.clearTimeout(timeoutId);
    }

    return chunks.join("").trim();
  });
}

export function createStoryAcpLimiter(input?: {
  limit?: number | (() => number);
}): StoryAcpLimiter {
  let active = 0;

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      const limit = resolveLimiterLimit(input?.limit);
      if (active >= limit) {
        throw new StoryAcpConcurrencyLimitError(limit);
      }

      active += 1;
      try {
        return await task();
      } finally {
        active -= 1;
      }
    },
  };
}

const defaultStoryAcpLimiter = createStoryAcpLimiter({
  limit: resolveStoryAcpConcurrencyLimit,
});

function resolveLimiterLimit(limit?: number | (() => number)): number {
  const resolved = typeof limit === "function" ? limit() : limit;
  if (resolved === undefined) {
    return DEFAULT_STORY_ACP_CONCURRENCY_LIMIT;
  }

  if (!Number.isFinite(resolved) || resolved < 0) {
    return DEFAULT_STORY_ACP_CONCURRENCY_LIMIT;
  }

  return Math.floor(resolved);
}

class StoryAcpConcurrencyLimitError extends Error {
  readonly code = "ACP_CONCURRENCY_LIMITED";
  readonly stage = "adapter.acp.queue";

  constructor(readonly limit: number) {
    super(
      limit > 0
        ? `Kimi ACP story analysis is limited to ${limit} concurrent run(s).`
        : "Kimi ACP story analysis is currently unavailable because the concurrency limit is 0.",
    );
    this.name = "StoryAcpConcurrencyLimitError";
  }
}

class StoryAcpTimeoutError extends Error {
  readonly code = "ACP_ANALYSIS_TIMEOUT";
  readonly stage = "adapter.acp.prompt";

  constructor(readonly timeoutMs: number) {
    super(`Kimi ACP analysis timed out after ${timeoutMs}ms.`);
    this.name = "StoryAcpTimeoutError";
  }
}

function resolveStoryAcpTimeoutMs(): number {
  const raw = process.env.STORY_PRD_TO_SIMPLIFIED_ACP_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_STORY_ACP_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_STORY_ACP_TIMEOUT_MS;
  }

  return parsed;
}

function resolveStoryAcpConcurrencyLimit(): number {
  const raw = process.env.STORY_PRD_TO_SIMPLIFIED_ACP_CONCURRENCY_LIMIT;
  if (!raw) {
    return DEFAULT_STORY_ACP_CONCURRENCY_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_STORY_ACP_CONCURRENCY_LIMIT;
  }

  return parsed;
}

async function resolveStoryPrdToSimplifiedPromptTemplate(
  store: WorkflowPromptStore,
): Promise<string> {
  const record = await store.getByKey(STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY);
  const prompt = record?.prompt.trim();
  return prompt || DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_TEMPLATE;
}

function normalizeAcpError(error: unknown): {
  layer: "adapter";
  stage: string;
  errorCode: string;
  errorMessage: string;
} | null {
  if (error instanceof KimiAcpRuntimeError) {
    return {
      layer: "adapter",
      stage: error.stage,
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  if (error instanceof StoryAcpTimeoutError) {
    return {
      layer: "adapter",
      stage: error.stage,
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  if (error instanceof StoryAcpConcurrencyLimitError) {
    return {
      layer: "adapter",
      stage: error.stage,
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  if (isAbortError(error)) {
    return {
      layer: "adapter",
      stage: "adapter.acp.prompt",
      errorCode: "ACP_ABORTED",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  return null;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

function getAgentMessageText(event: AcpKimiStreamEvent): string {
  if (event.event !== "acp.session.update") {
    return "";
  }

  const update = event.data.update;
  if (update.sessionUpdate !== "agent_message_chunk") {
    return "";
  }

  const content = update.content;
  if (
    content &&
    typeof content === "object" &&
    (content as Record<string, unknown>).type === "text" &&
    typeof (content as Record<string, unknown>).text === "string"
  ) {
    return (content as Record<string, string>).text;
  }

  return "";
}

function buildStoryPrdToSimplifiedPrompt(input: {
  storyTitle: string;
  storySummary: string;
  promptTemplate: string;
}): string {
  return renderWorkflowPromptTemplate(input.promptTemplate, {
    storyTitle: input.storyTitle || "待确认",
    storySummary: input.storySummary,
  });
}

function toError(
  stage: string,
  errorCode: string,
  errorMessage: string,
  actionRunId?: string,
  layer: "server" | "adapter" | "platform" = "server",
): MeegleStoryPrdToSimplifiedErrorResponse {
  storyLogger.warn({
    actionRunId,
    layer,
    stage,
    errorCode,
    errorMessage,
  }, "STORY_PRD_TO_SIMPLIFIED_FAIL");

  return {
    ok: false,
    error: {
      layer,
      module: "meegle-story-prd-to-simplified",
      stage,
      errorCode,
      errorMessage,
      actionRunId,
    },
  };
}
