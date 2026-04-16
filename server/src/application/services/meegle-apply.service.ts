import { MeegleClient } from "../../adapters/meegle/meegle-client.js";
import type { MeegleAuthAdapter } from "../../adapters/meegle/auth-adapter.js";
import type { MeegleTokenStore } from "../../adapters/meegle/token-store.js";
import {
  getResolvedUserStore,
  type ResolvedUserRecord,
  type ResolvedUserStore,
} from "../../adapters/postgres/resolved-user-store.js";
import { refreshCredential } from "./meegle-credential.service.js";
import { getConfiguredMeegleAuthServiceDeps } from "../../modules/meegle-auth/meegle-auth.service.js";
import {
  createWorkitemFromDraft,
  type CreateWorkitemFromDraftOptions,
  type CreateWorkitemResult,
} from "./meegle-workitem.service.js";
import type { ExecutionDraft } from "../../validators/agent-output/execution-draft.js";
import { logger } from "../../logger.js";

const applyLogger = logger.child({ module: "meegle-apply-service" });

export type MeegleApplyErrorCode =
  | "IDENTITY_NOT_FOUND"
  | "MEEGLE_BINDING_REQUIRED"
  | "MEEGLE_AUTH_REQUIRED"
  | "MEEGLE_WORKITEM_CREATE_FAILED";

export class MeegleApplyError extends Error {
  constructor(
    public readonly errorCode: MeegleApplyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MeegleApplyError";
  }
}

export interface MeegleApplyExecutionDeps {
  resolvedUserStore?: ResolvedUserStore;
  authAdapter?: MeegleAuthAdapter;
  tokenStore?: MeegleTokenStore;
  meegleAuthBaseUrl?: string;
  createClient?: (input: {
    userToken: string;
    userKey: string;
    baseUrl: string;
  }) => Promise<MeegleClient> | MeegleClient;
  createWorkitemFromDraft?: (
    draft: ExecutionDraft,
    deps: {
      client: MeegleClient;
    },
    options?: CreateWorkitemFromDraftOptions,
  ) => Promise<CreateWorkitemResult>;
}

export interface MeegleApplyInput {
  requestId: string;
  draft: ExecutionDraft;
  operatorLarkId?: string;
  masterUserId?: string;
  idempotencyKey: string;
}

export interface MeegleApplyResult {
  status: "created";
  workitemId: string;
  draft: ExecutionDraft;
}

function getResolvedStore(
  deps: MeegleApplyExecutionDeps,
): ResolvedUserStore {
  return deps.resolvedUserStore ?? getResolvedUserStore();
}

async function resolveApplyUser(
  input: MeegleApplyInput,
  deps: MeegleApplyExecutionDeps,
): Promise<ResolvedUserRecord> {
  const store = getResolvedStore(deps);

  if (input.masterUserId) {
    const masterUser = await store.getById(input.masterUserId);
    if (masterUser) {
      return masterUser;
    }
  }

  if (input.operatorLarkId) {
    const operatorUser = await store.getByLarkId(input.operatorLarkId);
    if (operatorUser) {
      return operatorUser;
    }
  }

  throw new MeegleApplyError(
    "IDENTITY_NOT_FOUND",
    "Unable to resolve a master user for this apply request",
  );
}

function ensureBinding(user: ResolvedUserRecord): void {
  if (!user.meegleUserKey || !user.meegleBaseUrl) {
    throw new MeegleApplyError(
      "MEEGLE_BINDING_REQUIRED",
      "Resolved user is missing Meegle binding information",
    );
  }
}

async function buildClient(
  user: ResolvedUserRecord,
  deps: MeegleApplyExecutionDeps,
) {
  let configuredAuthDeps;

  try {
    configuredAuthDeps = getConfiguredMeegleAuthServiceDeps({
      authAdapter: deps.authAdapter,
      tokenStore: deps.tokenStore,
      meegleAuthBaseUrl: deps.meegleAuthBaseUrl,
    });
  } catch (error) {
    throw new MeegleApplyError(
      "MEEGLE_AUTH_REQUIRED",
      error instanceof Error ? error.message : "Meegle auth is not configured",
    );
  }

  const { authAdapter, tokenStore, meegleAuthBaseUrl } = configuredAuthDeps;

  if (!authAdapter || !tokenStore) {
    throw new MeegleApplyError(
      "MEEGLE_AUTH_REQUIRED",
      "Meegle auth is not configured",
    );
  }

  let credentialStatus;

  try {
    credentialStatus = await refreshCredential(
      {
        masterUserId: user.id,
        meegleUserKey: user.meegleUserKey!,
        baseUrl: user.meegleBaseUrl!,
      },
      {
        authAdapter,
        tokenStore,
        meegleAuthBaseUrl,
      },
    );
  } catch (error) {
    throw new MeegleApplyError(
      "MEEGLE_AUTH_REQUIRED",
      error instanceof Error ? error.message : "Meegle auth is required",
    );
  }

  if (
    credentialStatus.tokenStatus !== "ready" ||
    !credentialStatus.userToken
  ) {
    throw new MeegleApplyError(
      "MEEGLE_AUTH_REQUIRED",
      credentialStatus.errorCode ?? "Meegle auth is required",
    );
  }

  if (deps.createClient) {
    return deps.createClient({
      userToken: credentialStatus.userToken,
      userKey: user.meegleUserKey!,
      baseUrl: credentialStatus.baseUrl,
    });
  }

  return new MeegleClient({
    userToken: credentialStatus.userToken,
    userKey: user.meegleUserKey!,
    baseUrl: credentialStatus.baseUrl,
  });
}

export async function executeMeegleApply(
  input: MeegleApplyInput,
  deps: MeegleApplyExecutionDeps = {},
): Promise<MeegleApplyResult> {
  const user = await resolveApplyUser(input, deps);
  ensureBinding(user);

  const client = await buildClient(user, deps);
  const createWorkitem =
    deps.createWorkitemFromDraft ?? createWorkitemFromDraft;

  try {
    const created = await createWorkitem(
      input.draft,
      { client },
      { idempotencyKey: input.idempotencyKey },
    );
    return {
      status: "created",
      workitemId: created.workitemId,
      draft: input.draft,
    };
  } catch (error) {
    const statusCode = error && typeof error === "object" && "statusCode" in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;
    const response = error && typeof error === "object" && "response" in error
      ? (error as { response?: Record<string, unknown> }).response
      : undefined;

    applyLogger.error({
      requestId: input.requestId,
      workitemTypeKey: input.draft.target.workitemTypeKey,
      statusCode,
      response,
      message: error instanceof Error ? error.message : String(error),
    }, "CREATE_WORKITEM FAIL");

    throw new MeegleApplyError(
      "MEEGLE_WORKITEM_CREATE_FAILED",
      error instanceof Error ? error.message : "Failed to create Meegle workitem",
    );
  }
}
