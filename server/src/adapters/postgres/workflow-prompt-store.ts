import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export interface WorkflowPromptRecord {
  key: string;
  prompt: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowPromptStore {
  getByKey(key: string): Promise<WorkflowPromptRecord | undefined>;
  upsert(input: {
    key: string;
    prompt: string;
    note?: string | null;
  }): Promise<WorkflowPromptRecord>;
}

function toRecord(
  row: Selectable<DatabaseSchema["workflow_prompts"]> | undefined,
): WorkflowPromptRecord | undefined {
  if (!row) {
    return undefined;
  }

  return {
    key: row.key,
    prompt: row.prompt,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresWorkflowPromptStore implements WorkflowPromptStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async getByKey(key: string): Promise<WorkflowPromptRecord | undefined> {
    return toRecord(
      await this.database.selectFrom("workflow_prompts")
        .selectAll()
        .where("key", "=", key)
        .executeTakeFirst(),
    );
  }

  async upsert(input: {
    key: string;
    prompt: string;
    note?: string | null;
  }): Promise<WorkflowPromptRecord> {
    const existing = await this.getByKey(input.key);
    const now = new Date().toISOString();
    const createdAt = existing?.createdAt ?? now;

    await this.database.insertInto("workflow_prompts")
      .values({
        key: input.key,
        prompt: input.prompt,
        note: input.note ?? null,
        created_at: createdAt,
        updated_at: now,
      })
      .onConflict((conflict) =>
        conflict.column("key").doUpdateSet({
          prompt: input.prompt,
          note: input.note ?? null,
          updated_at: now,
        }))
      .execute();

    return {
      key: input.key,
      prompt: input.prompt,
      note: input.note ?? null,
      createdAt,
      updatedAt: now,
    };
  }
}

let sharedWorkflowPromptStore: WorkflowPromptStore | undefined;

export function getWorkflowPromptStore(): WorkflowPromptStore {
  if (!sharedWorkflowPromptStore) {
    sharedWorkflowPromptStore = new PostgresWorkflowPromptStore();
  }

  return sharedWorkflowPromptStore;
}
