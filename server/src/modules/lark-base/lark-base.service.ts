import { LarkClient } from "../../adapters/lark/lark-client.js";
import {
  buildAuthenticatedLarkClient,
  type AuthenticatedLarkClientFactoryDeps,
} from "../../application/services/lark-auth-client.factory.js";
import type { UpdateLarkBaseMeegleLinkRequest } from "./lark-base.dto.js";

const MEEGLE_LINK_FIELD_NAME = "meegle链接";

export interface UpdateLarkBaseMeegleLinkDeps extends AuthenticatedLarkClientFactoryDeps {
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

  console.log("[LarkBaseService] updateLarkBaseMeegleLink", {
    baseId: request.baseId,
    tableId: request.tableId,
    recordId: request.recordId,
    meegleLinkRaw: request.meegleLink,
    meegleLinkValue,
  });

  const result = await client.updateRecord(
    request.baseId,
    request.tableId,
    request.recordId,
    {
      [MEEGLE_LINK_FIELD_NAME]: meegleLinkValue,
    },
  );

  console.log("[LarkBaseService] updateLarkBaseMeegleLink success", { recordId: result.record_id });

  return {
    ok: true,
    recordId: result.record_id,
  };
}
