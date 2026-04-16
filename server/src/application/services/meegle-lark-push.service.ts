/**
 * Meegle Lark Push Service
 *
 * Orchestrates updating a Lark Base record and sending a Lark message
 * based on Meegle workitem custom fields.
 */

import { LarkClient } from "../../adapters/lark/lark-client.js";
import {
  buildAuthenticatedLarkClient,
  type AuthenticatedLarkClientFactoryDeps,
} from "./lark-auth-client.factory.js";
import {
  createMeegleClient,
  type MeegleClientFactoryDeps,
} from "./meegle-client.factory.js";
import { logger } from "../../logger.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";

const pushLogger = logger.child({ module: "meegle-lark-push-service" });

// Meegle custom field keys (discovered via MCP)
const FIELD_LARK_RECORD_LINK = "field_e8ad0a";
const FIELD_LARK_UPDATE_MESSAGE = "field_c22a1a";
const FIELD_LARK_MESSAGE_LINK = "field_8d0341";
const FIELD_LARK_UPDATE_STATUS = "field_c64c12";

const DEFAULT_LARK_STATUS_FIELD_NAME = "状态";

export interface MeegleLarkPushRequest {
  projectKey: string;
  workItemTypeKey: string;
  workItemId: string;
  masterUserId: string;
  baseUrl: string;
  larkBaseUrl?: string;
  larkStatusFieldName?: string;
}

export interface MeegleLarkPushResult {
  ok: boolean;
  alreadyUpdated?: boolean;
  larkBaseUpdated?: boolean;
  messageSent?: boolean;
  reactionAdded?: boolean;
  meegleStatusUpdated?: boolean;
  error?: string;
}

export interface MeegleLarkPushDeps
  extends AuthenticatedLarkClientFactoryDeps, MeegleClientFactoryDeps {}

function parseLarkRecordLink(
  link: string,
): { baseId: string; tableId: string; recordId: string } | null {
  try {
    const url = new URL(link);
    const baseId = url.searchParams.get("base") || "";
    const tableId = url.searchParams.get("table") || "";
    const recordId = url.searchParams.get("record") || "";
    if (baseId && tableId && recordId) {
      return { baseId, tableId, recordId };
    }
    // Fallback: try to extract from path segments if available
    const pathMatch = link.match(/\/base\/([^/?]+).*?[?&]table=([^&]+).*?[?&]record=([^&]+)/);
    if (pathMatch) {
      return { baseId: pathMatch[1], tableId: pathMatch[2], recordId: pathMatch[3] };
    }
  } catch {
    // ignore invalid URL
  }
  return null;
}

function parseLarkMessageLink(
  link: string,
): { threadId?: string; chatId?: string; messageId?: string } | null {
  try {
    const url = new URL(link);
    const threadId = url.searchParams.get("threadid") || undefined;
    const chatId = url.searchParams.get("chatid") || undefined;
    const messageId = url.searchParams.get("messageid") || undefined;
    if (threadId || chatId || messageId) {
      return { threadId, chatId, messageId };
    }
  } catch {
    // ignore invalid URL
  }
  return null;
}

function getFieldValue(workitem: { fields: Record<string, unknown> }, key: string): string | undefined {
  // Some APIs return fields as a flat Record<string, unknown>
  const directValue = workitem.fields[key];
  if (typeof directValue === "string") {
    return directValue;
  }
  if (directValue && typeof directValue === "object") {
    const obj = directValue as Record<string, unknown>;
    if (typeof obj.value === "string") {
      return obj.value;
    }
  }

  // Other APIs return field values inside a "field_value_pairs" array
  const fieldValuePairs = workitem.fields.field_value_pairs;
  if (Array.isArray(fieldValuePairs)) {
    const pair = fieldValuePairs.find(
      (p: unknown) =>
        p &&
        typeof p === "object" &&
        (p as Record<string, unknown>).field_key === key,
    ) as Record<string, unknown> | undefined;

    if (pair) {
      const fv = pair.field_value;
      if (typeof fv === "string") {
        return fv;
      }
      if (fv && typeof fv === "object") {
        const obj = fv as Record<string, unknown>;
        if (typeof obj.value === "string") {
          return obj.value;
        }
      }
    }
  }

  return undefined;
}

