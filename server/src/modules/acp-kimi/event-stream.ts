import type { Response } from "express";

export type AcpKimiSessionCreatedEvent = {
  event: "session.created";
  data: {
    sessionId: string;
  };
};

export type AcpKimiSessionUpdateEvent = {
  event: "acp.session.update";
  data: {
    sessionId: string;
    update: Record<string, unknown>;
  };
};

export type AcpKimiDoneEvent = {
  event: "done";
  data: {
    sessionId: string;
    stopReason: string;
  };
};

export type AcpKimiPermissionRequestEvent = {
  event: "acp.permission.request";
  data: {
    sessionId: string;
    requestId: string;
    toolCall: {
      title: string;
      kind: string;
      rawInput?: unknown;
    };
    options: Array<{
      optionId: string;
      kind: string;
      name: string;
    }>;
    riskLevel: "high" | "medium" | "low";
    reason: string;
  };
};

export type AcpKimiPermissionResolvedEvent = {
  event: "acp.permission.resolved";
  data: {
    sessionId: string;
    requestId: string;
    outcome: "allowed" | "rejected";
  };
};

export type AcpKimiStreamEvent =
  | AcpKimiSessionCreatedEvent
  | AcpKimiSessionUpdateEvent
  | AcpKimiPermissionRequestEvent
  | AcpKimiPermissionResolvedEvent
  | AcpKimiDoneEvent;

export function prepareAcpKimiEventStream(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

export function formatAcpKimiEvent(event: AcpKimiStreamEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function writeAcpKimiEvent(
  res: Pick<Response, "write">,
  event: AcpKimiStreamEvent,
) {
  res.write(formatAcpKimiEvent(event));
}
