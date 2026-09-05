import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export interface AcpKimiSprintSessionRef {
  sessionId: string;
  operatorLarkId: string;
  projectKey: string;
  sprintId: string;
  contextHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcpKimiSprintSessionStore {
  list(input: Pick<AcpKimiSprintSessionRef, "operatorLarkId" | "projectKey" | "sprintId">): Promise<AcpKimiSprintSessionRef[]>;
  get(sessionId: string): Promise<AcpKimiSprintSessionRef | undefined>;
  attach(input: Omit<AcpKimiSprintSessionRef, "createdAt" | "updatedAt">): Promise<AcpKimiSprintSessionRef>;
  touch(sessionId: string, operatorLarkId: string): Promise<void>;
}

function toRecord(row: Selectable<DatabaseSchema["acp_kimi_sprint_session_refs"]> | undefined): AcpKimiSprintSessionRef | undefined {
  if (!row) return undefined;
  return {
    sessionId: row.session_id,
    operatorLarkId: row.operator_lark_id,
    projectKey: row.project_key,
    sprintId: row.sprint_id,
    contextHash: row.context_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresAcpKimiSprintSessionStore implements AcpKimiSprintSessionStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async list(input: Pick<AcpKimiSprintSessionRef, "operatorLarkId" | "projectKey" | "sprintId">) {
    return (await this.database.selectFrom("acp_kimi_sprint_session_refs")
      .selectAll()
      .where("operator_lark_id", "=", input.operatorLarkId)
      .where("project_key", "=", input.projectKey)
      .where("sprint_id", "=", input.sprintId)
      .orderBy("updated_at", "desc")
      .execute()).map((row) => toRecord(row)!);
  }

  async get(sessionId: string) {
    return toRecord(await this.database.selectFrom("acp_kimi_sprint_session_refs")
      .selectAll().where("session_id", "=", sessionId).executeTakeFirst());
  }

  async attach(input: Omit<AcpKimiSprintSessionRef, "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    await this.database.insertInto("acp_kimi_sprint_session_refs")
      .values({
        session_id: input.sessionId,
        operator_lark_id: input.operatorLarkId,
        project_key: input.projectKey,
        sprint_id: input.sprintId,
        context_hash: input.contextHash,
        created_at: now,
        updated_at: now,
      })
      .onConflict((conflict) => conflict.column("session_id").doUpdateSet({ updated_at: now }))
      .execute();
    return (await this.get(input.sessionId))!;
  }

  async touch(sessionId: string, operatorLarkId: string) {
    await this.database.updateTable("acp_kimi_sprint_session_refs")
      .set({ updated_at: new Date().toISOString() })
      .where("session_id", "=", sessionId)
      .where("operator_lark_id", "=", operatorLarkId)
      .execute();
  }
}

let sharedStore: AcpKimiSprintSessionStore | undefined;

export function getAcpKimiSprintSessionStore(): AcpKimiSprintSessionStore {
  sharedStore ??= new PostgresAcpKimiSprintSessionStore();
  return sharedStore;
}
