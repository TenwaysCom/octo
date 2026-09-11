function normalizeTickets(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter((value) => {
    if (!value || typeof value.recordId !== "string" || !value.recordId || seen.has(value.recordId)) return false;
    seen.add(value.recordId);
    return true;
  });
}

export function createLarkTicketNavigationContext(tickets) {
  const items = normalizeTickets(tickets);
  return items.length ? { recordIds: items.map((ticket) => ticket.recordId), tickets: items } : null;
}

export function getLarkTicketFromNavigationContext({ navigationContext, recordId }) {
  return navigationContext?.tickets?.find((ticket) => ticket.recordId === recordId);
}

export function getLarkTicketDetailNavigation({ navigationContext, currentRecordId }) {
  const recordIds = navigationContext?.recordIds || [];
  const index = recordIds.indexOf(currentRecordId);

  if (index < 0) return null;

  return {
    previousRecordId: recordIds[index - 1] || null,
    nextRecordId: recordIds[index + 1] || null,
    position: index + 1,
    total: recordIds.length,
  };
}


export function updateLarkTicketNavigationContext(navigationContext, patch) {
  if (!navigationContext) return navigationContext;
  return { ...navigationContext, tickets: navigationContext.tickets.map((ticket) =>
    ticket.baseId === patch.baseId && ticket.tableId === patch.tableId && ticket.recordId === patch.recordId
      ? { ...ticket, ...patch } : ticket) };
}
