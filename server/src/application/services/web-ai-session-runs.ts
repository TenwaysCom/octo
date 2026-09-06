import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";

export type WebAiRunStatus = "running" | "waiting_permission" | "stopping" | "completed" | "failed" | "cancelled";
export type WebAiRunScope = { operatorLarkId: string; resource: string };
export class WebAiRunError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 409) { super(message); }
}
type Run = {
  scope: WebAiRunScope;
  runId: string;
  sessionId: string;
  title?: string;
  actionKey?: string;
  oneShot: boolean;
  actionRunId: string;
  runStatus: WebAiRunStatus;
  events: AcpKimiStreamEvent[];
  error?: { errorCode: string; errorMessage: string };
  updatedAt: string;
  finishedAt?: number;
  abort: AbortController;
};
export function isWebAiRunActive(status: WebAiRunStatus) {
  return status === "running" || status === "waiting_permission" || status === "stopping";
}
const sameScope = (left: WebAiRunScope, right: WebAiRunScope) => left.operatorLarkId === right.operatorLarkId && left.resource === right.resource;
const summary = (run: Run) => ({
  runId: run.runId, sessionId: run.sessionId,
  ...(run.title ? { title: run.title } : {}), ...(run.actionKey ? { actionKey: run.actionKey } : {}),
  oneShot: run.oneShot, actionRunId: run.actionRunId, runStatus: run.runStatus, updatedAt: run.updatedAt,
  ...(run.error ?? {}),
});

