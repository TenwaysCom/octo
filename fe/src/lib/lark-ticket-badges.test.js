import assert from "node:assert/strict";
import test from "node:test";
import { getLarkTicketBadgeTone } from "./lark-ticket-badges.js";

test("maps Lark Ticket statuses to semantic badge tones", () => {
  assert.equal(getLarkTicketBadgeTone("status", "Open"), "open");
  assert.equal(getLarkTicketBadgeTone("status", "处理中"), "active");
  assert.equal(getLarkTicketBadgeTone("status", "已完成"), "completed");
  assert.equal(getLarkTicketBadgeTone("status", "Waiting for triage"), "triage");
});

test("maps Lark Ticket types and urgency to distinct badge tones", () => {
  assert.equal(getLarkTicketBadgeTone("type", "Production Bug"), "bug");
  assert.equal(getLarkTicketBadgeTone("type", "User Story"), "story");
  assert.equal(getLarkTicketBadgeTone("type", "Tech Task"), "task");
  assert.equal(getLarkTicketBadgeTone("priority", "P0"), "critical");
  assert.equal(getLarkTicketBadgeTone("priority", "P1"), "high");
  assert.equal(getLarkTicketBadgeTone("priority", "P2"), "medium");
  assert.equal(getLarkTicketBadgeTone("priority", "P3"), "low");
});


test("distinguishes finished, cancelled and rejected source statuses", () => {
  for (const value of ["Finish", "Done", "已完成"]) assert.equal(getLarkTicketBadgeTone("status", value), "completed");
  for (const value of ["Cancelled", "Canceled", "已取消"]) assert.equal(getLarkTicketBadgeTone("status", value), "cancelled");
  assert.equal(getLarkTicketBadgeTone("status", "Rejected"), "blocked");
  const statuses = ["Todo", "Design", "Discover", "In Progress", "In Review", "Done", "Cancelled", "Rejected", "Triage"];
  assert.equal(new Set(statuses.map((value) => getLarkTicketBadgeTone("status", value))).size, statuses.length);
});

test("business line colors are stable across casing, whitespace and other values", () => {
  const sales = getLarkTicketBadgeTone("business-line", "B2B sales");
  assert.equal(getLarkTicketBadgeTone("business-line", " B2B SALES "), sales);
  assert.notEqual(getLarkTicketBadgeTone("business-line", "Retail"), sales);
  assert.equal(getLarkTicketBadgeTone("business-line", ""), "default");
});
