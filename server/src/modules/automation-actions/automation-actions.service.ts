import { logger } from "../../logger.js";
import {
  getAutomationActionStore,
  type AutomationActionRecord,
} from "../../adapters/postgres/automation-action-store.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import type {
  AutomationActionExecuteRequest,
  AutomationActionListRequest,
  AutomationActionPageType,
} from "./automation-actions.dto.js";

const serviceLogger = logger.child({ module: "automation-actions-service" });

export type AutomationActionExecutor =
  | { type: "action"; actionKey: string }
  | { type: "backend_api"; operation: string }
  | { type: "prompt" };

export interface AutomationActionListItem {
  key: string;
  title: string;
  description?: string;
  executor: AutomationActionExecutor;
}

export interface AutomationActionListResponse {
  ok: true;
  data: {
    actions: AutomationActionListItem[];
  };
}

export type AutomationActionExecuteResponse =
  | {
      ok: true;
      data: {
        presentation: {
          type: "open_chat";
          draftMessage: string;
        };
      };
    }
  | {
      ok: false;
      error: {
        errorCode: string;
        errorMessage: string;
      };
    };

export async function listAutomationActions(
  request: AutomationActionListRequest,
): Promise<AutomationActionListResponse> {
  const roles = await resolveRoles(request.masterUserId);
  const records = await getAutomationActionStore().listEnabled();

  const actions = records
    .filter((record) => matchesAction(record, request, roles))
    .map(toListItem)
    .filter((action): action is AutomationActionListItem => Boolean(action));

  return {
    ok: true,
    data: {
      actions,
    },
  };
}

export async function executeAutomationAction(
  request: AutomationActionExecuteRequest,
): Promise<AutomationActionExecuteResponse> {
  const roles = await resolveRoles(request.masterUserId);
  const records = await getAutomationActionStore().listEnabled();
  const record = records.find((candidate) => candidate.key === request.actionKey);

  if (!record) {
    return toError("ACTION_NOT_FOUND", `Automation action ${request.actionKey} was not found.`);
  }

  if (!matchesAction(record, request, roles)) {
    return toError("ACTION_NOT_AVAILABLE", "Automation action is not available for this page or user.");
  }

  if (record.executorType !== "prompt") {
    return toError("UNSUPPORTED_EXECUTOR", "Only prompt actions can be executed through this endpoint in Phase 1.");
  }

  const promptTemplate = readString(record.executorConfig.promptTemplate);
  if (!promptTemplate) {
    return toError("INVALID_ACTION_CONFIG", "Prompt action is missing promptTemplate.");
  }

  return {
    ok: true,
    data: {
      presentation: {
        type: "open_chat",
        draftMessage: renderPrompt(promptTemplate, request),
      },
    },
  };
}

async function resolveRoles(masterUserId?: string): Promise<string[]> {
  if (!masterUserId) {
    return [];
  }

  const user = await getResolvedUserStore().getById(masterUserId);
  if (!user?.role) {
    return [];
  }

  return user.role
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
}

function matchesAction(
  action: AutomationActionRecord,
  context: { url: string; pageType: AutomationActionPageType },
  roles: string[],
): boolean {
  if (action.pageTypes.length > 0 && !action.pageTypes.includes(context.pageType)) {
    return false;
  }

  if (action.urlRegexes.length > 0 && !matchesAnyUrlRegex(action, context.url)) {
    return false;
  }

  const allowedRoles = action.allowedRoles.map((role) => role.toLowerCase());
  if (
    allowedRoles.length > 0 &&
    !allowedRoles.some((role) => roles.includes(role))
  ) {
    return false;
  }

  return true;
}

function matchesAnyUrlRegex(action: AutomationActionRecord, url: string): boolean {
  return action.urlRegexes.some((pattern) => {
    try {
      return new RegExp(pattern).test(url);
    } catch (error) {
      serviceLogger.warn(
        {
          actionKey: action.key,
          pattern,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "AUTOMATION_ACTION_INVALID_URL_REGEX",
      );
      return false;
    }
  });
}

function toListItem(action: AutomationActionRecord): AutomationActionListItem | null {
  if (action.executorType === "action") {
    const actionKey = readString(action.executorConfig.actionKey);
    if (!actionKey) {
      return null;
    }

    return {
      key: action.key,
      title: action.title,
      description: action.description ?? undefined,
      executor: {
        type: "action",
        actionKey,
      },
    };
  }

  if (action.executorType === "prompt") {
    return {
      key: action.key,
      title: action.title,
      description: action.description ?? undefined,
      executor: {
        type: "prompt",
      },
    };
  }

  if (action.executorType === "backend_api") {
    const operation = readString(action.executorConfig.operation);
    if (!operation) {
      return null;
    }

    return {
      key: action.key,
      title: action.title,
      description: action.description ?? undefined,
      executor: {
        type: "backend_api",
        operation,
      },
    };
  }

  return null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function renderPrompt(template: string, context: AutomationActionExecuteRequest): string {
  const values: Record<string, string> = {
    url: context.url,
    pageType: context.pageType,
    masterUserId: context.masterUserId ?? "",
  };

  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
    return values[key] ?? "";
  });
}

function toError(
  errorCode: string,
  errorMessage: string,
): Extract<AutomationActionExecuteResponse, { ok: false }> {
  return {
    ok: false,
    error: {
      errorCode,
      errorMessage,
    },
  };
}
