// Real App with synthetic API/image fixtures; no credentials or external writes.
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
  browser = await chromium.launch({ headless: true, ...(process.env.OCTO_FIELD_BROWSER_EXECUTABLE ? { executablePath: process.env.OCTO_FIELD_BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const people = {
    Ada: { name: "Ada", userId: "ou_ada", avatarUrl: "https://avatar.test/ada.svg" },
    Lin: { name: "Lin", userId: "ou_lin", avatarUrl: "https://avatar.test/lin.svg" },
    Zoe: { name: "Zoe", userId: "ou_zoe", avatarUrl: "https://avatar.test/zoe.svg" },
    Missing: { name: "Missing" },
    Broken: { name: "Broken", userId: "ou_broken", avatarUrl: "https://avatar.test/broken.svg" },
  };
  const tickets = [
    { baseId: "b", tableId: "t", recordId: "avatar-a", title: "Synthetic avatar Ticket A", ticketNumber: "AV-1", ticketStatus: "Open", priority: "P2", issueType: "Bug", requester: "Ada", responsible: "Lin", requesterPeople: [people.Ada], responsiblePeople: [people.Lin], syncedAt: "2026-11-06T00:00:00Z" },
    { baseId: "b", tableId: "t", recordId: "avatar-b", title: "Synthetic avatar Ticket B", ticketNumber: "AV-2", ticketStatus: "Open", requester: "Missing", responsible: "Broken", requesterPeople: [{ name: "Missing" }], responsiblePeople: [{ name: "Broken", userId: "ou_broken", avatarUrl: "https://avatar.test/broken.svg" }], syncedAt: "2026-11-06T00:00:00Z" },
  ];
  const writes = [];
  await page.route("https://**/*", (route) => route.abort());
  await page.route("https://avatar.test/**", (route) => route.request().url().endsWith("broken.svg")
    ? route.fulfill({ status: 404, body: "" })
    : route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#2288cc"/></svg>' }));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data) => route.fulfill({ json: { ok: true, data } });
    if (path === "/api/web/profile") return ok({ user: { id: "fixture", larkName: "Synthetic QA" }, workspaceAccess: { platformLists: true, platformSync: true } });
    if (path === "/api/web/platform-data/lark-tickets") return ok({ items: structuredClone(tickets) });
    if (path === "/api/web/platform-data/lark-ticket-filter-options") return ok({ requester: ["Ada", "Missing"], responsible: ["Lin", "Broken"], issueType: ["Bug"] });
    if (path.endsWith("/field-options")) return ok({ fields: [
      { field: "responsible", kind: "user", options: Object.values(people).map((person) => ({ label: person.name, userId: person.userId, avatarUrl: person.avatarUrl })) },
      { field: "requester", kind: "user", options: Object.values(people).map((person) => ({ label: person.name, userId: person.userId, avatarUrl: person.avatarUrl })) },
    ] });
    if (path.endsWith("/fields")) { writes.push({ route, input: route.request().postDataJSON() }); return; }
    if (path.endsWith("/ai-sessions")) return ok({ sessions: [] });
    return route.fulfill({ status: 503, json: { ok: false, error: { errorCode: "FIXTURE_UNAVAILABLE" } } });
  });
  const loaded = async (image) => {
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBe(32);
  };
  const owner = () => page.getByRole("button", { name: "修改负责人", exact: true });
  const requester = () => page.getByRole("button", { name: "修改需求人", exact: true });
  const chooseOwner = async (name) => {
    await owner().click();
    await page.getByRole("menuitemradio", { name, exact: true }).click();
  };

  await page.goto("http://127.0.0.1:4199/#lark-tickets");
  await page.getByRole("button", { name: /Open/ }).first().click();
  const row = page.locator(".workitem-row").filter({ hasText: "Synthetic avatar Ticket A" });
  await loaded(row.locator('img[src="https://avatar.test/ada.svg"]'));
  await loaded(row.locator('img[src="https://avatar.test/lin.svg"]'));
  const fallbackRow = page.locator(".workitem-row").filter({ hasText: "Synthetic avatar Ticket B" });
  await expect(fallbackRow.locator(".user__avatar").filter({ hasText: "M" })).toBeVisible();
  await expect(fallbackRow.locator(".user__avatar").filter({ hasText: "B" })).toBeVisible();
  await expect(fallbackRow.locator(".user__avatar img")).toHaveCount(0);
  process.stdout.write("PASS: compact list loads both avatars; missing/broken images fall back to initials\n");

  for (const label of ["修改负责人", "修改需求人"]) {
    await row.getByRole("button", { name: label, exact: true }).click();
    const menu = page.locator(".ticket-context-menu__submenu");
    await loaded(menu.locator('img[src="https://avatar.test/ada.svg"]'));
    const avatarBox = await menu.locator('img[src="https://avatar.test/ada.svg"]').boundingBox();
    assert.equal(avatarBox.width, 16); assert.equal(avatarBox.height, 16);
    const current = menu.locator('.ticket-context-menu__option[aria-current="true"]');
    await expect(current).toContainText(label === "修改负责人" ? "Lin" : "Ada");
    const search = menu.getByRole("textbox");
    await search.fill("Zoe");
    await expect(menu.locator(".ticket-context-menu__option")).toHaveCount(1);
    await loaded(menu.locator('img[src="https://avatar.test/zoe.svg"]'));
    await search.fill("Missing");
    await expect(menu.locator(".ticket-context-menu__avatar")).toHaveText("M");
    await search.fill("Broken");
    await expect(menu.locator(".ticket-context-menu__avatar")).toHaveText("B");
    await expect(menu.locator("img")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
  process.stdout.write("PASS: list person selectors load 16px avatars, preserve current selection/search and fall back for missing/broken images\n");

  await page.getByRole("link", { name: "Synthetic avatar Ticket A", exact: true }).click();
  await loaded(requester().locator("img"));
  await loaded(owner().locator("img"));
  const box = await owner().locator(".user__avatar").boundingBox();
  assert.equal(box.width, 19); assert.equal(box.height, 19);
  await owner().click();
  const detailMenu = page.getByRole("menu", { name: "修改负责人", exact: true });
  await loaded(detailMenu.locator('img[src="https://avatar.test/ada.svg"]'));
  await expect(detailMenu.getByRole("menuitemradio", { name: "Lin", exact: true })).toHaveAttribute("aria-checked", "true");
  await detailMenu.getByRole("textbox").fill("Zoe");
  await loaded(detailMenu.locator('img[src="https://avatar.test/zoe.svg"]'));
  await page.keyboard.press("Escape");
  await chooseOwner("Zoe");
  await expect.poll(() => writes.length).toBe(1);
  await expect(owner()).toContainText("Zoe");
  await expect(owner().locator("img")).toHaveCount(0);
  const first = writes[0];
  tickets[0].responsible = "Zoe"; tickets[0].responsiblePeople = [people.Zoe];
  await first.route.fulfill({ json: { ok: true, data: { larkBaseUpdated: true, recordId: "avatar-a", field: "responsible", ticket: structuredClone(tickets[0]) } } });
  await loaded(owner().locator('img[src="https://avatar.test/zoe.svg"]'));
  await chooseOwner("Lin");
  await expect.poll(() => writes.length).toBe(2);
  await expect(owner()).toContainText("Lin");
  await writes[1].route.fulfill({ status: 502, json: { ok: false, error: { errorCode: "MOCK_WRITE_REJECTED", errorMessage: "Synthetic rejection" } } });
  await expect(owner()).toContainText("Zoe");
  await loaded(owner().locator('img[src="https://avatar.test/zoe.svg"]'));
  process.stdout.write("PASS: detail keeps 19px size; owner changes immediately, accepts new avatar and rolls back on failure\n");

  await page.setViewportSize({ width: 390, height: 844 });
  await loaded(owner().locator("img"));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("http://127.0.0.1:4199/#lark-app-thread-analysis?baseId=b&tableId=t&recordId=avatar-a");
  await loaded(owner().locator('img[src="https://avatar.test/zoe.svg"]'));
  await loaded(requester().locator('img[src="https://avatar.test/ada.svg"]'));
  await requester().click();
  const appMenu = page.getByRole("menu", { name: "修改需求人", exact: true });
  await loaded(appMenu.locator('img[src="https://avatar.test/ada.svg"]'));
  await appMenu.getByRole("textbox").fill("Broken");
  await expect(appMenu.locator(".ticket-context-menu__avatar")).toHaveText("B");
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: narrow detail and Lark App use contact avatars without horizontal overflow or runtime errors\n");
} finally { await browser?.close(); await server.close(); }
