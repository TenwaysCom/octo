import assert from "node:assert/strict";
import test from "node:test";
import { getLarkTicketBadgeTone } from "./lark-ticket-badges.js";
import {
  buildLarkTicketMenuSections,
  getLarkTicketResourceUrl,
  countLarkTicketFieldValues,
  getLarkTicketMenuPosition,
  getLarkTicketOptionTone,
  isCurrentLarkTicketOption,
} from "./lark-ticket-context-menu.js";

const ticket = {
  recordId: "rec_1",
  ticketStatus: "In Progress",
  issueType: "Bug",
  requester: "Ada",
  responsible: "Lin, Zhang",
  priority: "P1",
  businessLine: "B2B sales",
};

test("builds field action items with options, counts, and the current flag", () => {
  const sections = buildLarkTicketMenuSections({
    ticket,
    fieldOptions: [
      { field: "status", kind: "select", options: [{ label: "In Progress" }, { label: "Done" }] },
      { field: "responsible", kind: "user", options: [{ label: "Lin", userId: "ou_lin" }, { label: "Ada", userId: "ou_ada" }] },
    ],
    items: [ticket, { ...ticket, ticketStatus: "Done" }],
  });

  assert.equal(sections.length, 3);
  const fields = sections[0].items;
  assert.deepEqual(fields.map((item) => item.field), ["status", "responsible", "requester", "priority", "issueType", "businessLine"]);
  const status = fields[0];
  assert.equal(status.submenuTitle, "更新状态…");
  assert.deepEqual(status.options, [
    { label: "In Progress", tone: "active", count: 1, isCurrent: true },
    { label: "Done", tone: "completed", count: 1, isCurrent: false },
  ]);
  const responsible = fields[1];
  assert.equal(responsible.optionsKind, "user");
  assert.deepEqual(responsible.options, [
    { label: "Lin", userId: "ou_lin", tone: "default", count: 2, isCurrent: true },
    { label: "Ada", userId: "ou_ada", tone: "default", count: 0, isCurrent: false },
  ]);
  assert.equal(sections[1].items.length, 1);
  assert.equal(sections[1].items[0].kind, "create-meegle");
  assert.equal(sections[1].items[0].submenu, undefined);
});

test("keeps field items usable when their options have not loaded", () => {
  const sections = buildLarkTicketMenuSections({ ticket, fieldOptions: [] });
  for (const item of sections[0].items) {
    assert.deepEqual(item.options, []);
  }
});

test("matches the current value case-insensitively across multi-person fields", () => {
  assert.equal(isCurrentLarkTicketOption(ticket, "responsible", "lin"), true);
  assert.equal(isCurrentLarkTicketOption(ticket, "responsible", "Zhang"), true);
  assert.equal(isCurrentLarkTicketOption(ticket, "responsible", "Wang"), false);
  assert.equal(isCurrentLarkTicketOption(ticket, "status", "IN PROGRESS"), true);
});

test("counts values across the loaded list", () => {
  const items = [ticket, { ...ticket, ticketStatus: "Done" }, { ...ticket, ticketStatus: "" }];
  assert.deepEqual([...countLarkTicketFieldValues(items, "status").entries()], [["in progress", 1], ["done", 1]]);
  assert.equal(countLarkTicketFieldValues(items, "status").get("lin"), undefined);
});

test("maps option tones by field kind", () => {
  assert.equal(getLarkTicketOptionTone("status", "Done"), "completed");
  assert.equal(getLarkTicketOptionTone("priority", "P0"), "critical");
  assert.equal(getLarkTicketOptionTone("issueType", "Production Bug"), "bug");
  assert.equal(getLarkTicketOptionTone("businessLine", "B2B sales"), getLarkTicketBadgeTone("business-line", "B2B sales"));
});

test("flips the menu near viewport edges", () => {
  const viewport = { width: 1000, height: 800 };
  assert.deepEqual(getLarkTicketMenuPosition({ x: 100, y: 100 }, viewport), { left: 100, top: 100, flipSubmenu: false });
  assert.equal(getLarkTicketMenuPosition({ x: 900, y: 100 }, viewport).left, 668);
  assert.equal(getLarkTicketMenuPosition({ x: 900, y: 100 }, viewport).flipSubmenu, true);
  assert.equal(getLarkTicketMenuPosition({ x: 100, y: 700 }, viewport).top, 468);
  assert.equal(getLarkTicketMenuPosition({ x: -50, y: 100 }, viewport).left, 12);
});


test("missing and null fields neither match options nor contribute to counts", () => {
  const emptyTickets = [{}, { ticketStatus: null, priority: null, issueType: null, businessLine: null }];
  for (const field of ["status", "priority", "issueType", "businessLine", "requester", "responsible"]) {
    for (const empty of emptyTickets) {
      assert.equal(isCurrentLarkTicketOption(empty, field, "P1"), false);
      const sections = buildLarkTicketMenuSections({ ticket: empty,
        fieldOptions: [{ field, options: [{ label: "P1" }] }], items: emptyTickets });
      assert.deepEqual(sections[0].items.find((item) => item.field === field).options[0], {
        label: "P1", tone: getLarkTicketOptionTone(field, "P1"), count: 0, isCurrent: false,
      });
    }
    assert.equal(countLarkTicketFieldValues(emptyTickets, field).size, 0);
  }
});


test("resource actions keep the current message URL and disable missing or unsafe links", () => {
  const sections = buildLarkTicketMenuSections({ ticket: { ...ticket, larkMessageLink: "https://example.com/message/1" } });
  assert.deepEqual(sections[2].items.map((item) => item.kind), ["open-base", "open-message"]);
  assert.equal(sections[2].items[1].disabled, false);
  for (const value of [undefined, "", "not a url", "javascript:alert(1)"]) {
    assert.equal(getLarkTicketResourceUrl(value), null);
    assert.equal(buildLarkTicketMenuSections({ ticket: { ...ticket, larkMessageLink: value } })[2].items[1].disabled, true);
  }
  assert.equal(getLarkTicketResourceUrl("https://example.com/message/1"), "https://example.com/message/1");
});
