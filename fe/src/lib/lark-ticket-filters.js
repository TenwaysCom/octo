export function matchesLarkTicketQuickFilter(item, filter) {
  if (filter === "in-progress") {
    return !["finish", "cancelled", "rejected"].includes(normalizeValue(item.ticketStatus));
  }
  if (filter === "unclassified") {
    return !normalizeValue(item.issueType);
  }
  if (filter === "unsynced") {
    return normalizeValue(item.issueType) === "feature" && !normalizeValue(item.meegleLink);
  }
  if (filter === "ai-output") {
    return Boolean(Object.keys(item.ticketAi?.fields || {}).length);
  }
  if (filter === "ai-missing") {
    return !Object.keys(item.ticketAi?.fields || {}).length;
  }
  return true;
}

function normalizeValue(value) {
  return String(value || "").trim().toLocaleLowerCase();
}
