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
import { MeegleAuthenticationError, type MeegleClient, type MeegleUser } from "../../adapters/meegle/meegle-client.js";
import { refreshCredential } from "./meegle-credential.service.js";
import { getConfiguredMeegleAuthServiceDeps } from "../../modules/meegle-auth/meegle-auth.service.js";
import { logger } from "../../logger.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import {
  createActionErrorEnvelope,
  createActionErrorEnvelopeFromError,
  type ActionErrorEnvelope,
} from "../action-error-envelope.js";
import { LarkContactClient } from "../../adapters/lark/contact-client.js";
import { getLarkContactStore } from "../../adapters/postgres/lark-contact-store.js";
import {
  resolveLarkContactsByEmails,
  type LarkContactResolver,
  type MeegleContactUser,
  type ResolvedLarkContact,
} from "./lark-contact-resolver.service.js";

const pushLogger = logger.child({ module: "meegle-lark-push-service" });
const MODULE = "meegle-lark-push";

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
  actionRunId?: string;
}

export interface MeegleLarkPushResult {
  ok: boolean;
  alreadyUpdated?: boolean;
  larkBaseUpdated?: boolean;
  messageSent?: boolean;
  reactionAdded?: boolean;
  meegleStatusUpdated?: boolean;
  error?: string | ActionErrorEnvelope;
}

export interface MeegleLarkPushDeps
  extends AuthenticatedLarkClientFactoryDeps, MeegleClientFactoryDeps {
  larkContactResolver?: LarkContactResolver;
}

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

interface FollowerReferences {
  emails: string[];
  userKeys: string[];
}

