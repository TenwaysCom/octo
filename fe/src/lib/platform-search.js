import { getLarkTicketDetailHash } from "../app/routes/workspace-routes.js";
import { getMeegleWorkitemDetailUrl } from "./platform-list-rows.js";

export const PLATFORM_SEARCH_TYPES = {
  "lark-tickets": "Lark Ticket",
  "meegle-workitems": "Meegle Workitem",
  "github-pull-requests": "GitHub PR",
};

export function getPlatformSearchTarget(item) {
  if (item.kind === "lark-tickets") return { href: getLarkTicketDetailHash(item.sourceId), external: false };
  if (item.kind === "meegle-workitems" && item.workItemTypeKey) return {
    href: getMeegleWorkitemDetailUrl({ projectKey: item.scope, workItemId: item.sourceId, workItemTypeKey: item.workItemTypeKey, workItemType: item.issueType }),
    external: true,
  };
  if (item.kind === "github-pull-requests") {
    try {
      const url = new URL(item.url);
      if (["https:", "http:"].includes(url.protocol)) return { href: url.href, external: true };
    } catch { /* A malformed snapshot URL must not become a navigable link. */ }
  }
  return null;
}

export function getPlatformSearchKey(item) {
  return JSON.stringify([item.kind, item.scope, item.workItemTypeKey || "", item.sourceId]);
}
