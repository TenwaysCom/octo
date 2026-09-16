import { z } from "zod";

export const larkBugAnalyzeSchema = z.object({
  projectKey: z.string().min(1).optional(),
  workItemTypeKey: z.string().min(1).optional(),
  workItemId: z.string().min(1).optional(),
  meegleUrl: z.string().min(1).optional(),
  baseId: z.string().min(1).optional(),
  tableId: z.string().min(1).optional(),
  viewId: z.string().min(1).optional(),
  recordId: z.string().min(1).optional(),
  wikiRecordId: z.string().min(1).optional(),
  pageType: z.enum(["lark_base", "lark_wiki_record"]).optional(),
  masterUserId: z.string().min(1),
  baseUrl: z.string().min(1),
  actionRunId: z.string().min(1).optional(),
}).refine(
  (input) =>
    Boolean(input.meegleUrl) ||
    Boolean(input.projectKey && input.workItemTypeKey && input.workItemId) ||
    Boolean(input.recordId || input.wikiRecordId || (input.baseId && input.tableId)),
  {
    message: "Provide either Meegle workitem identifiers or Lark Base context.",
  },
);

export type LarkBugAnalyzeControllerRequest = z.infer<
  typeof larkBugAnalyzeSchema
>;

export function validateLarkBugAnalyzeRequest(
  input: unknown,
): LarkBugAnalyzeControllerRequest {
  return larkBugAnalyzeSchema.parse(input);
}