export async function executeMeegleLarkPush(
  request: MeegleLarkPushRequest,
  deps: MeegleLarkPushDeps = {},
): Promise<MeegleLarkPushResult> {
  pushLogger.info({
    projectKey: request.projectKey,
    workItemTypeKey: request.workItemTypeKey,
    workItemId: request.workItemId,
    masterUserId: request.masterUserId,
  }, "PUSH_START");

  try {
    // 1. Resolve meegleUserKey and fetch workitem details
    const resolvedUser = await getResolvedUserStore().getById(request.masterUserId);
    const meegleUserKey = resolvedUser?.meegleUserKey;
    pushLogger.debug({ masterUserId: request.masterUserId, hasMeegleUserKey: !!meegleUserKey }, "PUSH_RESOLVE_USER");
    if (!meegleUserKey) {
      throw new Error("Meegle user key not found for master user");
    }

    const meegleClient = await createMeegleClient(
      {
        masterUserId: request.masterUserId,
        meegleUserKey,
        baseUrl: request.baseUrl,
      },
      deps,
    );

    const workitems = await meegleClient.getWorkitemDetails(
      request.projectKey,
      request.workItemTypeKey,
      [request.workItemId],
    );
    pushLogger.debug({ workItemCount: workitems.length }, "PUSH_FETCH_WORKITEM");

    if (workitems.length === 0) {
      throw new Error(`Workitem ${request.workItemId} not found`);
    }

    const workitem = workitems[0];
    const larkUpdateStatus = getFieldValue(workitem, FIELD_LARK_UPDATE_STATUS);
    const larkRecordLink = getFieldValue(workitem, FIELD_LARK_RECORD_LINK);
    const larkUpdateMessage = getFieldValue(workitem, FIELD_LARK_UPDATE_MESSAGE);
    const larkMessageLink = getFieldValue(workitem, FIELD_LARK_MESSAGE_LINK);
    pushLogger.debug({ larkUpdateStatus, hasRecordLink: !!larkRecordLink, hasUpdateMessage: !!larkUpdateMessage, hasMessageLink: !!larkMessageLink }, "PUSH_EXTRACT_FIELDS");

    if (larkUpdateStatus === "updated") {
      pushLogger.info({ workItemId: request.workItemId }, "PUSH_ALREADY_UPDATED");
      return { ok: true, alreadyUpdated: true };
    }

    // 2. Update Lark Base record status
    let larkBaseUpdated = false;
    if (larkRecordLink) {
      const recordInfo = parseLarkRecordLink(larkRecordLink);
      pushLogger.debug({ recordInfo }, "PUSH_PARSE_RECORD_LINK");
      if (recordInfo) {
        const { client: larkClient } = await buildAuthenticatedLarkClient(
          request.masterUserId,
          request.larkBaseUrl || "https://open.larksuite.com",
          deps,
        );

        const statusFieldName = request.larkStatusFieldName || DEFAULT_LARK_STATUS_FIELD_NAME;
        pushLogger.debug({ baseId: recordInfo.baseId, tableId: recordInfo.tableId, recordId: recordInfo.recordId, statusFieldName }, "PUSH_UPDATE_BASE_START");
        await larkClient.updateRecord(
          recordInfo.baseId,
          recordInfo.tableId,
          recordInfo.recordId,
          {
            [statusFieldName]: "Finish",
          },
        );
        larkBaseUpdated = true;
        pushLogger.info({ recordId: recordInfo.recordId }, "PUSH_BASE_OK");
      } else {
        pushLogger.warn({ larkRecordLink }, "PUSH_BASE_PARSE_FAIL");
      }
    } else {
      pushLogger.debug({}, "PUSH_SKIP_BASE_NO_LINK");
    }

    // 3. Send Lark message and add reaction
    let messageSent = false;
    let reactionAdded = false;
    if (larkMessageLink && larkUpdateMessage) {
      const messageInfo = parseLarkMessageLink(larkMessageLink);
      pushLogger.debug({ messageInfo }, "PUSH_PARSE_MESSAGE_LINK");
      if (messageInfo) {
        const { client: larkClient } = await buildAuthenticatedLarkClient(
          request.masterUserId,
          request.larkBaseUrl || "https://open.larksuite.com",
          deps,
        );

        let targetMessageId: string | undefined;

        if (messageInfo.threadId) {
          pushLogger.debug({ threadId: messageInfo.threadId }, "PUSH_SEND_THREAD_START");
          const sendResult = await larkClient.sendMessage(
            "thread_id",
            messageInfo.threadId,
            "text",
            JSON.stringify({ text: larkUpdateMessage }),
          );
          messageSent = true;
          pushLogger.info({ messageId: sendResult.message_id }, "PUSH_MESSAGE_OK");

          // Add reaction to the first message in the thread
          pushLogger.debug({ threadId: messageInfo.threadId }, "PUSH_FETCH_THREAD_MESSAGES");
          const threadMessages = await larkClient.getThreadMessages(messageInfo.threadId);
          pushLogger.debug({ threadMessageCount: threadMessages.items.length }, "PUSH_THREAD_MESSAGES_RECEIVED");
          const firstMessage = threadMessages.items[0];
          if (firstMessage?.message_id) {
            targetMessageId = firstMessage.message_id;
          }
        } else if (messageInfo.chatId) {
          pushLogger.debug({ chatId: messageInfo.chatId }, "PUSH_SEND_CHAT_START");
          const sendResult = await larkClient.sendMessage(
            "chat_id",
            messageInfo.chatId,
            "text",
            JSON.stringify({ text: larkUpdateMessage }),
          );
          messageSent = true;
          pushLogger.info({ messageId: sendResult.message_id }, "PUSH_MESSAGE_OK");

          // If a messageId was provided in the link, react to that original message
          if (messageInfo.messageId) {
            targetMessageId = messageInfo.messageId;
          }
        }

        pushLogger.debug({ targetMessageId }, "PUSH_REACTION_TARGET");
        if (targetMessageId) {
          await larkClient.addMessageReaction(targetMessageId, "OK");
          reactionAdded = true;
          pushLogger.info({ messageId: targetMessageId }, "PUSH_REACTION_OK");
        } else {
          pushLogger.warn({ messageInfo }, "PUSH_REACTION_NO_TARGET");
        }
      } else {
        pushLogger.warn({ larkMessageLink }, "PUSH_MESSAGE_PARSE_FAIL");
      }
    } else {
      pushLogger.debug({ hasMessageLink: !!larkMessageLink, hasUpdateMessage: !!larkUpdateMessage }, "PUSH_SKIP_MESSAGE");
    }

    // 4. Update Meegle workitem status
    pushLogger.debug({ workItemId: request.workItemId }, "PUSH_UPDATE_STATUS_START");
    await meegleClient.updateWorkitem(
      request.projectKey,
      request.workItemTypeKey,
      request.workItemId,
      [
        {
          fieldKey: FIELD_LARK_UPDATE_STATUS,
          fieldValue: "updated",
        },
      ],
    );

    pushLogger.info({ workItemId: request.workItemId, larkBaseUpdated, messageSent, reactionAdded, meegleStatusUpdated: true }, "PUSH_OK");

    return {
      ok: true,
      larkBaseUpdated,
      messageSent,
      reactionAdded,
      meegleStatusUpdated: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    pushLogger.error({
      workItemId: request.workItemId,
      error: errorMessage,
    }, "PUSH_FAIL");

    return {
      ok: false,
      error: errorMessage,
    };
  }
}
