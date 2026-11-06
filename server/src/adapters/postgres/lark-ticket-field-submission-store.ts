import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import type { TicketSubmissionResult, TicketSubmissionState } from "../../domain/lark-ticket-field-submission.js";

export type TicketSubmissionRow = Selectable<DatabaseSchema["lark_ticket_field_submissions"]>;
export interface TicketSubmissionStore {
  claim(input: TicketSubmissionRow): Promise<{ row?: TicketSubmissionRow; created: boolean }>;
  get(id: string): Promise<TicketSubmissionRow | undefined>;
  transition(id: string, from: TicketSubmissionState[], result: TicketSubmissionResult): Promise<TicketSubmissionRow | undefined>;
}
export class PostgresTicketSubmissionStore implements TicketSubmissionStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}
  private get database() { return this.db ?? getSharedDatabase(); }
  async claim(input: TicketSubmissionRow) {
    const created = await this.database.insertInto("lark_ticket_field_submissions").values(input).onConflict((c) => c.doNothing()).returningAll().executeTakeFirst();
    return { row: created ?? await this.get(input.submission_id), created: Boolean(created) };
  }
  async get(id: string) {
    return this.database.selectFrom("lark_ticket_field_submissions").selectAll().where("submission_id", "=", id).executeTakeFirst();
  }
  async transition(id: string, from: TicketSubmissionState[], result: TicketSubmissionResult) {
    return this.database.updateTable("lark_ticket_field_submissions").set({
      state: result.state, result_json: JSON.stringify(result), updated_at: new Date().toISOString(),
      ...(!["preparing", "writing", "unknown"].includes(result.state) ? { active_ticket_key: null } : {}),
    }).where("submission_id", "=", id).where("state", "in", from).returningAll().executeTakeFirst();
  }
}
