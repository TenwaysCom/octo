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
import { MeegleAuthenticationError } from "../../adapters/meegle/meegle-client.js";
import { refreshCredential } from "./meegle-credential.service.js";
import { getConfiguredMeegleAuthServiceDeps } from "../../modules/meegle-auth/meegle-auth.service.js";
import { logger } from "../../logger.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";

const pushLogger = logger.child({ module: "meegle-lark-push-service" });

// Meegle custom field keys (discovered via MCP)
const FIELD_LARK_RECORD_LINK = "field_e8ad0a";
const FIELD_LARK_UPDATE_MESSAGE = "field_c22a1a";
const FIELD_LARK_MESSAGE_LINK = "field_8d0341";
const FIELD_LARK_UPDATE_STATUS = "field_c64c12";

const DEFAULT_LARK_STATUS_FIELD_NAME = "状态";

// Meegle api_name -> type_key mapping (required because OpenAPI uses type_key in paths)
const MEEGLE_API_NAME_TO_TYPE_KEY: Record<string, string> = {
  story: "story",
  issue: "issue",
  chart: "chart",
  sub_task: "sub_task",
  sprint1: "642ebe04168eea39eeb0d34a",
  epic: "642ec373f4af608bb3cb1c90",
  version: "642f8d55c7109143ec2eb478",
  test_plans: "63fc6b3a842ed46a33c769cf",
  test_cases: "63fc6356a3568b3fd3800e88",
  using_test_case: "63fc81008b7f897a30b36663",
  project_a: "65a8a9f954468841b9caa572",
  test_cases_set: "661c999c4c8ec6ff7208f393",
  voc: "6621e5b5be796e305e3a9229",
  techtask: "66700acbf297a8f821b4b860",
  changeapproval: "6819b8e43035408c4c94307d",
  production_bug: "6932e40429d1cd8aac635c82",
};

function resolveMeegleTypeKey(apiName: string): string {
  return MEEGLE_API_NAME_TO_TYPE_KEY[apiName] || apiName;
}

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
    // Fallback 1: path segments like /base/{id}/table/{id}/record/{id}
    const segmentMatch = link.match(/\/base\/([^/]+)\/table\/([^/]+)\/record\/([^/?]+)/);
    if (segmentMatch) {
      return { baseId: segmentMatch[1], tableId: segmentMatch[2], recordId: segmentMatch[3] };
    }
    // Fallback 2: mixed path/query like /base/{id}?table={id}&record={id}
    const queryMatch = link.match(/\/base\/([^/?]+).*?[?&]table=([^&]+).*?[?&]record=([^&]+)/);
    if (queryMatch) {
      return { baseId: queryMatch[1], tableId: queryMatch[2], recordId: queryMatch[3] };
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
  pushLogger.debug({ key, directValue}, "PUSH_RESOLVE_FIELD-10");
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
  const fieldValuePairs = workitem.fields.fields;
  // pushLogger.debug({ key, fields: fieldValuePairs}, "PUSH_RESOLVE_FIELD-15");
  if (Array.isArray(fieldValuePairs)) {
    const pair = fieldValuePairs.find(
      (p: unknown) =>
        p &&
      typeof p === "object" &&
      (p as Record<string, unknown>).field_key === key,
    ) as Record<string, unknown> | undefined;
    
    pushLogger.debug({ key, pair}, "PUSH_RESOLVE_FIELD-20");
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

    const authDeps = getConfiguredMeegleAuthServiceDeps();
    const refreshResult = await refreshCredential(
      {
        masterUserId: request.masterUserId,
        meegleUserKey,
        baseUrl: request.baseUrl,
      },
      {
        authAdapter: authDeps.authAdapter,
        tokenStore: authDeps.tokenStore!,
        meegleAuthBaseUrl: authDeps.meegleAuthBaseUrl,
      },
    );
    if (refreshResult.tokenStatus !== "ready" || !refreshResult.userToken) {
      throw new Error("Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。");
    }
    pushLogger.debug({ masterUserId: request.masterUserId, source: refreshResult.expiresAt ? "refresh" : "cached" }, "PUSH_REFRESH_CREDENTIAL");

    const meegleClient = await createMeegleClient(
      {
        masterUserId: request.masterUserId,
        meegleUserKey,
        baseUrl: request.baseUrl,
      },
      deps,
    );

    const resolvedTypeKey = resolveMeegleTypeKey(request.workItemTypeKey);
    pushLogger.debug({ apiName: request.workItemTypeKey, resolvedTypeKey }, "PUSH_RESOLVE_TYPE_KEY");

    const workitems = await meegleClient.getWorkitemDetails(
      request.projectKey,
      resolvedTypeKey,
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

    const missingActionFields: string[] = [];
    if (!larkRecordLink) missingActionFields.push("Lark Record Link");
    if (!larkUpdateMessage) missingActionFields.push("Lark Update Message");
    if (!larkMessageLink) missingActionFields.push("Lark Message Link");

    const hasBaseAction = !!larkRecordLink;
    const hasMessageAction = !!larkMessageLink && !!larkUpdateMessage;

    if (larkUpdateStatus !== "updated" && !hasBaseAction && !hasMessageAction) {
      const errorMsg = `该工作项缺少必要的 Lark 字段，无法执行推送。缺少字段：${missingActionFields.join("、")}`;
      pushLogger.warn({ workItemId: request.workItemId, missingActionFields }, "PUSH_MISSING_FIELDS");
      return { ok: false, error: errorMsg };
    }

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
          pushLogger.debug({ threadId: messageInfo.threadId }, "PUSH_FETCH_THREAD_MESSAGES");
          const threadMessages = await larkClient.getThreadMessages(messageInfo.threadId);
          pushLogger.debug({ threadMessageCount: threadMessages.items.length }, "PUSH_THREAD_MESSAGES_RECEIVED");
          const firstMessage = threadMessages.items[0];
          if (firstMessage?.message_id) {
            targetMessageId = firstMessage.message_id;
          }

          if (targetMessageId) {
            pushLogger.debug({ threadId: messageInfo.threadId, rootMessageId: targetMessageId }, "PUSH_REPLY_THREAD_START");
            const sendResult = await larkClient.replyToMessage(
              targetMessageId,
              "text",
              JSON.stringify({ text: larkUpdateMessage }),
              { reply_in_thread: true },
            );
            messageSent = true;
            pushLogger.info({ messageId: sendResult.message_id }, "PUSH_MESSAGE_OK");
          } else {
            pushLogger.warn({ threadId: messageInfo.threadId }, "PUSH_THREAD_NO_ROOT_MESSAGE");
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
      resolvedTypeKey,
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

    if (error instanceof MeegleAuthenticationError) {
      return {
        ok: false,
        error: "Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。",
      };
    }

    return {
      ok: false,
      error: errorMessage,
    };
  }
}
