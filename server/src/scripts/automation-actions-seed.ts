import "dotenv/config";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  createPostgresDatabase,
  ensurePostgresSchema,
  getDefaultPostgresUri,
} from "../adapters/postgres/database.js";

const automationActionSeedSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  page_types: z.array(z.string()).optional(),
  url_regexes: z.array(z.string()).optional(),
  allowed_roles: z.array(z.string()).optional(),
  executor_type: z.enum(["action", "backend_api", "prompt"]),
  executor_config: z.record(z.string(), z.unknown()).optional(),
  presentation_type: z.enum(["open_chat", "preview_form"]).nullable().optional(),
});

const automationActionSeedsSchema = z.array(automationActionSeedSchema);

type AutomationActionSeed = z.infer<typeof automationActionSeedSchema>;

function parseArgs(argv: string[]): { filePath: string; postgresUri: string } {
  let postgresUri = getDefaultPostgresUri();
  let filePath = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--db" || arg === "--pg" || arg === "--postgres-uri") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error(`Missing value for ${arg}`);
      }
      postgresUri = next;
      index += 1;
      continue;
    }

    if (!filePath) {
      filePath = arg;
    }
  }

  if (!filePath) {
    throw new Error("Usage: pnpm automation-actions:seed <actions.json> [--postgres-uri <uri>]");
  }

  return { filePath, postgresUri };
}

async function readSeeds(filePath: string): Promise<AutomationActionSeed[]> {
  const raw = await readFile(filePath, "utf8");
  return automationActionSeedsSchema.parse(JSON.parse(raw));
}

async function main(): Promise<void> {
  const { filePath, postgresUri } = parseArgs(process.argv.slice(2));
  const seeds = await readSeeds(filePath);
  const db = createPostgresDatabase(postgresUri);
  const now = new Date().toISOString();

  try {
    await ensurePostgresSchema(db);

    for (const seed of seeds) {
      await db
        .insertInto("automation_actions")
        .values({
          id: seed.key,
          key: seed.key,
          title: seed.title,
          description: seed.description ?? null,
          enabled: seed.enabled ?? true,
          priority: seed.priority ?? 100,
          page_types: JSON.stringify(seed.page_types ?? []),
          url_regexes: JSON.stringify(seed.url_regexes ?? []),
          allowed_roles: JSON.stringify(seed.allowed_roles ?? []),
          executor_type: seed.executor_type,
          executor_config: JSON.stringify(seed.executor_config ?? {}),
          presentation_type: seed.presentation_type ?? null,
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column("key").doUpdateSet({
            title: seed.title,
            description: seed.description ?? null,
            enabled: seed.enabled ?? true,
            priority: seed.priority ?? 100,
            page_types: JSON.stringify(seed.page_types ?? []),
            url_regexes: JSON.stringify(seed.url_regexes ?? []),
            allowed_roles: JSON.stringify(seed.allowed_roles ?? []),
            executor_type: seed.executor_type,
            executor_config: JSON.stringify(seed.executor_config ?? {}),
            presentation_type: seed.presentation_type ?? null,
            updated_at: now,
          })
        )
        .execute();
    }

    console.log(`[automation-actions] upserted ${seeds.length} actions`);
  } finally {
    await db.destroy();
  }
}

void main();
