import { z } from "zod";

const evidence = z.array(z.string().trim().min(1).max(200)).max(100)
  .transform((ids) => [...new Set(ids)]);
const rationale = z.string().trim().min(1).max(2000);

export const shadowBusinessRiskSchema = z.object({
  level: z.number().int().min(1).max(9).nullable(),
  rationale,
  evidenceMessageIds: evidence,
});
export const shadowReplyAdviceSchema = z.object({
  advice: z.enum(["reply_now", "reply_by_deadline", "normal_follow_up", "no_reply_needed", "undetermined"]),
  rationale,
  evidenceMessageIds: evidence,
});

export type ShadowBusinessRisk = z.infer<typeof shadowBusinessRiskSchema>;
export type ShadowReplyAdvice = z.infer<typeof shadowReplyAdviceSchema>;
export { ticketThreadContextInfoSchema as shadowContextInfoSchema } from "./ticket-thread-ai-context.js";
export type { TicketThreadContextInfo as ShadowContextInfo } from "./ticket-thread-ai-context.js";
