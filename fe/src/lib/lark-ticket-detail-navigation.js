function normalizeRecordIds(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter((value) => {
    if (typeof value !== "string" || !value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function createLarkTicketNavigationContext(tickets) {
  const recordIds = normalizeRecordIds((Array.isArray(tickets) ? tickets : []).map((ticket) => ticket?.recordId));
  return recordIds.length ? { recordIds } : null;
}

export function getLarkTicketDetailNavigation({ navigationContext, currentRecordId, availableRecordIds }) {
  const available = new Set(normalizeRecordIds(availableRecordIds));
  const recordIds = normalizeRecordIds(navigationContext?.recordIds).filter((recordId) => available.has(recordId));
  const index = recordIds.indexOf(currentRecordId);

  if (index < 0) return null;

  return {
    previousRecordId: recordIds[index - 1] || null,
    nextRecordId: recordIds[index + 1] || null,
    position: index + 1,
    total: recordIds.length,
  };
}
