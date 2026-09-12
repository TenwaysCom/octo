import { createExtensionLogger } from "../logger.js";
import { fetchServerJson } from "../server-request.js";

const ASYNC_ACTIONS_STORAGE_KEY = "asyncActionNotifications";
const asyncActionLogger = createExtensionLogger("background:async-action-notifier");
let pollingPromise: Promise<void> | undefined;

export interface TrackedAsyncAction {
  actionRunId: string;
  masterUserId: string;
  serverUrl: string;
  statusRoute: string;
  notification: {
    title: string;
    message: string;
  };
}

interface AsyncActionStatusResponse {
  ok: boolean;
  data?: {
    status?: "queued" | "running" | "succeeded" | "failed";
  };
  error?: {
    errorMessage?: string;
  };
}

function getTrackedActions(): Promise<TrackedAsyncAction[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(ASYNC_ACTIONS_STORAGE_KEY, (stored) => {
      const value = stored[ASYNC_ACTIONS_STORAGE_KEY];
      resolve(Array.isArray(value) ? value as TrackedAsyncAction[] : []);
    });
  });
}

function saveTrackedActions(actions: TrackedAsyncAction[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [ASYNC_ACTIONS_STORAGE_KEY]: actions }, resolve);
  });
}

export async function trackAsyncAction(action: TrackedAsyncAction): Promise<void> {
  const actions = await getTrackedActions();
  const nextActions = [
    ...actions.filter((item) => item.actionRunId !== action.actionRunId),
    action,
  ];
  await saveTrackedActions(nextActions);
  void pollTrackedAsyncActions();
}

export async function pollTrackedAsyncActions(): Promise<void> {
  if (pollingPromise) {
    return pollingPromise;
  }

  pollingPromise = pollTrackedAsyncActionsOnce();
  try {
    await pollingPromise;
  } finally {
    pollingPromise = undefined;
  }
}

async function pollTrackedAsyncActionsOnce(): Promise<void> {
  const actions = await getTrackedActions();
  if (actions.length === 0) {
    return;
  }

  const remainingActions: TrackedAsyncAction[] = [];
  for (const action of actions) {
    try {
      const statusUrl = `${action.serverUrl}${action.statusRoute.replace(":actionRunId", encodeURIComponent(action.actionRunId))}`;
      const { payload } = await fetchServerJson<AsyncActionStatusResponse>({
        url: statusUrl,
        method: "GET",
        masterUserId: action.masterUserId,
      });

      if (!payload.ok || !payload.data?.status) {
        throw new Error(payload.error?.errorMessage ?? "后台任务状态查询失败");
      }

      if (payload.data.status === "succeeded") {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-128.png",
          title: action.notification.title,
          message: action.notification.message,
        });
        asyncActionLogger.info("Async action completed", { actionRunId: action.actionRunId });
        continue;
      }

      if (payload.data.status === "failed") {
        asyncActionLogger.warn("Async action failed", { actionRunId: action.actionRunId });
        continue;
      }
    } catch (error) {
      asyncActionLogger.warn("Async action status poll failed", {
        actionRunId: action.actionRunId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    remainingActions.push(action);
  }

  await saveTrackedActions(remainingActions);
}
