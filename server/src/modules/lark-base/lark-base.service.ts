import { LarkClient } from "../../adapters/lark/lark-client.js";
import { getSharedLarkTokenStore } from "../../adapters/postgres/lark-token-store.js";
import { refreshLarkToken } from "../lark-auth/lark-auth.service.js";
import type { UpdateLarkBaseMeegleLinkRequest } from "./lark-base.dto.js";

const MEEGLE_LINK_FIELD_NAME = "meegle链接";

export interface UpdateLarkBaseMeegleLinkDeps {
  getLarkTokenStore?: () => ReturnType<typeof getSharedLarkTokenStore>;
  refreshLarkToken?: typeof refreshLarkToken;
  createLarkClient?: (accessToken: string, baseUrl?: string) => LarkClient;
}

export async function updateLarkBaseMeegleLink(
  request: UpdateLarkBaseMeegleLinkRequest,
  deps: UpdateLarkBaseMeegleLinkDeps = {},
): Promise<{ ok: true; recordId: string }> {
  const tokenStore = deps.getLarkTokenStore?.() ?? getSharedLarkTokenStore();

  const stored = await tokenStore.get({
    masterUserId: request.masterUserId,
    baseUrl: "https://open.larksuite.com",
  });

  if (!stored) {
    throw new Error("Lark token not found for user");
  }

  let accessToken = stored.userToken;
  const expiresAt = stored.userTokenExpiresAt
    ? Date.parse(stored.userTokenExpiresAt)
    : 0;
  const isExpired = !expiresAt || expiresAt <= Date.now() + 60_000;

  if (isExpired && stored.refreshToken) {
    const refreshed = await (deps.refreshLarkToken ?? refreshLarkToken)({
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      refreshToken: stored.refreshToken,
    });
    accessToken = refreshed.accessToken;
  }

  const client = deps.createLarkClient
    ? deps.createLarkClient(accessToken, stored.baseUrl)
    : new LarkClient({ accessToken, baseUrl: stored.baseUrl });

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
