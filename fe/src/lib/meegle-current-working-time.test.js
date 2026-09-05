import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMeegleCurrentWorkingTime,
  getMeegleCurrentWorkingDurationMs,
} from "./meegle-current-working-time.js";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");

test("formats current node working time from currentNodeStartTime to now", () => {
  const item = { currentNodeStartTime: "2026-08-30T09:30:00.000Z" };
  assert.equal(getMeegleCurrentWorkingDurationMs(item, NOW), 26.5 * 60 * 60 * 1000);
  assert.equal(formatMeegleCurrentWorkingTime(item, NOW), "1天 2小时");
});

test("uses itemFinishTime as the end of a finished item's current node", () => {
  const item = {
    currentNodeStartTime: "2026-08-31T09:00:00.000Z",
    itemFinishTime: "2026-08-31T10:45:00.000Z",
  };
  assert.equal(formatMeegleCurrentWorkingTime(item, NOW), "1小时 45分钟");
});

test("does not present a precise duration when finish_time is date-only", () => {
  const item = {
    currentNodeStartTime: "2026-08-31T09:00:00.000Z",
    itemFinishTime: "2026-08-31",
  };
  assert.equal(getMeegleCurrentWorkingDurationMs(item, NOW), null);
  assert.equal(formatMeegleCurrentWorkingTime(item, NOW), "");
});

test("does not fall back to cycle time or expose current snapshot time on a removed Sprint membership", () => {
  assert.equal(formatMeegleCurrentWorkingTime({ addToCycleTime: "2026-08-01T00:00:00.000Z" }, NOW), "");
  assert.equal(formatMeegleCurrentWorkingTime({
    currentNodeStartTime: "2026-08-31T09:00:00.000Z",
    membershipRemovedAt: "2026-08-31T10:00:00.000Z",
  }, NOW), "");
});

test("rejects invalid or reversed lifecycle timestamps", () => {
  assert.equal(formatMeegleCurrentWorkingTime({ currentNodeStartTime: "invalid" }, NOW), "");
  assert.equal(formatMeegleCurrentWorkingTime({ currentNodeStartTime: "2026-08-31T13:00:00.000Z" }, NOW), "");
  assert.equal(formatMeegleCurrentWorkingTime({
    currentNodeStartTime: "2026-08-31T09:00:00.000Z",
    itemFinishTime: "invalid",
  }, NOW), "");
});

test("keeps sub-minute durations explicit", () => {
  assert.equal(formatMeegleCurrentWorkingTime({ currentNodeStartTime: "2026-08-31T11:59:30.000Z" }, NOW), "不足 1 分钟");
});
