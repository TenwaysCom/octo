import { z } from "zod";

export const automationActionPageTypeSchema = z.enum([
  "lark",
  "meegle",
  "github",
  "unsupported",
]);

export const automationActionListRequestSchema = z.object({
  url: z.string().url(),
  pageType: automationActionPageTypeSchema,
  masterUserId: z.string().min(1).optional(),
});

export const automationActionExecuteRequestSchema = z.object({
  actionKey: z.string().min(1),
  url: z.string().url(),
  pageType: automationActionPageTypeSchema,
  masterUserId: z.string().min(1).optional(),
  formValues: z.record(z.string(), z.unknown()).optional(),
});

export type AutomationActionPageType = z.infer<typeof automationActionPageTypeSchema>;
export type AutomationActionListRequest = z.infer<typeof automationActionListRequestSchema>;
export type AutomationActionExecuteRequest = z.infer<typeof automationActionExecuteRequestSchema>;

export function validateAutomationActionListRequest(
  input: unknown,
): AutomationActionListRequest {
  return automationActionListRequestSchema.parse(input);
}

export function validateAutomationActionExecuteRequest(
  input: unknown,
): AutomationActionExecuteRequest {
  return automationActionExecuteRequestSchema.parse(input);
}
