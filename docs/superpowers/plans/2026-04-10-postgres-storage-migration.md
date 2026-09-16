# PostgreSQL Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move server persistence from SQLite to PostgreSQL, with a one-time import path for existing SQLite data.

**Architecture:** Add a shared `Kysely + pg` database layer for runtime, keep the current store interfaces, and isolate SQLite usage to a dedicated import script. Preserve the current table shapes and uniqueness constraints so service behavior remains unchanged.

**Tech Stack:** TypeScript, Kysely, pg, node:sqlite, Vitest

---

### Task 1: Add failing PostgreSQL persistence tests

**Files:**
- Create: `server/src/adapters/postgres/test-db.ts`
- Create: `server/src/adapters/postgres/database.test.ts`
- Create: `server/src/adapters/postgres/resolved-user-store.test.ts`
- Create: `server/src/adapters/postgres/lark-token-store.test.ts`
- Create: `server/src/adapters/postgres/meegle-token-store.test.ts`
- Create: `server/src/adapters/postgres/lark-oauth-session-store.test.ts`

- [ ] **Step 1: Write failing tests for schema creation and store behavior**
- [ ] **Step 2: Run targeted Vitest commands and confirm failures are due to missing PostgreSQL implementation**
- [ ] **Step 3: Implement minimal PostgreSQL database module and stores**
- [ ] **Step 4: Re-run targeted tests and confirm they pass**

### Task 2: Switch runtime and service wiring

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/modules/lark-auth/lark-auth.service.test.ts`
- Modify: `server/src/modules/lark-auth/lark-auth.controller.test.ts`
- Modify: `server/src/modules/meegle-auth/meegle-auth.controller.test.ts`
- Modify: `server/src/modules/identity/identity.controller.test.ts`
- Modify: `server/src/application/services/meegle-apply.service.test.ts`

- [ ] **Step 1: Replace SQLite-backed imports with PostgreSQL-backed runtime/test wiring**
- [ ] **Step 2: Run affected test files and confirm failures if any are wiring-related**
- [ ] **Step 3: Fix the minimal wiring issues**
- [ ] **Step 4: Re-run the affected tests and confirm they pass**

### Task 3: Add one-time SQLite import path

**Files:**
- Create: `server/src/scripts/database-import-sqlite.ts`
- Create: `server/src/scripts/database-import-sqlite.test.ts`
- Modify: `server/src/adapters/sqlite/database.ts`

- [ ] **Step 1: Write a failing import test that seeds SQLite and expects matching PostgreSQL rows**
- [ ] **Step 2: Run the import test and verify it fails because the importer does not exist**
- [ ] **Step 3: Implement row reads from SQLite and transactional upserts into PostgreSQL**
- [ ] **Step 4: Re-run the import test and verify it passes**

### Task 4: Update package scripts and docs

**Files:**
- Modify: `server/package.json`
- Modify: `server/.env.example`
- Modify: `server/README.md`

- [ ] **Step 1: Add dependency/scripts updates for PostgreSQL runtime and migration/import commands**
- [ ] **Step 2: Document `POSTGRES_URI` and the manual import flow**
- [ ] **Step 3: Run build/tests and confirm the documented commands exist and work**
