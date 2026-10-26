// Browser mock integration against the real App. No credentials or external platform writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const require = createRequire(new URL("../../extension/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const server = await createServer({ root, configFile: `${root}/vite.config.js`, server: { host: "127.0.0.1", port: 4198, strictPort: true } });
let browser, page;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.OCTO_FIELD_BROWSER_EXECUTABLE
    ? { executablePath: process.env.OCTO_FIELD_BROWSER_EXECUTABLE } : {}) });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const tickets = ["A", "B"].map((letter, index) => ({ baseId: "b", tableId: "t", recordId: `r${index + 1}`,
    title: `Synthetic Ticket ${letter}`, ticketNumber: `TEST-${index + 1}`, ticketStatus: "Open", priority: "P2",
    issueType: "Bug", responsible: "Ada", requester: "Ada", solution: "Original solution", syncedAt: "2026-10-21T00:00:00Z", sharedUrl: "https://example.com/base", larkMessageLink: "https://example.com/discussion" }));
  const writes = [];
  const creates = [];
  let allowEditing = true;
  const fieldKeys = { status: "ticketStatus", priority: "priority", responsible: "responsible", requester: "requester",
    issueType: "issueType", businessLine: "businessLine", solution: "solution" };
  await page.route("https://**/*", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data) => route.fulfill({ json: { ok: true, data } });
    if (path === "/api/web/profile") return ok({ user: { id: "fixture-user", larkName: "Synthetic QA" }, workspaceAccess: { platformLists: true, platformSync: allowEditing } });
    if (path === "/api/web/platform-data/lark-tickets") return ok({ items: structuredClone(tickets) });
    if (path === "/api/web/platform-data/lark-ticket-filter-options") return ok({ requester: ["Ada"], responsible: ["Ada"], issueType: ["Bug"] });
    if (path.endsWith("/field-options")) return ok({ fields: [
      { field: "status", kind: "select", options: ["Open", "In Progress", "Finish"].map((label) => ({ label })) },
      { field: "priority", kind: "select", options: ["P0", "P1", "P2"].map((label) => ({ label })) },
      { field: "responsible", kind: "user", options: [{ label: "Ada", userId: "ou_a" }, { label: "Lin", userId: "ou_l" }] },
      { field: "requester", kind: "user", options: [{ label: "Ada", userId: "ou_a" }, { label: "Lin", userId: "ou_l" }] },
      { field: "issueType", kind: "select", options: ["Bug", "Feature"].map((label) => ({ label })) },
      { field: "businessLine", kind: "select", options: ["Retail", "B2B sales"].map((label) => ({ label })) },
    ] });
    if (path.endsWith("/fields")) {
      writes.push({ route, input: route.request().postDataJSON(), recordId: path.split("/").at(-2) });
      return;
    }
    if (path.endsWith("/create-meegle-workitem")) {
      creates.push({ route, input: route.request().postDataJSON(), recordId: path.split("/").at(-2) });
      return;
    }
    if (path.endsWith("/ai-sessions")) return ok({ sessions: [] });
    return route.fulfill({ status: 503, json: { ok: false, error: { errorCode: "FIXTURE_UNAVAILABLE" } } });
  });
  async function complete(index, { failure = false, partial = false } = {}) {
    await expect.poll(() => writes.length).toBeGreaterThan(index);
    const { route, input, recordId } = writes[index];
    if (failure) return route.fulfill({ status: 502, json: { ok: false, error: { errorCode: "MOCK_WRITE_REJECTED", errorMessage: "模拟写入失败" } } });
    const ticket = tickets.find((item) => item.recordId === recordId);
    const oldProjection = structuredClone(ticket);
    ticket[fieldKeys[input.field]] = input.value;
    await route.fulfill({ json: { ok: true, data: { larkBaseUpdated: true, field: input.field, recordId,
      ...(partial ? { syncFailed: true } : { ticket: { ...oldProjection, [fieldKeys[input.field]]: input.value } }) } } });
  }
  const property = (label) => page.getByRole("button", { name: `修改${label}`, exact: true });
  async function select(label, value) {
    await property(label).click();
    await page.getByRole("menuitemradio", { name: value, exact: true }).click();
    await expect(page.getByRole("menu", { name: `修改${label}`, exact: true })).toHaveCount(0);
  }

  await page.goto("http://127.0.0.1:4198/#lark-tickets");
  await page.getByRole("button", { name: /Open/ }).first().click();
  await page.getByRole("link", { name: "Synthetic Ticket A", exact: true }).click();
  await select("状态", "In Progress");
  await select("紧急度", "P0");
  await select("状态", "Finish");
  await expect(property("状态")).toContainText("Finish");
  await expect(property("紧急度")).toContainText("P0");
  await expect(property("负责人")).toBeEnabled();
  assert.equal(writes.length, 1, "later writes must remain queued while the first response is withheld");
  await complete(0);
  await expect.poll(() => writes.length).toBe(2);
  await expect(property("状态")).toContainText("Finish");
  await expect(property("紧急度")).toContainText("P0");
  await complete(1);
  await expect.poll(() => writes.length).toBe(3);
  await page.getByRole("button", { name: "下一条", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic Ticket B", exact: true })).toBeVisible();
  await complete(2, { failure: true });
  await page.getByRole("button", { name: "上一条", exact: true }).click();
  await expect(property("状态")).toContainText("In Progress");
  await expect(property("紧急度")).toContainText("P0");
  await expect(page.getByRole("alert").filter({ hasText: "模拟写入失败" })).toBeVisible();
  process.stdout.write("PASS: immediate detail feedback, consecutive edits, FIFO, old response protection and rollback after navigation\n");

  await select("状态", "Finish");
  await select("状态", "Open");
  await complete(3, { failure: true });
  await expect(property("状态")).toContainText("Open");
  await complete(4, { failure: true });
  await expect(property("状态")).toContainText("In Progress");
  process.stdout.write("PASS: two consecutive failures restore the confirmed value\n");

  await page.evaluate(() => { location.hash = "#lark-tickets"; });
  const row = page.locator(".workitem-row").filter({ has: page.getByRole("link", { name: "Synthetic Ticket A", exact: true }) });
  await row.getByRole("button", { name: "修改紧急度", exact: true }).click();
  await page.getByRole("menuitem", { name: /^P1/ }).click();
  await expect(row.getByRole("button", { name: "修改紧急度", exact: true })).toContainText("P1");
  await expect(page.getByRole("menu", { name: "Ticket 快捷动作", exact: true })).toHaveCount(0);
  await row.getByRole("button", { name: "修改负责人", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Lin/ }).click();
  await expect(row.getByRole("button", { name: "修改负责人", exact: true })).toContainText("Lin");
  await expect.poll(() => writes.length).toBe(6);
  await complete(5, { failure: true });
  await expect(row.getByRole("button", { name: "修改紧急度", exact: true })).toContainText("P0");
  await expect.poll(() => writes.length).toBe(7);
  assert.equal(writes[6].input.optionUserId, "ou_l");
  await complete(6, { partial: true });
  await expect(row.getByRole("button", { name: "修改负责人", exact: true })).toContainText("Lin");
  await expect(page.getByRole("alert").filter({ hasText: "已写入 Lark Base" })).toBeVisible();
  process.stdout.write("PASS: list immediate feedback, continuous edits, field-only rollback and partial success\n");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { location.hash = "#lark-app-thread-analysis?baseId=b&tableId=t&recordId=r1"; });
  await expect(page.getByRole("heading", { name: "Synthetic Ticket A", exact: true })).toBeVisible();
  for (const label of ["状态", "紧急度", "需求人", "负责人", "类型", "Business Line"]) await expect(property(label)).toBeVisible();
  assert(await property("状态").locator(".lark-ticket-badge").evaluate((element) => element.getBoundingClientRect().height < 32), "short status labels should not wrap into a narrow column");
  if (process.env.OCTO_FIELD_SCREENSHOT) await page.screenshot({ path: process.env.OCTO_FIELD_SCREENSHOT });
  await page.getByLabel("回复草稿", { exact: true }).fill("Keep my reply draft");
  await select("紧急度", "P1");
  await select("需求人", "Lin");
  await expect(property("紧急度")).toContainText("P1");
  await expect(property("需求人")).toContainText("Lin");
  await expect.poll(() => writes.length).toBe(8);
  await complete(7);
  await expect.poll(() => writes.length).toBe(9);
  await expect(property("需求人")).toContainText("Lin");
  await expect(page.getByLabel("回复草稿", { exact: true })).toHaveValue("Keep my reply draft");
  assert.equal(writes[8].input.optionUserId, "ou_l");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole("searchbox", { name: "搜索 Ticket 标题" }).fill("Synthetic Ticket B");
  await page.locator(".lark-app__tickets a").filter({ hasText: "Synthetic Ticket B" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic Ticket B", exact: true })).toBeVisible();
  await complete(8, { failure: true });
  await expect(property("需求人")).toContainText("Ada");
  await expect(page.getByRole("alert").filter({ hasText: "需求人保存失败" })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "搜索 Ticket 标题" }).fill("Synthetic Ticket A");
  await page.locator(".lark-app__tickets a").filter({ hasText: "Synthetic Ticket A" }).click();
  await expect(property("需求人")).toContainText("Ada");
  await expect(property("紧急度")).toContainText("P1");
  await expect(page.getByRole("alert").filter({ hasText: "需求人保存失败" })).toBeVisible();
  await select("类型", "Feature");
  await select("Business Line", "Retail");
  await complete(9);
  await complete(10);
  await expect(property("类型")).toContainText("Feature");
  await expect(property("Business Line")).toContainText("Retail");
  await select("状态", "Finish");
  await complete(11, { partial: true });
  await expect(property("状态")).toContainText("Finish");
  await expect(page.getByRole("alert").filter({ hasText: "状态已写入 Lark Base" })).toBeVisible();
  process.stdout.write("PASS: Lark App six editable fields, mobile layout, immediate feedback, preserved reply draft, search switching and partial success\n");

  await select("负责人", "Ada");
  await expect.poll(() => writes.length).toBe(13);
  await page.evaluate(() => { location.hash = "#lark-tickets/r1"; });
  await expect(property("负责人")).toContainText("Ada");
  await complete(12, { failure: true });
  await expect(property("负责人")).toContainText("Lin");
  await page.evaluate(() => { location.hash = "#lark-app-thread-analysis?baseId=b&tableId=t&recordId=r1"; });
  await expect(property("负责人")).toContainText("Lin");
  process.stdout.write("PASS: Lark App and main detail share pending edits and rollback across navigation\n");

  allowEditing = false;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Synthetic Ticket A", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^修改/ })).toHaveCount(0);
  await expect(page.locator(".lark-app__property-fields")).toContainText("Feature");
  assert.equal(writes.length, 13);
  process.stdout.write("PASS: Lark App users without platformSync retain read-only properties\n");
  await expect(page.getByRole("button", { name: "创建 Meegle", exact: true })).toHaveCount(0);

  const createButton = () => page.getByRole("button", { name: "创建 Meegle", exact: true });
  const openLinks = () => page.getByRole("link", { name: /打开 Meegle/ });
  const switchTicket = async (name) => {
    await page.getByRole("searchbox", { name: "搜索 Ticket 标题" }).fill(name);
    await page.locator(".lark-app__tickets a").filter({ hasText: name }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  };
  async function finishCreate(index, result, error) {
    await expect.poll(() => creates.length).toBeGreaterThan(index);
    if (error) return creates[index].route.fulfill({ status: error.code === "MEEGLE_LINK_ALREADY_EXISTS" ? 409 : 403,
      json: { ok: false, error: { errorCode: error.code, errorMessage: error.message } } });
    if (!result.syncFailed) tickets.find((item) => item.recordId === creates[index].recordId).meegleLink = result.workitems?.length
      ? result.workitems.map((item) => item.meegleLink).join("\n") : result.meegleLink;
    return creates[index].route.fulfill({ json: { ok: true, data: result } });
  }
  async function assertDiscussionRow(action) {
    const discussion = await page.getByRole("link", { name: "原始讨论 ↗", exact: true }).boundingBox();
    const box = await action.boundingBox();
    assert.ok(discussion && box && Math.abs(discussion.y + discussion.height / 2 - box.y - box.height / 2) < 2,
      "Meegle actions should share the original discussion row");
    assert.ok(box.x > discussion.x, "Meegle actions follow the discussion link");
  }
  allowEditing = true;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await expect(createButton()).toBeEnabled();
  await assertDiscussionRow(createButton());
  await select("紧急度", "P2");
  await expect(createButton()).toBeDisabled();
  await complete(13);
  await expect(createButton()).toBeEnabled();
  await createButton().evaluate((button) => { button.click(); button.click(); });
  await expect.poll(() => creates.length).toBe(1);
  await expect(page.getByRole("button", { name: "正在创建 Meegle…", exact: true })).toBeDisabled();
  assert.equal(creates[0].input.baseId, "b");
  assert.equal(creates[0].input.tableId, "t");
  assert.equal(typeof creates[0].input.actionRunId, "string");
  await switchTicket("Synthetic Ticket B");
  await expect(createButton()).toBeEnabled();
  await switchTicket("Synthetic Ticket A");
  await expect(page.getByRole("button", { name: "正在创建 Meegle…", exact: true })).toBeDisabled();
  assert.equal(creates.length, 1);
  await page.getByLabel("回复草稿", { exact: true }).fill("Keep this after creation");
  await finishCreate(0, { workitemId: "wi1", meegleLink: "https://project.larksuite.com/p/story/detail/wi1", syncFailed: true,
    workitems: [{ workitemId: "wi1", meegleLink: "https://project.larksuite.com/p/story/detail/wi1" },
      { workitemId: "wi2", meegleLink: "https://project.larksuite.com/p/issue/detail/wi2" }] });
  await expect(openLinks()).toHaveCount(2);
  await assertDiscussionRow(openLinks().first());
  await expect(createButton()).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "但 Octo 同步失败" })).toBeVisible();
  await expect(page.getByLabel("回复草稿", { exact: true })).toHaveValue("Keep this after creation");
  await switchTicket("Synthetic Ticket B");
  await expect(openLinks()).toHaveCount(0);
  await switchTicket("Synthetic Ticket A");
  await expect(openLinks()).toHaveCount(2);
  await expect(createButton()).toHaveCount(0);
  assert.equal(creates.length, 1);
  await page.setViewportSize({ width: 390, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  process.stdout.write("PASS: Meegle creation waits for saved attributes, prevents duplicate clicks, survives navigation and retains partial results with multiple links; short actions share the discussion row\n");

  await switchTicket("Synthetic Ticket B");
  await createButton().click();
  await finishCreate(1, null, { code: "MEEGLE_BINDING_REQUIRED", message: "请先完成 Meegle 授权" });
  await expect(page.getByRole("alert").filter({ hasText: "请先完成 Meegle 授权" })).toBeVisible();
  await expect(createButton()).toBeEnabled();
  assert.equal(creates.length, 2);
  await createButton().click();
  await finishCreate(2, { workitemId: "wi3", meegleLink: "https://project.larksuite.com/p/story/detail/wi3", workitems: [] });
  await expect(openLinks()).toHaveCount(1);
  await expect(openLinks()).toHaveAttribute("href", "https://project.larksuite.com/p/story/detail/wi3");
  await expect(page.getByRole("status").filter({ hasText: "已创建 Meegle 工作项 wi3" })).toBeVisible();
  await expect(createButton()).toHaveCount(0);
  process.stdout.write("PASS: creation failures are explicit, retry is manual and success immediately shows the work item link\n");

  tickets.push({ ...tickets[1], recordId: "r3", title: "Synthetic Ticket C", ticketNumber: "TEST-3", meegleLink: undefined });
  await page.reload();
  await switchTicket("Synthetic Ticket C");
  await createButton().click();
  await finishCreate(3, null, { code: "MEEGLE_LINK_ALREADY_EXISTS", message: "Meegle 链接已经有记录。" });
  await expect(createButton()).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "无需重复创建" })).toBeVisible();
  tickets[2].meegleLink = "javascript:alert(1)\nhttps://project.larksuite.com/p/story/detail/existing";
  await page.getByRole("button", { name: "重新读取 Ticket", exact: true }).click();
  await expect(openLinks()).toHaveAttribute("href", "https://project.larksuite.com/p/story/detail/existing");
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(createButton()).toHaveCount(0);
  allowEditing = false;
  await page.reload();
  await expect(openLinks()).toHaveCount(1);
  await expect(createButton()).toHaveCount(0);
  assert.equal(creates.length, 4);
  process.stdout.write("PASS: existing links and server conflicts prevent duplicate creation; read-only users can open safe links\n");
  assert.deepEqual(errors, []);
} catch (error) {
  // Only synthetic fixture data is displayed in this browser.
  process.stderr.write(`${await page?.locator("body").innerText().catch(() => "")}\n`);
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
