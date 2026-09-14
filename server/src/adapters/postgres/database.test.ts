import { describe, expect, it } from "vitest";
import { Kysely, PostgresDialect, sql } from "kysely";
import { newDb } from "pg-mem";
import { migrateLegacyLarkTicketSupportQaSummaryPrompt, renameLegacyUserSshPublicKeyIdColumn } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import { createTestPostgresDatabase } from "./test-db.js";
import {
  DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATE,
  LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY,
  LEGACY_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATES,
} from "../../domain/workflow-prompts.js";

describe("postgres database helpers", () => {
  it("seeds the fixed-snapshot Ticket Summary prompt on its established key", async () => {
    const { db } = await createTestPostgresDatabase();
    await expect(db.selectFrom("workflow_prompts")
      .select(["key", "prompt"])
      .where("key", "=", LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY)
      .executeTakeFirst()).resolves.toEqual(expect.objectContaining({
        key: LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY,
        prompt: expect.stringContaining('"version":"support-analysis-result-v1"'),
      }));
  });

  it("migrates the known ACP Summary default without overwriting arbitrary prompts", async () => {
    const { db } = await createTestPostgresDatabase();
    await db.updateTable("workflow_prompts")
      .set({ prompt: LEGACY_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATES[0] })
      .where("key", "=", LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY)
      .execute();

    await migrateLegacyLarkTicketSupportQaSummaryPrompt(db, "2026-09-04T01:00:00.000Z");

    await expect(db.selectFrom("workflow_prompts")
      .select("prompt")
      .where("key", "=", LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY)
      .executeTakeFirstOrThrow()).resolves.toEqual({
        prompt: DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATE,
      });

    await db.updateTable("workflow_prompts")
      .set({ prompt: "管理员自定义问题总结提示词" })
      .where("key", "=", LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY)
      .execute();
    await migrateLegacyLarkTicketSupportQaSummaryPrompt(db, "2026-09-04T02:00:00.000Z");
    await expect(db.selectFrom("workflow_prompts")
      .select("prompt")
      .where("key", "=", LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY)
      .executeTakeFirstOrThrow()).resolves.toEqual({ prompt: "管理员自定义问题总结提示词" });
  });

  it("allows the same lark id to exist under different tenant keys", async () => {
    const { db } = await createTestPostgresDatabase();

    await db.insertInto("users").values({
      id: "usr_1",
      status: "active",
      lark_tenant_key: "tenant_a",
      lark_id: "ou_same",
      lark_email: null,
      meegle_base_url: null,
      meegle_user_key: null,
      github_id: null,
      created_at: "2026-04-02T00:00:00.000Z",
      updated_at: "2026-04-02T00:00:00.000Z",
    }).execute();

    await expect(
      db.insertInto("users").values({
        id: "usr_2",
        status: "active",
        lark_tenant_key: "tenant_b",
        lark_id: "ou_same",
        lark_email: null,
        meegle_base_url: null,
        meegle_user_key: null,
        github_id: null,
        created_at: "2026-04-02T00:00:00.000Z",
        updated_at: "2026-04-02T00:00:00.000Z",
      }).execute(),
    ).resolves.toBeDefined();
  });

  it("rejects duplicate lark identities within the same tenant", async () => {
    const { db } = await createTestPostgresDatabase();

    await db.insertInto("users").values({
      id: "usr_1",
      status: "active",
      lark_tenant_key: "tenant_a",
      lark_id: "ou_same",
      lark_email: null,
      meegle_base_url: null,
      meegle_user_key: null,
      github_id: null,
      created_at: "2026-04-02T00:00:00.000Z",
      updated_at: "2026-04-02T00:00:00.000Z",
    }).execute();

    await expect(
      db.insertInto("users").values({
        id: "usr_2",
        status: "active",
        lark_tenant_key: "tenant_a",
        lark_id: "ou_same",
        lark_email: null,
        meegle_base_url: null,
        meegle_user_key: null,
        github_id: null,
        created_at: "2026-04-02T00:00:00.000Z",
        updated_at: "2026-04-02T00:00:00.000Z",
      }).execute(),
    ).rejects.toThrow();
  });

  it("renames the legacy SSH key_id primary key to the internal id column without losing data", async () => {
    const memoryDb = newDb();
    const adapter = memoryDb.adapters.createPg();
    const pool = new adapter.Pool();
    const db = new Kysely<DatabaseSchema>({ dialect: new PostgresDialect({ pool }) });
    await sql`
      CREATE TABLE user_ssh_public_keys (
        key_id text PRIMARY KEY,
        master_user_id text NOT NULL,
        public_key text NOT NULL,
        public_key_fingerprint text NOT NULL,
        status text NOT NULL,
        created_at text NOT NULL,
        updated_at text NOT NULL
      )
    `.execute(db);
    await sql`
      INSERT INTO user_ssh_public_keys (
        key_id, master_user_id, public_key, public_key_fingerprint, status, created_at, updated_at
      ) VALUES (
        'legacy_ssh_1', 'usr_1', 'ssh-ed25519 AAAA legacy@host', 'SHA256:legacy', 'active', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'
      )
    `.execute(db);

    await renameLegacyUserSshPublicKeyIdColumn(db);

    await expect(db.selectFrom("user_ssh_public_keys").select(["id", "public_key"]).executeTakeFirst()).resolves.toEqual({
      id: "legacy_ssh_1",
      public_key: "ssh-ed25519 AAAA legacy@host",
    });
  });
});
