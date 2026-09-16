import { LarkClient } from "../../adapters/lark/lark-client.js";
import {
  buildAuthenticatedLarkClient,
  type AuthenticatedLarkClientFactoryDeps,
} from "../../application/services/lark-auth-client.factory.js";
import type {
  GetLarkRecordUrlRequest,
  UpdateLarkBaseMeegleLinkRequest,
} from "./lark-base.dto.js";
import { logger } from "../../logger.js";

const serviceLogger = logger.child({ module: "lark-base-service" });

const MEEGLE_LINK_FIELD_NAME = "meegle链接";

export interface UpdateLarkBaseMeegleLinkDeps extends AuthenticatedLarkClientFactoryDeps {
  createLarkClient?: (accessToken: string, baseUrl?: string) => LarkClient;
}

export interface GetLarkRecordUrlDeps extends AuthenticatedLarkClientFactoryDeps {
  createLarkClient?: (accessToken: string, baseUrl?: string) => LarkClient;
}

export async function updateLarkBaseMeegleLink(
  request: UpdateLarkBaseMeegleLinkRequest,
  deps: UpdateLarkBaseMeegleLinkDeps = {},
): Promise<{ ok: true; recordId: string }> {
  const { client } = await buildAuthenticatedLarkClient(
    request.masterUserId,
    "https://open.larksuite.com",
    deps,
  );

  // Lark URL fields require { text, link } object format for single URLs.
  // For multi-line links (multiple workitems), fall back to plain string.
  const meegleLinkValue = request.meegleLink.includes("\n")
    ? request.meegleLink
    : { text: request.meegleLink, link: request.meegleLink };

  serviceLogger.info({
    baseId: request.baseId,
    tableId: request.tableId,
    recordId: request.recordId,
    meegleLinkRaw: request.meegleLink,
    meegleLinkValue,
  }, "UPDATE_MEEGLE_LINK START");

  const result = await client.updateRecord(
    request.baseId,
    request.tableId,
    request.recordId,
    {
      [MEEGLE_LINK_FIELD_NAME]: meegleLinkValue,
    },
  );

  serviceLogger.info({ recordId: result.record_id }, "UPDATE_MEEGLE_LINK OK");

  return {
    ok: true,
    recordId: result.record_id,
  };
}

export async function getLarkRecordUrl(
  request: GetLarkRecordUrlRequest,
  deps: GetLarkRecordUrlDeps = {},
): Promise<{ ok: true; recordId: string; recordUrl: string }> {
  const { client } = await buildAuthenticatedLarkClient(
    request.masterUserId,
    "https://open.larksuite.com",
    deps,
  );

  const data = await client.batchGetRecords(
    request.baseId,
    request.tableId,
    [request.recordId],
    { withSharedUrl: true },
  );

  const recordUrl = data.records[0]?.shared_url;
  if (!recordUrl) {
    throw new Error("Lark record shared URL not found");
  }

  return {
    ok: true,
    recordId: request.recordId,
    recordUrl,
  };
}
