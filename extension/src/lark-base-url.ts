export interface LarkBaseUrlContext {
  baseId?: string;
  tableId?: string;
  recordId?: string;
  viewId?: string;
  wikiRecordId?: string;
}

function readFirstSearchParam(
  params: URLSearchParams[],
  keys: string[],
): string | undefined {
  for (const key of keys) {
    for (const set of params) {
      const value = set.get(key)?.trim();
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

export function extractLarkBaseContextFromUrl(
  rawUrl: string | undefined,
): LarkBaseUrlContext {
  if (!rawUrl) {
    return {};
  }

  try {
    const url = new URL(rawUrl);
    const normalizedHash = decodeURIComponent(url.hash.replace(/^#/, ""));
    const routeCandidates = [url.pathname];
    if (normalizedHash) {
      routeCandidates.push(normalizedHash);
    }

    let baseId: string | undefined;
    let tableId: string | undefined;
    let recordId: string | undefined;
    let wikiRecordId: string | undefined;

    for (const candidate of routeCandidates) {
      const routeMatch = candidate.match(
        /\/base\/([^/?#]+)(?:\/table\/([^/?#]+))?(?:\/record\/([^/?#]+))?/,
      );
      if (!routeMatch) {
        continue;
      }

      baseId = routeMatch[1];
      tableId = routeMatch[2] || tableId;
      recordId = routeMatch[3] || recordId;
      break;
    }

    const hashQueryIndex = normalizedHash.indexOf("?");
    const params = [
      url.searchParams,
      new URLSearchParams(
        hashQueryIndex >= 0 ? normalizedHash.slice(hashQueryIndex + 1) : "",
      ),
    ];

    // Extract wiki record ID from /record/{id} pattern at root path (for Lark Wiki pages)
    // Wiki pages have format: /record/{id} or /record/{id}/view/...
    // Lark Base has format: /base/{baseId}/table/{tableId}/record/{recordId}
    // So we only extract wikiRecordId if the pathname starts with /record/
    const wikiRecordMatch = url.pathname.match(/^\/record\/([a-zA-Z0-9]+)/);
    if (wikiRecordMatch) {
      wikiRecordId = wikiRecordMatch[1];
    }

    return {
      baseId:
        baseId ??
        readFirstSearchParam(params, ["baseId", "appId", "app", "base"]),
      tableId:
        tableId ?? readFirstSearchParam(params, ["tableId", "table", "tbl"]),
      recordId:
        recordId ??
        readFirstSearchParam(params, ["recordId", "record", "record_id"]),
      viewId: readFirstSearchParam(params, ["viewId", "view"]),
      wikiRecordId,
    };
  } catch {
    return {};
  }
}
