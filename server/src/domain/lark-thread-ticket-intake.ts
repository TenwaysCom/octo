import { z } from "zod";

export const larkThreadTicketRangeSchema = z.object({
  chatId: z.string().regex(/^oc_[A-Za-z0-9]+$/),
  startTime: z.iso.datetime({ offset: true }),
  endTime: z.iso.datetime({ offset: true }),
  apply: z.boolean().default(false),
  maxTickets: z.number().int().min(1).max(50).default(5),
  actionRunId: z.string().trim().min(1).max(128).optional(),
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.startTime) >= Date.parse(value.endTime)) ctx.addIssue({ code: "custom", path: ["endTime"], message: "endTime must be after startTime" });
  if (Date.parse(value.startTime) % 1000 || Date.parse(value.endTime) % 1000) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Use whole-second timestamps" });
});

export type LarkThreadTicketRangeInput = z.input<typeof larkThreadTicketRangeSchema>;
