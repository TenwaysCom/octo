/**
 * Meegle Workitem Service
 *
 * Provides high-level operations for creating and managing Meegle workitems
 * using the MeegleClient.
 */

import {
  MeegleAPIError,
  MeegleClient,
  type MeegleWorkitem,
} from "../../adapters/meegle/meegle-client.js";
import type { ExecutionDraft } from "../../validators/agent-output/execution-draft.js";

export interface MeegleWorkitemServiceDeps {
  client: MeegleClient;
}

export interface CreateWorkitemResult {
  workitemId: string;
  workitem: MeegleWorkitem;
}

export interface CreateWorkitemFromDraftOptions {
  idempotencyKey?: string;
}

function normalizeTemplateId(
  templateId: ExecutionDraft["target"]["templateId"],
): number | undefined {
  if (typeof templateId === "number") {
    return Number.isFinite(templateId) ? templateId : undefined;
  }

  const parsedTemplateId = Number.parseInt(templateId, 10);
  return Number.isFinite(parsedTemplateId) ? parsedTemplateId : undefined;
}

function extractIllegalField(error: unknown): string | undefined {
  if (!(error instanceof MeegleAPIError) || !error.response) {
    return undefined;
  }
  const errMsg =
    (typeof error.response.err === "object" && error.response.err !== null &&
      typeof (error.response.err as Record<string, unknown>).msg === "string")
      ? (error.response.err as Record<string, string>).msg
      : typeof error.response.err_msg === "string"
      ? error.response.err_msg
      : error.message;
  const match = errMsg.match(/field \[([^\]]+)\] is illegal/);
  return match?.[1];
}

/**
 * Create a workitem from an execution draft
 */
export async function createWorkitemFromDraft(
  draft: ExecutionDraft,
  deps: MeegleWorkitemServiceDeps,
  options: CreateWorkitemFromDraftOptions = {},
): Promise<CreateWorkitemResult> {
  const { client } = deps;
  const { projectKey, workitemTypeKey, templateId } = draft.target;

  // Convert fieldValuePairs to the format expected by MeegleClient
  const fieldValuePairs = draft.fieldValuePairs.map((pair) => ({
    field_key: pair.fieldKey,
    field_value: pair.fieldValue,
  }));

  let creatableFields = fieldValuePairs;
  const postCreateUpdates: typeof fieldValuePairs = [];

  // Some fields cannot be set during creation (e.g. priority on story).
  // Retry without illegal fields and update them afterwards.
  for (let attempt = 0; attempt < fieldValuePairs.length + 1; attempt++) {
    try {
      const workitem = await client.createWorkitem({
        projectKey,
        workItemTypeKey: workitemTypeKey,
        name: draft.name,
        templateId: normalizeTemplateId(templateId),
        fieldValuePairs: creatableFields,
        idempotencyKey: options.idempotencyKey,
      });

      if (postCreateUpdates.length > 0) {
        await client.updateWorkitem(
          projectKey,
          workitemTypeKey,
          workitem.id,
          postCreateUpdates.map((p) => ({
            fieldKey: p.field_key,
            fieldValue: p.field_value,
          })),
        );
      }

      return {
        workitemId: workitem.id,
        workitem,
      };
    } catch (error) {
      const illegalField = extractIllegalField(error);
      if (!illegalField) {
        throw error;
      }
      const illegalIndex = creatableFields.findIndex(
        (f) => f.field_key === illegalField,
      );
      if (illegalIndex === -1) {
        throw error;
      }
      console.log("[MeegleWorkitemService] Field illegal at creation, will update after create", { illegalField });
      postCreateUpdates.push(...creatableFields.splice(illegalIndex, 1));
    }
  }

  // Should never reach here because the loop has enough iterations to strip all fields
  throw new Error("Unexpected: exhausted retries for illegal fields during workitem creation");
}

/**
 * Update a workitem's fields
 */
export async function updateWorkitem(
  projectKey: string,
  workitemType: string,
  workitemId: string,
  fieldValuePairs: Array<{ fieldKey: string; fieldValue: unknown }>,
  deps: MeegleWorkitemServiceDeps,
): Promise<MeegleWorkitem> {
  const { client } = deps;

  const updateFields = fieldValuePairs.map((pair) => ({
    fieldKey: pair.fieldKey,
    fieldValue: pair.fieldValue,
  }));

  return client.updateWorkitem(
    projectKey,
    workitemType,
    workitemId,
    updateFields,
  );
}

/**
 * Get workitem details
 */
export async function getWorkitem(
  projectKey: string,
  workitemType: string,
  workitemId: string,
  deps: MeegleWorkitemServiceDeps,
): Promise<MeegleWorkitem> {
  const { client } = deps;

  const workitems = await client.getWorkitemDetails(
    projectKey,
    workitemType,
    [workitemId],
  );

  if (workitems.length === 0) {
    throw new Error(`Workitem ${workitemId} not found`);
  }

  return workitems[0];
}

/**
 * Add a comment to a workitem
 */
export async function addComment(
  projectKey: string,
  workitemType: string,
  workitemId: string,
  content: string,
  deps: MeegleWorkitemServiceDeps,
): Promise<string> {
  const { client } = deps;

  const comment = await client.addComment(
    projectKey,
    workitemType,
    workitemId,
    content,
  );

  return comment.id;
}
