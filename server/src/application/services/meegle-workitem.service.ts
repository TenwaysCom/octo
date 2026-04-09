/**
 * Meegle Workitem Service
 *
 * Provides high-level operations for creating and managing Meegle workitems
 * using the MeegleClient.
 */

import {
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

  const workitem = await client.createWorkitem({
    projectKey,
    workItemTypeKey: workitemTypeKey,
    name: draft.name,
    templateId: normalizeTemplateId(templateId),
    fieldValuePairs,
    idempotencyKey: options.idempotencyKey,
  });

  return {
    workitemId: workitem.id,
    workitem,
  };
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
