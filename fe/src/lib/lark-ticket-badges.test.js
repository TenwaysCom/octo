import assert from "node:assert/strict";
import test from "node:test";
import { getLarkTicketBadgeTone } from "./lark-ticket-badges.js";

test("maps Lark Ticket statuses to semantic badge tones", () => {
  assert.equal(getLarkTicketBadgeTone("status", "Open"), "open");
  assert.equal(getLarkTicketBadgeTone("status", "处理中"), "active");
  assert.equal(getLarkTicketBadgeTone("status", "已完成"), "completed");
  assert.equal(getLarkTicketBadgeTone("status", "Waiting for triage"), "default");
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
