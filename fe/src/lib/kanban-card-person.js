// Resolve which person to surface in a kanban card's top-right corner, using
// only fields already present in the list payload. Missing fields degrade to
// no avatar — never invent or backfill data here.
function splitPersonNames(value) {
  return String(value || "").split(/[,，]/).map((name) => name.trim()).filter(Boolean);
}

export function getKanbanCardPeople(kind, item) {
  if (!item || typeof item !== "object") return null;
  if (kind === "lark-tickets") {
    const responsible = splitPersonNames(item.responsible);
    const requester = splitPersonNames(item.requester);
    const people = [
      responsible.length ? { role: "负责人", names: responsible, avatar: "initial" } : null,
      requester.length ? { role: "需求人", names: requester, avatar: "initial" } : null,
    ].filter(Boolean);
    return people.length ? people : null;
  }
  if (kind === "meegle-workitems") {
    const assignee = splitPersonNames(item.assignee);
    return assignee.length ? [{ role: "负责人", names: assignee, avatar: "initial" }] : null;
  }
  if (kind === "github-pull-requests") {
    const login = String(item.authorLogin || "").trim();
    return login ? [{ role: "Author", names: [login], avatar: "github" }] : null;
  }
  return null;
}

export function getKanbanCardPerson(kind, item) {
  return getKanbanCardPeople(kind, item)?.[0] || null;
}

export function getKanbanCardDescription(kind, item) {
  if (!item || typeof item !== "object") return null;
  const description = kind === "lark-tickets" ? item.detailDescription
    : kind === "github-pull-requests" ? item.description
      : null;
  const text = String(description || "").trim();
  return text || null;
}

export function getKanbanCardTime(kind, item) {
  if (!item || typeof item !== "object") return null;
  if (kind === "meegle-workitems") {
    if (item.itemStartTime) return { value: item.itemStartTime, label: "开始时间" };
    if (item.addToCycleTime) return { value: item.addToCycleTime, label: "加入 Cycle 时间" };
    return null;
  }
  const value = item.sourceUpdatedAt || item.syncedAt;
  return value ? { value, label: "更新时间" } : null;
}

const KANBAN_PERSON_FIELD_KEYS = {
  "lark-tickets": new Set(["responsible", "requester"]),
  "meegle-workitems": new Set(["assignee"]),
  "github-pull-requests": new Set(["author"]),
};

const KANBAN_IDENTIFIER_FIELD_KEYS = {
  "lark-tickets": "title",
  "meegle-workitems": "workitem",
  "github-pull-requests": "pullRequest",
};

export function getKanbanCardLayout(kind, visibleColumns, item) {
  const visible = Array.isArray(visibleColumns) ? visibleColumns : [];
  const hasStatus = Boolean(item?.ticketStatus || item?.status || item?.state);
  const hasUpdatedAt = Boolean(getKanbanCardTime(kind, item));
  const personKeys = KANBAN_PERSON_FIELD_KEYS[kind] || new Set();
  const identifierKey = KANBAN_IDENTIFIER_FIELD_KEYS[kind];
  return {
    statusKey: visible.includes("status") && hasStatus ? "status" : null,
    updatedAtKey: visible.includes("updatedAt") && hasUpdatedAt ? "updatedAt" : null,
    floatingKeys: visible.filter((key) => key !== identifierKey && key !== "status" && key !== "updatedAt" && !personKeys.has(key)),
  };
}

export function formatKanbanCardTime(value) {
  const timestamp = Date.parse(value || "");
  if (Number.isNaN(timestamp)) return "";
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
