export interface KimiChatRequest {
  operatorLarkId: string;
  message: string;
}

export interface KimiChatTranscriptEntry {
  id: string;
  text: string;
}

export interface KimiChatSessionCreatedEvent {
  event: "session.created";
  data: {
    sessionId: string;
  };
}

export interface KimiChatSessionUpdateEvent {
  event: "acp.session.update";
  data: {
    sessionId: string;
    update: Record<string, unknown>;
  };
}

export interface KimiChatDoneEvent {
  event: "done";
  data: {
    sessionId: string;
    stopReason: string;
  };
}

export type KimiChatEvent =
  | KimiChatSessionCreatedEvent
  | KimiChatSessionUpdateEvent
  | KimiChatDoneEvent;
