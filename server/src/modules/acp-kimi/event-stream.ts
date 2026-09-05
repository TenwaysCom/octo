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

export type AcpKimiEffectDraftCreatedEvent = {
  event: "effect.draft.created";
  data: {
    draftId: string;
    effectType: "answer_feedback" | "ticket_ai_update";
    actionRunId: string;
    status: "pending";
  };
};

export type AcpKimiStreamEvent =
  | AcpKimiSessionCreatedEvent
  | AcpKimiSessionUpdateEvent
  | AcpKimiEffectDraftCreatedEvent
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
