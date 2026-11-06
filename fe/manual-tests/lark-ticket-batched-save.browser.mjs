// Real React App with synthetic API data. No real accounts, platform writes or cookies.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const require = createRequire(new URL("../../extension/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const server = await createServer({ root, configFile: `${root}/vite.config.js`, server: { host: "127.0.0.1", port: 4199, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.OCTO_FIELD_BROWSER_EXECUTABLE || "/opt/google/chrome/chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(6000);
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  const tickets = ["A", "B"].map((letter, index) => ({ baseId: "base", tableId: "table", recordId: `r${index + 1}`, title: `Synthetic Ticket ${letter}`,
    ticketNumber: `TEST-${index + 1}`, ticketStatus: "Open", priority: "P2", issueType: "Bug", businessLine: "Retail", responsible: "Ada", requester: "Ada",
    responsiblePeople: [{ name: "Ada", userId: "ou_ada" }], requesterPeople: [{ name: "Ada", userId: "ou_ada" }], solution: "Original solution",
    syncedAt: "2026-11-06T00:00:00Z", sharedUrl: "https://example.com/base", larkMessageLink: "https://example.com/thread" }));
  const keys = { status: "ticketStatus", priority: "priority", requester: "requester", responsible: "responsible", issueType: "issueType", businessLine: "businessLine" };
  const values = (ticket) => Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, { value: ticket[key],
    ...(["requester", "responsible"].includes(field) ? { userIds: ticket[`${field}People`].map((p) => p.userId) } : {}) }]));
  const writes = [], receipts = new Map(); let syncs = 0, readbacks = 0, queries = 0, abortNext = false, account = "fixture-user";
  await page.route("https://**/*", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()), path = url.pathname;
    const ok = (data) => route.fulfill({ json: { ok: true, data } });
    const ticket = tickets.find((t) => path.includes(`/${t.recordId}/`));
    if (path === "/api/web/profile") return ok({ user: { id: account, larkName: "Synthetic QA" }, workspaceAccess: { platformLists: true, platformSync: true } });
    if (path === "/api/web/platform-data/lark-tickets") return ok({ items: structuredClone(tickets) });
    if (path.endsWith("lark-ticket-filter-options")) return ok({ requester: ["Ada"], responsible: ["Ada"], issueType: ["Bug", "Feature"] });
    if (path.endsWith("field-options")) return ok({ fields: [
      ...[["status", ["Open", "Finish"]], ["priority", ["P0", "P1", "P2"]], ["issueType", ["Bug", "Feature"]], ["businessLine", ["Retail", "B2B sales"]]]
        .map(([field, options]) => ({ field, kind: "select", options: options.map((label) => ({ label })) })),
      ...["responsible", "requester"].map((field) => ({ field, kind: "user", options: [{ label: "Ada", userId: "ou_ada" }, { label: "Lin", userId: "ou_lin" }] })),
    ] });
    if (path.endsWith("/editable-fields")) { readbacks++; return ok({ ticket, values: values(ticket) }); }
    if (path.endsWith("/field-submissions")) {
      const input = route.request().postDataJSON();
      assert.equal(input.expectedUserId, account);
      const write = { input, route, ticket }; writes.push(write);
      receipts.set(input.submissionId, { state: abortNext ? "unknown" : "writing", submissionId: input.submissionId, actionRunId: input.actionRunId });
      if (abortNext) { abortNext = false; return route.abort("timedout"); }
      return;
    }
    const receipt = path.match(/\/field-submissions\/([^/]+)(?:\/(reconcile|sync))?$/);
    if (receipt) {
      const result = receipts.get(receipt[1]);
      if (receipt[2] === "sync") { syncs++; result.state = "saved"; result.syncFailed = false; }
      else if (receipt[2] === "reconcile") readbacks++;
      else queries++;
      return ok(result);
    }
    if (path.endsWith("ai-sessions")) return ok({ sessions: [] });
    if (path.endsWith("shared-url")) return ok({ sharedUrl: "https://example.com/base" });
    return route.fulfill({ status: 503, json: { ok: false, error: { errorCode: "SYNTHETIC_UNAVAILABLE" } } });
  });
  function savedResult(write, partial = false) {
    for (const change of write.input.changes) {
      write.ticket[keys[change.field]] = change.value;
      if (change.optionUserId) write.ticket[`${change.field}People`] = [{ name: change.value, userId: change.optionUserId }];
    }
    return { submissionId: write.input.submissionId, actionRunId: write.input.actionRunId, state: partial ? "saved_pending_sync" : "saved",
      larkBaseUpdated: true, syncFailed: partial, ticket: structuredClone(write.ticket), values: values(write.ticket) };
  }
  async function complete(index, partial = false) {
    await expect.poll(() => writes.length).toBeGreaterThan(index);
    const write = writes[index], result = savedResult(write, partial);
    receipts.set(write.input.submissionId, result);
    await write.route.fulfill({ json: { ok: true, data: result } });
  }
  const property = (label) => page.getByRole("button", { name: `修改${label}`, exact: true });
  async function select(label, value) {
    await property(label).click(); await page.getByRole("menuitemradio", { name: value, exact: true }).click();
  }
  await page.goto("http://127.0.0.1:4199/#lark-tickets");
  await page.getByRole("button", { name: /Open/ }).first().click();
  await page.getByRole("link", { name: "Synthetic Ticket A", exact: true }).click();
  await expect(property("紧急度")).toHaveCount(1);
  await select("紧急度", "P0"); await select("状态", "Finish"); await select("负责人", "Lin");
  await expect(property("紧急度")).toContainText("P0"); assert.equal(writes.length, 0);
  await expect.poll(() => writes.length).toBe(1);
  assert.equal(writes[0].input.changes.length, 3);
  await select("紧急度", "P1"); await complete(0);
  await expect(property("紧急度")).toContainText("P1");
  await expect.poll(() => writes.length).toBe(2); await complete(1);
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await select("紧急度", "P0"); await select("紧急度", "P1");
  await page.waitForTimeout(1200); assert.equal(writes.length, 2);
  process.stdout.write("PASS: three properties share one submission, in-flight edits stay independent, reverting sends nothing\n");

  // Navigation keeps the shared queue and optimistic list projection.
  await select("紧急度", "P0");
  await page.evaluate(() => { window.location.hash = "#lark-tickets"; });
  const finishGroup = page.locator(".grouped-list__header").filter({ hasText: "Finish" });
  await expect(finishGroup).toBeVisible();
  if (await finishGroup.getAttribute("aria-expanded") === "false") await finishGroup.click();
  await expect(page.getByRole("link", { name: "Synthetic Ticket A", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Synthetic Ticket A", exact: true }).click();
  await expect(property("紧急度")).toHaveCount(1);
  await expect(property("紧急度")).toContainText("P0");
  await complete(2);

  // Partial success only retries synchronization.
  await select("类型", "Feature"); await complete(3, true);
  await expect(page.getByText("已保存，待同步", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "重试同步", exact: true }).click();
  await expect.poll(() => syncs).toBe(1); assert.equal(writes.length, 4);

  // A changed source value requires a concrete user decision and a new expected baseline.
  await select("紧急度", "P1"); await expect.poll(() => writes.length).toBe(5);
  tickets[0].priority = "P2";
  const conflict = { state: "conflict", larkBaseUpdated: false, conflicts: ["priority"], values: values(tickets[0]), errorMessage: "属性已被其他人修改" };
  receipts.set(writes[4].input.submissionId, conflict); await writes[4].route.fulfill({ json: { ok: true, data: conflict } });
  await expect(page.getByText(/我的选择「P1」，Lark 最新「P2」/)).toBeVisible();
  await page.getByRole("button", { name: "保留我的选择并重试", exact: true }).click();
  await expect.poll(() => writes.length).toBe(6);
  assert.equal(writes[5].input.changes[0].expected.value, "P2"); await complete(5);
  process.stdout.write("PASS: navigation keeps drafts, partial success retries only sync, conflicts require an explicit choice\n");

  // A lost response is reconciled by ID; later edits remain drafts across a reload.
  abortNext = true; await select("紧急度", "P0");
  await expect(page.getByRole("button", { name: "重新核对", exact: true })).toBeVisible();
  await expect.poll(() => readbacks).toBeGreaterThan(0);
  await select("紧急度", "P2");
  await page.reload(); await expect(property("紧急度")).toContainText("P2");
  await page.waitForTimeout(1200); assert.equal(writes.length, 7);
  const recovered = savedResult(writes[6]); receipts.set(writes[6].input.submissionId, recovered);
  await page.getByRole("button", { name: "重新核对", exact: true }).click();
  await expect.poll(() => writes.length).toBe(8); await complete(7);
  assert.ok(queries >= 2);
  process.stdout.write("PASS: timeout queries/readback, paused editing, refresh recovery, and next-batch dispatch\n");

  // Reloading an unsent draft reads fresh values before dispatch. Account switching discards old drafts.
  await select("Business Line", "B2B sales"); await page.reload();
  await expect(property("Business Line")).toContainText("B2B sales");
  await complete(8);
  await select("需求人", "Lin"); account = "another-user"; await page.reload();
  await expect(property("需求人")).toContainText("Ada"); await page.waitForTimeout(1200); assert.equal(writes.length, 9);
  // The same six-field editor is wired in the narrow Lark App.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:4199/#lark-app-thread-analysis");
  await page.getByPlaceholder("搜索 Ticket 标题或编号…").fill("Synthetic Ticket B");
  await page.getByRole("link", { name: /Synthetic Ticket B/ }).click();
  await select("紧急度", "P0"); await select("类型", "Feature"); await complete(9);
  assert.equal(writes[9].input.changes.length, 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: fresh-source draft restore, account isolation and narrow Lark App batching\n");
} finally { await browser?.close(); await server.close(); }
