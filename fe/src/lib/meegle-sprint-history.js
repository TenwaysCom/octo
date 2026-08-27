const COMPLETED_STATUS_MARKERS = ["done", "ended", "fixed", "launched", "completed", "closed"];
const NOT_STARTED_STATUS_MARKERS = ["new", "to start", "feature draft", "planned", "backlog"];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function includesStatusMarker(status, markers) {
  const normalized = normalizeText(status).toLocaleLowerCase();
  return markers.some((marker) => normalized === marker || normalized.includes(marker));
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

function getSprintActivity(status, progress) {
  const normalized = normalizeText(status).toLocaleLowerCase();
  if (["ended", "finished", "done", "terminated", "completed"].some((value) => normalized.includes(value))) return "completed";
  if (normalized.includes("progress") || normalized.includes("current") || normalized.includes("ongoing")) return "active";
  if (normalized) return "planned";
  return progress.scope > 0 && progress.completed === progress.scope
    ? "completed"
    : progress.started + progress.completed > 0 ? "active" : "planned";
}

export function summarizeMeegleSprint(name, items, metadata) {
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
  const activity = getSprintActivity(metadata?.status, progress);
  return {
    items,
    ...(metadata || {}),
    name,
    progress: { ...progress, completionPercent },
    latestActivityAt: metadata?.sourceUpdatedAt || (latestTimestamp ? new Date(latestTimestamp).toISOString() : undefined),
    projectCount,
    activity,
    labels: {
      sprint: countValues(items, (item) => item.sprint),
      project: countValues(items, (item) => item.projectName || item.projectKey),
      priority: countValues(items, (item) => item.priority),
    },
  };
}

export function buildMeegleSprintHistory(items, sprintDetails = []) {
  const grouped = new Map();
  for (const item of items || []) {
    const sprint = normalizeText(item.sprint);
    if (!sprint) continue;
    const sprintItems = grouped.get(sprint) || [];
    sprintItems.push(item);
    grouped.set(sprint, sprintItems);
  }
  const metadataByName = new Map();
  for (const sprint of sprintDetails || []) {
    const name = normalizeText(sprint?.name);
    if (!name) continue;
    const current = metadataByName.get(name);
    if (!current || Date.parse(sprint.sourceUpdatedAt || sprint.syncedAt || "") > Date.parse(current.sourceUpdatedAt || current.syncedAt || "")) {
      metadataByName.set(name, sprint);
    }
  }
  const names = new Set([...grouped.keys(), ...metadataByName.keys()]);
  return [...names]
    .map((name) => summarizeMeegleSprint(name, grouped.get(name) || [], metadataByName.get(name)))
    .sort((left, right) => {
      const startComparison = compareTimestampDesc(left.startAt, right.startAt);
      if (startComparison !== 0) return startComparison;
      const activityComparison = compareTimestampDesc(left.latestActivityAt, right.latestActivityAt);
      if (activityComparison !== 0) return activityComparison;
      return right.name.localeCompare(left.name, "zh-CN", { numeric: true });
    });
}

export function filterMeegleSprintItems(items, selectedLabels) {
  return (items || []).filter((item) => {
    const values = {
      sprint: normalizeText(item.sprint) || "未设置",
      project: normalizeText(item.projectName || item.projectKey) || "未设置",
      priority: normalizeText(item.priority) || "未设置",
    };
    return Object.entries(selectedLabels || {}).every(([key, selected]) => !selected?.length || selected.includes(values[key]));
  });
}
