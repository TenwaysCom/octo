const COMPLETED_STATUS_MARKERS = ["done", "ended", "fixed", "launched", "completed", "finished"];
const NOT_STARTED_STATUS_MARKERS = ["new", "start", "to start", "feature draft", "planned", "backlog"];
const SPRINT_LIFECYCLE_ORDER = ["current", "upcoming", "past", "unknown"];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function includesStatusMarker(status, markers) {
  const normalized = normalizeText(status).toLocaleLowerCase();
  return markers.includes(normalized);
}

function getWorkitemProgress(item) {
  if (includesStatusMarker(item.status, COMPLETED_STATUS_MARKERS)) return "completed";
  if (!normalizeText(item.status) || includesStatusMarker(item.status, NOT_STARTED_STATUS_MARKERS)) return "not-started";
  return "started";
}

function getLatestTimestamp(items) {
  return items.reduce((latest, item) => {
    const value = item.sourceUpdatedAt || item.syncedAt;
    const timestamp = Date.parse(value || "");
    return Number.isNaN(timestamp) || timestamp <= latest ? latest : timestamp;
  }, 0);
}

function countValues(items, getValue) {
  const counts = new Map();
  for (const item of items) {
    const value = normalizeText(getValue(item)) || "未设置";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN", { numeric: true }));
}

function compareTimestampDesc(leftValue, rightValue) {
  const left = Date.parse(leftValue || "");
  const right = Date.parse(rightValue || "");
  if (Number.isNaN(left) && Number.isNaN(right)) return 0;
  if (Number.isNaN(left)) return 1;
  if (Number.isNaN(right)) return -1;
  return right - left;
}

function getCalendarDate(value) {
  if (typeof value === "string") {
    const literalDate = value.match(/^(\d{4}-\d{2}-\d{2})/u)?.[1];
    if (literalDate && !Number.isNaN(Date.parse(`${literalDate}T00:00:00.000Z`))) return literalDate;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMeegleSprintLifecycle(sprint, now = new Date()) {
  const startDate = getCalendarDate(sprint?.startAt);
  const endDate = getCalendarDate(sprint?.endAt);
  const today = getCalendarDate(now);
  if (!today || (startDate && endDate && endDate < startDate)) return "unknown";
  if (startDate && today < startDate) return "upcoming";
  if (endDate && today > endDate) return "past";
  return startDate && endDate ? "current" : "unknown";
}

export function getDefaultOpenMeegleSprint(sprints) {
  const sprint = (sprints || []).find((candidate) => candidate.lifecycle === "current");
  return sprint ? sprint.identity || sprint.sprintId || sprint.name : undefined;
}

export function filterMeegleSprintHistory(sprints, selectedLifecycles) {
  const selected = selectedLifecycles || [];
  if (!selected.length) return [...(sprints || [])];
  return (sprints || []).filter((sprint) => selected.includes(sprint.lifecycle));
}

export function groupMeegleSprintHistory(sprints, groupBy = "date") {
  const visibleSprints = [...(sprints || [])];
  if (groupBy !== "lifecycle") return [{ key: "timeline", sprints: visibleSprints }];
  return SPRINT_LIFECYCLE_ORDER
    .map((lifecycle) => ({ key: lifecycle, sprints: visibleSprints.filter((sprint) => sprint.lifecycle === lifecycle) }))
    .filter((group) => group.sprints.length > 0);
}

export function summarizeMeegleSprint(name, items, metadata, now = new Date()) {
  const progress = { scope: items.length, started: 0, completed: 0, notStarted: 0 };
  for (const item of items) {
    const state = getWorkitemProgress(item);
    if (state === "completed") progress.completed += 1;
    else if (state === "started") progress.started += 1;
    else progress.notStarted += 1;
  }
  const completionPercent = progress.scope ? Math.round(progress.completed / progress.scope * 100) : 0;
  const latestTimestamp = getLatestTimestamp(items);
  const projectCount = Math.max(
    metadata ? 1 : 0,
    new Set(items.map((item) => normalizeText(item.projectName || item.projectKey)).filter(Boolean)).size,
  );
  const sprint = {
    items,
    ...(metadata || {}),
    name,
    progress: { ...progress, completionPercent },
    latestActivityAt: metadata?.sourceUpdatedAt || (latestTimestamp ? new Date(latestTimestamp).toISOString() : undefined),
    projectCount,
    labels: {
      sprint: countValues(items, (item) => item.sprint),
      project: countValues(items, (item) => item.projectName || item.projectKey),
      priority: countValues(items, (item) => item.priority),
    },
  };
  return {
    ...sprint,
    lifecycle: getMeegleSprintLifecycle(sprint, now),
    timeline: buildMeegleSprintTimeline(sprint, now),
  };
}

export function buildMeegleSprintTimeline(sprint, now = new Date()) {
  const items = sprint?.items || [];
  const lifecycleTimes = items.flatMap((item) => [item.addToCycleTime, item.itemStartTime, item.itemFinishTime])
    .map(parseTimestamp)
    .filter((value) => value !== undefined);
  const configuredStart = parseTimestamp(sprint?.startAt);
  const configuredEnd = parseTimestamp(sprint?.endAt);
  const nowTime = now instanceof Date ? now.getTime() : parseTimestamp(now);
  const start = startOfUtcDay(configuredStart ?? (lifecycleTimes.length ? Math.min(...lifecycleTimes) : nowTime ?? Date.now()));
  const today = startOfUtcDay(nowTime ?? Date.now());
  const scheduledEnd = startOfUtcDay(configuredEnd ?? today);
  const end = Math.max(start, scheduledEnd);
  const points = [];
  for (let day = start; day <= end; day += 24 * 60 * 60 * 1000) {
    const cutoff = day + 24 * 60 * 60 * 1000 - 1;
    let scope = 0;
    let started = 0;
    let completed = 0;
    for (const item of items) {
      const addedAt = parseTimestamp(item.addToCycleTime);
      if (addedAt === undefined || addedAt > cutoff) continue;
      scope += 1;
      const startedAt = parseTimestamp(item.itemStartTime);
      const finishedAt = parseTimestamp(item.itemFinishTime);
      if (finishedAt !== undefined && finishedAt <= cutoff) completed += 1;
      else if (startedAt !== undefined && startedAt <= cutoff) started += 1;
    }
    points.push({ date: new Date(day).toISOString().slice(0, 10), scope, started, completed });
  }
  return {
    points,
    coverageCount: items.filter((item) => parseTimestamp(item.addToCycleTime) !== undefined).length,
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
  };
}

function parseTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? undefined : parsed;
}

function startOfUtcDay(value) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function buildMeegleSprintHistory(items, sprintDetails = [], now = new Date()) {
  const metadataById = new Map();
  const metadataByName = new Map();
  for (const sprint of sprintDetails || []) {
    const name = normalizeText(sprint?.name);
    if (!name) continue;
    const idKey = getSprintIdKey(sprint.projectKey, sprint.sprintId);
    const nameKey = getSprintNameKey(sprint.projectKey, name);
    const current = metadataById.get(idKey);
    if (!current || Date.parse(sprint.sourceUpdatedAt || sprint.syncedAt || "") > Date.parse(current.sourceUpdatedAt || current.syncedAt || "")) {
      metadataById.set(idKey, sprint);
      metadataByName.set(nameKey, sprint);
    }
  }
  const grouped = new Map();
  for (const item of items || []) {
    const name = normalizeText(item.sprint);
    if (!name) continue;
    const projectKey = normalizeText(item.projectKey);
    const sprintId = normalizeText(item.sprintId);
    const metadata = sprintId
      ? metadataById.get(getSprintIdKey(projectKey, sprintId))
      : metadataByName.get(getSprintNameKey(projectKey, name));
    const identity = sprintId || metadata?.sprintId
      ? getSprintIdKey(projectKey, sprintId || metadata.sprintId)
      : getSprintNameKey(projectKey, name);
    const sprintItems = grouped.get(identity) || [];
    sprintItems.push(item);
    grouped.set(identity, sprintItems);
  }
  const identities = new Set([...grouped.keys(), ...metadataById.keys()]);
  return [...identities]
    .map((identity) => {
      const sprintItems = grouped.get(identity) || [];
      const metadata = metadataById.get(identity);
      const first = sprintItems[0];
      const name = normalizeText(metadata?.name || first?.sprint);
      const fallbackMetadata = metadata || (first?.sprintId ? {
        projectKey: first.projectKey,
        sprintId: first.sprintId,
        name,
      } : undefined);
      return { ...summarizeMeegleSprint(name, sprintItems, fallbackMetadata, now), identity };
    })
    .sort((left, right) => {
      const startComparison = compareTimestampDesc(left.startAt, right.startAt);
      if (startComparison !== 0) return startComparison;
      const activityComparison = compareTimestampDesc(left.latestActivityAt, right.latestActivityAt);
      if (activityComparison !== 0) return activityComparison;
      return right.name.localeCompare(left.name, "zh-CN", { numeric: true });
    });
}

function getSprintIdKey(projectKey, sprintId) {
  return `id:${normalizeText(projectKey)}:${normalizeText(sprintId)}`;
}

function getSprintNameKey(projectKey, sprintName) {
  return `name:${normalizeText(projectKey)}:${normalizeText(sprintName)}`;
}

export function filterMeegleSprintItems(items, selectedLabels) {
  return (items || []).filter((item) => {
    const values = {
      sprint: normalizeText(item.sprint) || "未设置",
      workitemType: normalizeText(item.workItemType || item.workItemTypeKey) || "未设置",
      status: normalizeText(item.status) || "未设置",
      project: normalizeText(item.projectName || item.projectKey) || "未设置",
      priority: normalizeText(item.priority) || "未设置",
      assignee: normalizeText(item.assignee) || "未设置",
    };
    return Object.entries(selectedLabels || {}).every(([key, selected]) => !selected?.length || selected.includes(values[key]));
  });
}
