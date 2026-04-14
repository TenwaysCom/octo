export interface KimiChatRequest {
  operatorLarkId: string;
  sessionId?: string;
  message: string;
}

export type KimiChatContentBlock =
  | {
      type: "text";
      text: string;
    }
  | ({
      type: string;
    } & Record<string, unknown>);

export type KimiChatToolCallStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export interface KimiChatToolCallLocation {
  path: string;
  line?: number | null;
}

export interface KimiChatPlanEntry {
  content: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
}

export type KimiChatSessionUpdate =
  | {
      sessionUpdate: "user_message_chunk";
      content: KimiChatContentBlock;
      messageId?: string | null;
    }
  | {
      sessionUpdate: "agent_message_chunk";
      content: KimiChatContentBlock;
      messageId?: string | null;
    }
  | {
      sessionUpdate: "agent_thought_chunk";
      content: KimiChatContentBlock;
      messageId?: string | null;
    }
  | {
      sessionUpdate: "tool_call";
      toolCallId: string;
      title: string;
      status?: KimiChatToolCallStatus;
      locations?: KimiChatToolCallLocation[];
    }
  | {
      sessionUpdate: "tool_call_update";
      toolCallId: string;
      title?: string | null;
      status?: KimiChatToolCallStatus | null;
      locations?: KimiChatToolCallLocation[] | null;
    }
  | {
      sessionUpdate: "plan";
      entries: KimiChatPlanEntry[];
    }
  | {
      sessionUpdate: "current_mode_update";
      currentModeId: string;
    }
  | {
      sessionUpdate: "session_info_update";
      title?: string | null;
      updatedAt?: string | null;
    }
  | ({
      sessionUpdate: string;
    } & Record<string, unknown>);

export interface KimiChatThoughtEntry {
  id: string;
  text: string;
  messageId?: string | null;
}

export interface KimiChatToolCallEntry {
  id: string;
  title: string;
  status?: KimiChatToolCallStatus | null;
  detail?: string;
}

export interface KimiChatTranscriptEntry {
  id: string;
  kind: "user" | "assistant" | "status" | "raw";
  text?: string;
  messageId?: string | null;
  thoughts?: KimiChatThoughtEntry[];
  toolCalls?: KimiChatToolCallEntry[];
  label?: string;
  raw?: string;
}

export interface KimiChatRenderState {
  sessionId: string | null;
  activeAssistantEntryId: string | null;
  transcript: KimiChatTranscriptEntry[];
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
    update: KimiChatSessionUpdate;
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
