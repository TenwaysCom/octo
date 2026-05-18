import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export interface AutomationActionRecord {
  id: string;
  key: string;
  title: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  pageTypes: string[];
  urlRegexes: string[];
  allowedRoles: string[];
  executorType: string;
  executorConfig: Record<string, unknown>;
  presentationType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationActionStore {
  listEnabled(): Promise<AutomationActionRecord[]>;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return toStringArray(JSON.parse(value));
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return toObject(JSON.parse(value));
    } catch {
      return {};
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toRecord(
  row: Selectable<DatabaseSchema["automation_actions"]>,
): AutomationActionRecord {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    enabled: row.enabled,
    priority: row.priority,
    pageTypes: toStringArray(row.page_types),
    urlRegexes: toStringArray(row.url_regexes),
    allowedRoles: toStringArray(row.allowed_roles),
    executorType: row.executor_type,
    executorConfig: toObject(row.executor_config),
    presentationType: row.presentation_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresAutomationActionStore implements AutomationActionStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async listEnabled(): Promise<AutomationActionRecord[]> {
    const rows = await this.database
      .selectFrom("automation_actions")
      .selectAll()
      .where("enabled", "=", true)
      .orderBy("priority", "asc")
      .orderBy("title", "asc")
      .execute();

    return rows.map(toRecord);
  }
}

let defaultStore: AutomationActionStore | undefined;

export function configureAutomationActionStore(store: AutomationActionStore): void {
  defaultStore = store;
}

export function getAutomationActionStore(): AutomationActionStore {
  if (!defaultStore) {
    defaultStore = new PostgresAutomationActionStore();
  }

  return defaultStore;
}
