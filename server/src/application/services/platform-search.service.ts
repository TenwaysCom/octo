import { PostgresPlatformSearchStore, type PlatformSearchRow } from "../../adapters/postgres/platform-search-store.js";

export function createPlatformSearchService(deps: {
  store?: Pick<PostgresPlatformSearchStore, "search" | "listTicketFilterOptions">;
} = {}) {
  const store = deps.store ?? new PostgresPlatformSearchStore();
  return {
    async search(input: { query: string; limit: number; offset: number; kind?: PlatformSearchRow["kind"] }) {
      const rows = await store.search({ ...input, limit: input.limit + 1 });
      const hasMore = rows.length > input.limit;
      return {
        items: rows.slice(0, input.limit).map((row) => ({
          kind: row.kind, title: row.title, number: row.number, status: row.status,
          scope: row.scope, sourceId: row.source_id,
          ...(row.item_type_key ? { workItemTypeKey: row.item_type_key } : {}),
          ...(row.item_type ? { issueType: row.item_type } : {}),
          ...(row.url ? { url: row.url } : {}),
        })),
        hasMore,
        ...(hasMore ? { nextOffset: input.offset + input.limit } : {}),
      };
    },
    listTicketFilterOptions: () => store.listTicketFilterOptions(),
  };
}