// Browser connections observe these runs; only explicit stop or the deadline
// cancels execution. Native agent history remains the durable session store.
export function createWebAiSessionRuns(options: { timeoutMs?: number; retentionMs?: number } = {}) {
  const runs = new Map<string, Run>();
  const prune = () => {
    for (const [key, run] of runs) {
      if (run.finishedAt && Date.now() - run.finishedAt > (options.retentionMs ?? 30 * 60_000)) runs.delete(key);
    }
    const completed = [...runs.values()].filter((run) => run.finishedAt).sort((a, b) => a.finishedAt! - b.finishedAt!);
    for (const run of completed.slice(0, Math.max(0, completed.length - 100))) runs.delete(run.runId);
  };
  const find = (scope: WebAiRunScope, id: string) => [...runs.values()].reverse()
    .find((run) => sameScope(run.scope, scope) && (run.sessionId === id || run.runId === id));
  const snapshot = (run: Run) => ({ ...summary(run), events: [...run.events] });

  return {
    list(scope: WebAiRunScope) {
      prune();
      const latest = new Map<string, ReturnType<typeof summary>>();
      for (const run of runs.values()) if (sameScope(run.scope, scope)) latest.set(run.sessionId, summary(run));
      return [...latest.values()];
    },
    load(scope: WebAiRunScope, id: string) {
      prune();
      const run = find(scope, id);
      return run ? snapshot(run) : undefined;
    },
    stop(scope: WebAiRunScope, id: string, runId: string) {
      const run = find(scope, id);
      if (!run || run.runId !== runId) throw new WebAiRunError("AI_RUN_NOT_FOUND", "本轮任务已结束或不存在，请重新加载会话。", 404);
      if (isWebAiRunActive(run.runStatus) && run.runStatus !== "stopping") {
        run.runStatus = "stopping";
        run.abort.abort(new WebAiRunError("AI_RUN_CANCELLED", "已停止生成。"));
      }
      return snapshot(run);
    },
    async execute(input: WebAiRunScope & { sessionId?: string; message: string; actionKey?: string; oneShot?: boolean; actionRunId?: string }, deps: {
      loadHistory: () => Promise<{ events: AcpKimiStreamEvent[] }>;
      chat: (signal: AbortSignal, emit: (event: AcpKimiStreamEvent) => void, actionRunId: string) => Promise<void>;
      emit: (event: AcpKimiStreamEvent) => void;
    }) {
      prune();
      const previous = input.sessionId ? find(input, input.sessionId) : undefined;
      if (previous && isWebAiRunActive(previous.runStatus)) throw new WebAiRunError("SESSION_BUSY", "当前会话正在生成回复。");
      if (previous?.oneShot || input.sessionId?.startsWith("web_run_")) throw new WebAiRunError("AI_RUN_NOT_RESUMABLE", "请新建会话或重新执行一次性分析。");
      if ([...runs.values()].filter((run) => isWebAiRunActive(run.runStatus)).length >= 16) {
        throw new WebAiRunError("AI_RUN_LIMITED", "正在执行的任务较多，请稍后重试。", 429);
      }
      const runId = `web_run_${randomUUID()}`;
      const run: Run = {
        scope: { operatorLarkId: input.operatorLarkId, resource: input.resource }, runId,
        sessionId: input.sessionId ?? runId, title: previous?.title ?? (input.sessionId ? undefined : input.message.replace(/\s+/g, " ").slice(0, 56)),
        actionKey: input.actionKey ?? previous?.actionKey, oneShot: input.oneShot ?? false,
        actionRunId: input.actionRunId ?? randomUUID(), runStatus: "running", events: [],
        updatedAt: new Date().toISOString(), abort: new AbortController(),
      };
      // Acquire the per-session run before any asynchronous history/runtime work.
      runs.set(runId, run);
      logger.info({ layer: "server", module: "web-ai-session-runs", stage: "server.workflow.started", runId, actionRunId: run.actionRunId, sessionId: run.sessionId }, "WEB_AI_RUN_STARTED");
      const timeout = setTimeout(() => {
        run.runStatus = "stopping";
        run.abort.abort(new WebAiRunError("AI_RUN_TIMEOUT", "本轮任务超时，已请求停止。", 504));
      }, options.timeoutMs ?? 15 * 60_000);
      timeout.unref?.();
      let doneEvent: Extract<AcpKimiStreamEvent, { event: "done" }> | undefined;
      const emit = (event: AcpKimiStreamEvent) => {
        if (event.event === "done") { doneEvent = event; return; }
        if (event.event === "session.created") run.sessionId = event.data.sessionId;
        if (run.runStatus !== "stopping") {
          if (event.event === "acp.permission.requested") run.runStatus = "waiting_permission";
          if (event.event === "acp.permission.resolved") run.runStatus = "running";
        }
        run.events.push(event);
        run.updatedAt = new Date().toISOString();
        // Completion belongs to the whole business operation, including writeback.
        deps.emit(event);
      };
      try {
        deps.emit({ event: "run.started", data: { runId, sessionId: run.sessionId, actionRunId: run.actionRunId } });
        const history = input.sessionId ? previous ?? await deps.loadHistory() : undefined;
        run.abort.signal.throwIfAborted();
        run.events = [...(history?.events ?? []), {
          event: "acp.session.update", data: { sessionId: run.sessionId, update: {
            sessionUpdate: "user_message_chunk", messageId: runId, content: { type: "text", text: input.message },
          } },
        }];
        await deps.chat(run.abort.signal, emit, run.actionRunId);
        const done = doneEvent;
        if (!done) {
          run.abort.signal.throwIfAborted();
          throw new WebAiRunError("AI_RUN_INCOMPLETE", "本轮任务没有完成结果。");
        }
        if (done.data.stopReason !== "end_turn") throw new WebAiRunError("AI_RUN_INCOMPLETE", "本轮任务未完成。");
        run.runStatus = "completed";
        run.events.push(done);
        deps.emit(done);
      } catch (error) {
        const failure = run.abort.signal.aborted ? run.abort.signal.reason : error;
        const errorCode = failure instanceof Error && "code" in failure ? String(failure.code) : "AI_SESSION_FAILED";
        run.error = { errorCode, errorMessage: failure instanceof Error ? failure.message : "AI Session 暂时不可用。" };
        run.runStatus = errorCode === "AI_RUN_CANCELLED" ? "cancelled" : "failed";
        throw failure;
      } finally {
        clearTimeout(timeout);
        run.finishedAt = Date.now();
        run.updatedAt = new Date().toISOString();
        logger.info({ layer: "server", module: "web-ai-session-runs", stage: "server.workflow.completed", runId, actionRunId: run.actionRunId, sessionId: run.sessionId, runStatus: run.runStatus, errorCode: run.error?.errorCode }, "WEB_AI_RUN_FINISHED");
      }
    },
  };
}

export function mergeWebAiSessions<T extends { sessionId: string }>(saved: T[], recent: ReturnType<ReturnType<typeof createWebAiSessionRuns>["list"]>) {
  const items = new Map<string, T | (typeof recent)[number]>();
  for (const item of saved) items.set(item.sessionId, item);
  for (const item of recent) items.set(item.sessionId, { ...items.get(item.sessionId), ...item });
  return [...items.values()];
}