function extractFollowerReferences(workitem: { fields: Record<string, unknown> }): FollowerReferences {
  const emails: string[] = [];
  const userKeys: string[] = [];
  const fields = workitem.fields;

  for (const key of ["followers", "follower", "watchers", "watcher"]) {
    collectFollowerValue(fields[key], { emails, userKeys });
  }

  const fieldValuePairs = fields.fields;
  if (Array.isArray(fieldValuePairs)) {
    for (const pair of fieldValuePairs) {
      if (!pair || typeof pair !== "object") {
        continue;
      }

      const fieldPair = pair as Record<string, unknown>;
      const label = [
        fieldPair.field_key,
        fieldPair.field_alias,
        fieldPair.field_name,
        fieldPair.name,
      ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();

      if (label.includes("follower") || label.includes("watcher")) {
        collectFollowerValue(fieldPair.field_value, { emails, userKeys });
      }
    }
  }

  return {
    emails: uniqueValues(emails.map((email) => email.toLowerCase())),
    userKeys: uniqueValues(userKeys),
  };
}

function collectFollowerValue(value: unknown, output: FollowerReferences): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.includes("@")) {
      output.emails.push(trimmed);
    } else if (isLikelyMeegleUserKey(trimmed)) {
      output.userKeys.push(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFollowerValue(item, output);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const obj = value as Record<string, unknown>;
  collectFollowerValue(obj.email, output);
  collectFollowerValue(obj.enterprise_email, output);
  collectFollowerValue(obj.enterpriseEmail, output);
  collectFollowerValue(obj.user_key, output);
  collectFollowerValue(obj.userKey, output);
  collectFollowerValue(obj.username, output);
  collectFollowerValue(obj.value, output);
}

function isLikelyMeegleUserKey(value: string): boolean {
  return /^\d{10,}$/.test(value);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

async function resolveMeegleFollowerUsers(input: {
  userKeys: string[];
  meegleClient?: Pick<MeegleClient, "getUsers">;
}): Promise<MeegleContactUser[]> {
  if (input.userKeys.length === 0 || !input.meegleClient) {
    return [];
  }

  const users = await input.meegleClient.getUsers(input.userKeys);
  return users.flatMap((user) => {
    const contact = normalizeMeegleContactUser(user);
    return contact ? [contact] : [];
  });
}

function normalizeMeegleContactUser(user: MeegleUser): MeegleContactUser | undefined {
  const userKey = user.user_key.trim();
  const email = user.email.trim().toLowerCase();
  if (!userKey) {
    return undefined;
  }

  return {
    userKey,
    email: email.includes("@") ? email : null,
    name: user.name || null,
  };
}

async function buildMessageWithFollowerMentions(input: {
  workitem: { fields: Record<string, unknown> };
  message: string;
  larkBaseUrl: string;
  meegleClient?: Pick<MeegleClient, "getUsers">;
  deps: MeegleLarkPushDeps;
}): Promise<string> {
  const followerReferences = extractFollowerReferences(input.workitem);
  if (followerReferences.emails.length === 0 && followerReferences.userKeys.length === 0) {
    return input.message;
  }

  const resolver = input.deps.larkContactResolver ?? getDefaultLarkContactResolver(input.larkBaseUrl);
  if (!resolver) {
    pushLogger.warn({
      emailCount: followerReferences.emails.length,
      userKeyCount: followerReferences.userKeys.length,
    }, "PUSH_LARK_CONTACT_RESOLVER_UNAVAILABLE");
    return input.message;
  }

  try {
    const meegleUsers = await resolveMeegleFollowerUsers({
      userKeys: followerReferences.userKeys,
      meegleClient: input.meegleClient,
    });
    const emails = uniqueValues([
      ...followerReferences.emails,
      ...meegleUsers.flatMap((user) => user.email ? [user.email] : []),
    ]);
    if (emails.length === 0 && meegleUsers.length === 0) {
      return input.message;
    }

    const contacts = await resolver.resolveByEmails(emails, { meegleUsers });
    const mentions = formatLarkMentions(contacts);
    return mentions ? `${mentions}\n${input.message}` : input.message;
  } catch (error) {
    pushLogger.warn({
      emailCount: followerReferences.emails.length,
      userKeyCount: followerReferences.userKeys.length,
      errorMessage: error instanceof Error ? error.message : String(error),
    }, "PUSH_LARK_CONTACT_RESOLVE_FAILED");
    return input.message;
  }
}

function getDefaultLarkContactResolver(baseUrl: string): LarkContactResolver | undefined {
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  if (!appId || !appSecret) {
    return undefined;
  }

  const lookupClient = new LarkContactClient({
    appId,
    appSecret,
    baseUrl,
  });

  return {
    resolveByEmails: (emails, options) => resolveLarkContactsByEmails({
      emails,
      store: getLarkContactStore(),
      lookupClient,
      meegleUsers: options?.meegleUsers,
    }),
  };
}

function formatLarkMentions(contacts: ResolvedLarkContact[]): string {
  return contacts
    .map((contact) => {
      const label = contact.name || contact.email || contact.openId;
      return `<at user_id="${escapeLarkText(contact.openId)}">${escapeLarkText(label)}</at>`;
    })
    .join(" ");
}

function escapeLarkText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function executeMeegleLarkPush(
  request: MeegleLarkPushRequest,
  deps: MeegleLarkPushDeps = {},
): Promise<MeegleLarkPushResult> {
  pushLogger.info({
    actionRunId: request.actionRunId,
    projectKey: request.projectKey,
    workItemTypeKey: request.workItemTypeKey,
    workItemId: request.workItemId,
    masterUserId: request.masterUserId,
  }, "server.workflow.started");

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
      const errorEnvelope = createActionErrorEnvelope({
        module: MODULE,
        stage: "server.workflow.failed",
        errorCode: "MISSING_LARK_FIELDS",
        errorMessage: errorMsg,
        actionRunId: request.actionRunId,
      });
      pushLogger.warn({ ...errorEnvelope, workItemId: request.workItemId, missingActionFields }, "server.workflow.failed");
      return { ok: false, error: errorEnvelope };
    }

    if (larkUpdateStatus === "updated") {
      pushLogger.info({ actionRunId: request.actionRunId, workItemId: request.workItemId }, "server.workflow.completed");
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
      const larkMessageText = await buildMessageWithFollowerMentions({
        workitem,
        message: larkUpdateMessage,
        larkBaseUrl: request.larkBaseUrl || "https://open.larksuite.com",
        meegleClient,
        deps,
      });
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

          // For reply: use root_id of any thread message (the root message itself is not in the list)
          const firstMessage = threadMessages.items[0];
          const rootMessageId = firstMessage?.root_id;

          // For reaction: use the root message
          if (rootMessageId) {
            targetMessageId = rootMessageId;
          }

          if (rootMessageId) {
            pushLogger.debug({ threadId: messageInfo.threadId, rootMessageId }, "PUSH_REPLY_THREAD_START");
            const sendResult = await larkClient.replyToMessage(
              rootMessageId,
              "text",
              JSON.stringify({ text: larkMessageText }),
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
            JSON.stringify({ text: larkMessageText }),
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
          await larkClient.addMessageReaction(targetMessageId, "DONE");
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

    pushLogger.info({
      actionRunId: request.actionRunId,
      workItemId: request.workItemId,
      larkBaseUpdated,
      messageSent,
      reactionAdded,
      meegleStatusUpdated: true,
    }, "server.workflow.completed");

    return {
      ok: true,
      larkBaseUpdated,
      messageSent,
      reactionAdded,
      meegleStatusUpdated: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorEnvelope = createActionErrorEnvelopeFromError(error, {
      module: MODULE,
      stage: "server.workflow.failed",
      errorCode: error instanceof MeegleAuthenticationError ? "MEEGLE_AUTH_ERROR" : "PUSH_FAILED",
      errorMessage: error instanceof MeegleAuthenticationError
        ? "Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。"
        : errorMessage,
      actionRunId: request.actionRunId,
    });
    pushLogger.error({
      actionRunId: request.actionRunId,
      workItemId: request.workItemId,
      error: errorEnvelope.errorMessage,
      errorCode: errorEnvelope.errorCode,
      rawStatusCode: errorEnvelope.rawStatusCode,
      rawResponseSummary: errorEnvelope.rawResponseSummary,
    }, "server.workflow.failed");

    return {
      ok: false,
      error: errorEnvelope,
    };
  }
}
