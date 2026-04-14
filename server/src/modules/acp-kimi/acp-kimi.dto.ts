import { z } from "zod";

export const acpKimiChatRequestSchema = z.object({
  operatorLarkId: z.string().min(1),
  message: z.string().min(1),
  sessionId: z.string().min(1).optional(),
});

export type AcpKimiChatRequest = z.infer<typeof acpKimiChatRequestSchema>;

export type AcpKimiContentBlock =
  | {
      type: "text";
      text: string;
    }
  | ({
      type: string;
    } & Record<string, unknown>);

export type AcpKimiToolCallStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export interface AcpKimiToolCallLocation {
  path: string;
  line?: number | null;
}

export interface AcpKimiPlanEntry {
  content: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
}

export type AcpKimiSessionUpdate =
  | {
      sessionUpdate: "user_message_chunk";
      content: AcpKimiContentBlock;
      messageId?: string | null;
    }
  | {
      sessionUpdate: "agent_message_chunk";
      content: AcpKimiContentBlock;
      messageId?: string | null;
    }
  | {
      sessionUpdate: "agent_thought_chunk";
      content: AcpKimiContentBlock;
      messageId?: string | null;
    }
  | {
      sessionUpdate: "tool_call";
      toolCallId: string;
      title: string;
      status?: AcpKimiToolCallStatus;
      locations?: AcpKimiToolCallLocation[];
    }
  | {
      sessionUpdate: "tool_call_update";
      toolCallId: string;
      title?: string | null;
      status?: AcpKimiToolCallStatus | null;
      locations?: AcpKimiToolCallLocation[] | null;
    }
  | {
      sessionUpdate: "plan";
      entries: AcpKimiPlanEntry[];
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

export function validateAcpKimiChatRequest(input: unknown): AcpKimiChatRequest {
  return acpKimiChatRequestSchema.parse(input);
}
