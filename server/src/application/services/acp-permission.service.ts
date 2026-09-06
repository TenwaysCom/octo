import { randomUUID } from "node:crypto";
import type { RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk";
import type { AcpKimiStreamEvent, AcpPermissionRequestData, AcpPermissionStatus } from "../../modules/acp-kimi/event-stream.js";

export type AcpRunMode = "interactive" | "background";
export class AcpPermissionError extends Error {
  readonly stage = "server.acp.permission";
  constructor(readonly code: string, message: string, readonly statusCode = 409, readonly actionRunId?: string) {
    super(message);
    this.name = "AcpPermissionError";
  }
}

type PendingRequest = {
  operatorLarkId: string;
  data: AcpPermissionRequestData;
  finish(status: AcpPermissionStatus, optionId?: string): void;
};

// Hermes 0.14's native callback waits 60s. Reply before that deadline; do not
// offer a longer UI window that could approve an already abandoned command.
export const ACP_PERMISSION_TIMEOUT_MS = 50_000;

export function createAcpPermissionService(deps: { timeoutMs?: number; now?: () => number } = {}) {
  const pending = new Map<string, PendingRequest>();
  const now = deps.now ?? Date.now;
  const timeoutMs = Math.min(deps.timeoutMs ?? ACP_PERMISSION_TIMEOUT_MS, ACP_PERMISSION_TIMEOUT_MS);

  return {
    beginRun(input: {
      operatorLarkId: string;
      sessionId: string;
      agentSessionId: string;
      actionRunId: string;
      mode: AcpRunMode;
      emit: (event: AcpKimiStreamEvent) => void;
      cancel: () => void;
      signal?: AbortSignal;
    }) {
      const requestIds = new Set<string>();
      let closed = false;
      let failure: AcpPermissionError | undefined;
      const fail = (code: string, message: string) => {
        failure ??= new AcpPermissionError(code, message, 409, input.actionRunId);
        input.cancel();
      };
      const close = () => {
        closed = true;
        for (const id of requestIds) pending.get(id)?.finish("cancelled");
        input.signal?.removeEventListener("abort", close);
      };
      input.signal?.addEventListener("abort", close, { once: true });
      return {
        get failure() { return failure; },
        assertCompleted() {
          if (requestIds.size) fail("ACP_PERMISSION_INCOMPLETE", "Agent 在审批结束前返回，本轮未完成。");
          if (failure) throw failure;
        },
        close,
        async request(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
          if (closed || input.signal?.aborted) return { outcome: { outcome: "cancelled" } };
          if (params.sessionId !== input.agentSessionId) {
            fail("ACP_PERMISSION_SESSION_MISMATCH", "Agent permission request belongs to another session.");
            return { outcome: { outcome: "cancelled" } };
          }
          const data: AcpPermissionRequestData = {
            requestId: randomUUID(),
            sessionId: input.sessionId,
            actionRunId: input.actionRunId,
            expiresAt: new Date(now() + timeoutMs).toISOString(),
            toolCall: params.toolCall,
            options: params.options.map(({ optionId, name, kind }) => ({ optionId, name, kind })),
          };
          if (input.mode === "background") {
            input.emit({ event: "acp.permission.resolved", data: { ...data, status: "rejected" } });
            fail("ACP_PERMISSION_CONFIGURATION_REQUIRED", "后台任务需要工具审批，已终止本轮；请配置 Agent 权限后重新执行。");
            return { outcome: { outcome: "cancelled" } };
          }
          return new Promise<RequestPermissionResponse>((resolve) => {
            const timer = setTimeout(() => {
              pending.get(data.requestId)?.finish("expired");
            }, timeoutMs);
            requestIds.add(data.requestId);
            pending.set(data.requestId, {
              operatorLarkId: input.operatorLarkId,
              data,
              finish(status, optionId) {
                if (!pending.delete(data.requestId)) return;
                clearTimeout(timer);
                requestIds.delete(data.requestId);
                input.emit({ event: "acp.permission.resolved", data: { ...data, status, ...(optionId ? { optionId } : {}) } });
                resolve({ outcome: optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" } });
                if (status === "rejected") fail("ACP_PERMISSION_REJECTED", "用户拒绝了工具操作，本轮已终止。");
                if (status === "expired") fail("ACP_PERMISSION_EXPIRED", "工具审批已过期，本轮已终止，请重新执行。");
              },
            });
            input.emit({ event: "acp.permission.requested", data });
          });
        },
      };
    },
    reply(input: { operatorLarkId: string; sessionId: string; actionRunId: string; requestId: string; optionId: string }) {
      const request = pending.get(input.requestId);
      if (!request) throw new AcpPermissionError("ACP_PERMISSION_NOT_PENDING", "审批已处理、取消或过期。");
      if (request.operatorLarkId !== input.operatorLarkId || request.data.sessionId !== input.sessionId || request.data.actionRunId !== input.actionRunId) {
        throw new AcpPermissionError("ACP_PERMISSION_FORBIDDEN", "审批不属于当前用户或本轮会话。", 403);
      }
      if (now() >= Date.parse(request.data.expiresAt)) {
        request.finish("expired");
        throw new AcpPermissionError("ACP_PERMISSION_EXPIRED", "审批已过期。");
      }
      const option = request.data.options.find((item) => item.optionId === input.optionId);
      if (!option) throw new AcpPermissionError("ACP_PERMISSION_INVALID_OPTION", "只能选择本次请求提供的审批选项。", 400);
      request.finish(option.kind.startsWith("allow_") ? "approved" : "rejected", option.optionId);
      return { requestId: input.requestId, optionId: option.optionId };
    },
  };
}

export const acpPermissionService = createAcpPermissionService();
