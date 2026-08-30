import assert from "node:assert/strict";
import { test } from "node:test";
import { formatKanbanCardTime, getKanbanCardDescription, getKanbanCardLayout, getKanbanCardPeople, getKanbanCardPerson, getKanbanCardTime } from "./kanban-card-person.js";

test("lark ticket prefers responsible over requester", () => {
  assert.deepEqual(getKanbanCardPerson("lark-tickets", { responsible: "张三", requester: "李四" }), {
    role: "负责人",
    names: ["张三"],
    avatar: "initial",
  });
});

test("lark ticket falls back to requester when responsible is empty", () => {
  const person = getKanbanCardPerson("lark-tickets", { responsible: "  ", requester: "李四" });
  assert.equal(person.role, "需求人");
  assert.deepEqual(person.names, ["李四"]);
});

test("lark ticket splits comma-separated responsible names", () => {
  const person = getKanbanCardPerson("lark-tickets", { responsible: "张三， 李四,王五" });
  assert.deepEqual(person.names, ["张三", "李四", "王五"]);
});

test("lark ticket keeps responsible and requester as separate people groups", () => {
  assert.deepEqual(getKanbanCardPeople("lark-tickets", { responsible: "张三", requester: "李四" }), [
    { role: "负责人", names: ["张三"], avatar: "initial" },
    { role: "需求人", names: ["李四"], avatar: "initial" },
  ]);
});

test("lark ticket degrades to null when both person fields are missing", () => {
  assert.equal(getKanbanCardPerson("lark-tickets", {}), null);
  assert.equal(getKanbanCardPerson("lark-tickets", { responsible: "", requester: "" }), null);
});

test("meegle workitem uses assignee", () => {
  assert.deepEqual(getKanbanCardPerson("meegle-workitems", { assignee: "赵六" }), {
    role: "负责人",
    names: ["赵六"],
    avatar: "initial",
  });
});

test("meegle workitem degrades to null without assignee", () => {
  assert.equal(getKanbanCardPerson("meegle-workitems", { assignee: "" }), null);
  assert.equal(getKanbanCardPerson("meegle-workitems", {}), null);
});

test("github pull request uses authorLogin with github avatar", () => {
  assert.deepEqual(getKanbanCardPerson("github-pull-requests", { authorLogin: "octocat" }), {
    role: "Author",
    names: ["octocat"],
    avatar: "github",
  });
});

test("github pull request degrades to null without authorLogin", () => {
  assert.equal(getKanbanCardPerson("github-pull-requests", {}), null);
  assert.equal(getKanbanCardPerson("github-pull-requests", { authorLogin: "  " }), null);
});

test("unknown kind or missing item degrades to null", () => {
  assert.equal(getKanbanCardPerson("unknown", { responsible: "张三" }), null);
  assert.equal(getKanbanCardPerson("lark-tickets", null), null);
});

test("only existing Lark and GitHub descriptions are surfaced", () => {
  assert.equal(getKanbanCardDescription("lark-tickets", { detailDescription: "  Lark 描述  " }), "Lark 描述");
  assert.equal(getKanbanCardDescription("github-pull-requests", { description: "PR 描述" }), "PR 描述");
  assert.equal(getKanbanCardDescription("meegle-workitems", { description: "不应猜测" }), null);
  assert.equal(getKanbanCardDescription("lark-tickets", {}), null);
});

test("kanban layout puts status and update time on the second line", () => {
  assert.deepEqual(getKanbanCardLayout("lark-tickets", ["title", "status", "responsible", "requester", "priority", "updatedAt"], {
    ticketStatus: "处理中",
    sourceUpdatedAt: "2026-08-30T09:00:00+08:00",
  }), {
    statusKey: "status",
    updatedAtKey: "updatedAt",
    floatingKeys: ["priority"],
  });
});

test("kanban layout omits unavailable second-line values and formats a short date", () => {
  assert.deepEqual(getKanbanCardLayout("meegle-workitems", ["workitem", "status", "assignee", "sprint", "updatedAt"], {}), {
    statusKey: null,
    updatedAtKey: null,
    floatingKeys: ["sprint"],
  });
  assert.equal(formatKanbanCardTime("2026-08-30T09:00:00+08:00"), "8/30");
  assert.equal(formatKanbanCardTime("not-a-date"), "");
});

test("meegle card time prefers item start and falls back to cycle add time", () => {
  assert.deepEqual(getKanbanCardTime("meegle-workitems", {
    itemStartTime: "2026-08-30T09:00:00+08:00",
    addToCycleTime: "2026-08-29T09:00:00+08:00",
    sourceUpdatedAt: "2026-08-31T09:00:00+08:00",
  }), { value: "2026-08-30T09:00:00+08:00", label: "开始时间" });
  assert.deepEqual(getKanbanCardTime("meegle-workitems", {
    addToCycleTime: "2026-08-29T09:00:00+08:00",
    sourceUpdatedAt: "2026-08-31T09:00:00+08:00",
  }), { value: "2026-08-29T09:00:00+08:00", label: "加入 Cycle 时间" });
  assert.equal(getKanbanCardTime("meegle-workitems", { sourceUpdatedAt: "2026-08-31T09:00:00+08:00" }), null);
});

test("meegle layout exposes its lifecycle time when the time column is visible", () => {
  assert.equal(getKanbanCardLayout("meegle-workitems", ["workitem", "updatedAt"], {
    addToCycleTime: "2026-08-29T09:00:00+08:00",
  }).updatedAtKey, "updatedAt");
});
