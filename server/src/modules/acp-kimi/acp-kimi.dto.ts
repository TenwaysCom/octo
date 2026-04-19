import { z } from "zod";

export const acpKimiChatRequestSchema = z.object({
  operatorLarkId: z.string().min(1),
  message: z.string().min(1),
  sessionId: z.string().min(1).optional(),
});

export const acpKimiSessionLookupRequestSchema = z.object({
  operatorLarkId: z.string().min(1),
  sessionId: z.string().min(1),
});

export const acpKimiSessionListRequestSchema = z.object({
  operatorLarkId: z.string().min(1),
});

export const acpKimiSessionRenameRequestSchema = z.object({
  operatorLarkId: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().min(1),
});

export type AcpKimiChatRequest = z.infer<typeof acpKimiChatRequestSchema>;
export type AcpKimiSessionLookupRequest = z.infer<
  typeof acpKimiSessionLookupRequestSchema
>;
export type AcpKimiSessionListRequest = z.infer<
  typeof acpKimiSessionListRequestSchema
>;
export type AcpKimiSessionRenameRequest = z.infer<
  typeof acpKimiSessionRenameRequestSchema
>;

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

export interface AcpKimiSessionSummary {
  sessionId: string;
  cwd?: string | null;
  title?: string | null;
  updatedAt?: string | null;
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

export function validateAcpKimiSessionLookupRequest(
  input: unknown,
): AcpKimiSessionLookupRequest {
  return acpKimiSessionLookupRequestSchema.parse(input);
}

export function validateAcpKimiSessionListRequest(
  input: unknown,
): AcpKimiSessionListRequest {
  return acpKimiSessionListRequestSchema.parse(input);
}

export function validateAcpKimiSessionRenameRequest(
  input: unknown,
): AcpKimiSessionRenameRequest {
  return acpKimiSessionRenameRequestSchema.parse(input);
}
