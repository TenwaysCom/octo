# PostgreSQL Storage Migration Design

**Context**

The server currently persists identity, token, and OAuth session state directly through `node:sqlite` helpers under `server/src/adapters/sqlite/`. Runtime wiring in `server/src/index.ts` and multiple tests assume those SQLite-backed stores.

**Decision**

Move runtime persistence to PostgreSQL using `Kysely` with the `pg` driver. Keep SQLite support only as a legacy import source so existing `tenways-octo.sqlite` data can be copied into PostgreSQL once.

**Scope**

- Runtime reads and writes use PostgreSQL only.
- PostgreSQL connection string comes from env via `POSTGRES_URI`.
- Existing logical tables remain the same: `users`, `user_tokens`, `oauth_sessions`.
- Existing store interfaces stay stable so service/controller code does not need behavioral changes.
- A dedicated import script reads the current SQLite file and upserts all supported rows into PostgreSQL.

**Non-Goals**

- No bidirectional sync between SQLite and PostgreSQL.
- No automatic import on every server boot.
- No business-logic redesign above the store layer.

**Architecture**

Add a shared PostgreSQL database module that:

- creates a `Kysely` instance from `POSTGRES_URI`
- runs schema setup/migrations for the three persisted tables and indexes
- exposes a shared singleton for runtime code

Replace SQLite-backed stores with PostgreSQL-backed store implementations for:

- resolved users
- Lark tokens
- Meegle tokens
- Lark OAuth sessions

Keep the existing SQLite schema helper only for the import command, which:

- opens the legacy SQLite file
- reads rows from `users`, `user_tokens`, and `oauth_sessions`
- writes them into PostgreSQL with deterministic upsert rules

**Import Rules**

- `users`: upsert by `id`
- `user_tokens`: upsert by `(master_user_id, provider, provider_tenant_key, external_user_key, base_url)`
- `oauth_sessions`: upsert by `state`

**Operational Model**

1. Set `POSTGRES_URI` in env.
2. Run the PostgreSQL migration command to create schema.
3. Run the SQLite import command once against the existing SQLite file.
4. Start the server; runtime uses PostgreSQL only.

**Testing**

- Add PostgreSQL-backed store tests using an in-memory Postgres-compatible test harness.
- Add import tests that seed SQLite and verify the rows land in PostgreSQL.
- Keep service-level tests green by swapping test wiring to PostgreSQL-backed stores.
