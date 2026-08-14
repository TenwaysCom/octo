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
  return true;
}

function normalizeValue(value) {
  return String(value || "").trim().toLocaleLowerCase();
}
