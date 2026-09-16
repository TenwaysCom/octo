import { sql, type Kysely } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import { MEEGLE_SPRINT_API_NAME, MEEGLE_SPRINT_WORKITEM_TYPE_KEY } from "../../domain/meegle-workitem-types.js";

export interface PlatformSearchRow {
  kind: "lark-tickets" | "meegle-workitems" | "github-pull-requests";
  title: string;
  number: string;
  status: string;
  scope: string;
  source_id: string;
  item_type_key: string | null;
  item_type: string | null;
  url: string | null;
}

export class PostgresPlatformSearchStore {
  constructor(private readonly database?: Kysely<DatabaseSchema>) {}

  private get db() { return this.database ?? getSharedDatabase(); }

  async search(input: { query: string; limit: number; offset: number; kind?: PlatformSearchRow["kind"] }) {
    const query = input.query.toLowerCase();
    const numberQuery = query.replace(/^#/, "") || query;
    const result = await sql<PlatformSearchRow>`
      with candidates as (
        select 'lark-tickets'::text as kind, title,
          coalesce(ticket_number, '') as number, coalesce(ticket_status, '') as status,
          base_id || '/' || table_id as scope, record_id as source_id,
          null::text as item_type_key, issue_type as item_type, null::text as url,
          coalesce(ticket_number, '') as search_number
        from lark_base_ticket_syncs
        union all
        select 'meegle-workitems', title, case when work_item_key is null or work_item_key = '' then work_item_id else work_item_key end,
          coalesce(status, ''), project_key, work_item_id, work_item_type_key, work_item_type,
          null::text, work_item_id
        from meegle_workitem_syncs
        where work_item_type_key not in (${MEEGLE_SPRINT_API_NAME}, ${MEEGLE_SPRINT_WORKITEM_TYPE_KEY})
        union all
        select 'github-pull-requests', title, pull_number::text,
          case when merged_at is not null then 'merged' when state = 'open' and is_draft then 'draft' else state end,
          owner || '/' || repo, pull_number::text, null::text, null::text, html_url, pull_number::text
        from github_pr_syncs
      )
      select kind, title, number, status, scope, source_id, item_type_key, item_type, url
      from candidates
      where (strpos(lower(title), ${query}) > 0
        or strpos(lower(number), ${numberQuery}) > 0
        or strpos(lower(search_number), ${numberQuery}) > 0)
      ${input.kind ? sql`and kind = ${input.kind}` : sql``}
      order by case when lower(number) = ${numberQuery} or lower(search_number) = ${numberQuery} then 0
        when lower(title) = ${query} then 1 else 2 end,
        lower(title), kind, scope, source_id, item_type_key
      limit ${input.limit} offset ${input.offset}
    `.execute(this.db);
    return result.rows;
  }

  async listTicketFilterOptions() {
    const rows = await this.db.selectFrom("lark_base_ticket_syncs")
      .select(["requester", "responsible", "issue_type"]).distinct().execute();
    const values = (key: "requester" | "responsible" | "issue_type", people = false) => [...new Set(rows.flatMap((row) => {
      const value = row[key] || "";
      return (people ? value.split(/[,，]/) : [value]).map((part) => part.trim()).filter(Boolean);
    }))].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
    return { requester: values("requester", true), responsible: values("responsible", true), issueType: values("issue_type") };
  }
}
