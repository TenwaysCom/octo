export const WORKSPACE_ROUTES = [
  { page: "lark-tickets", hash: "#lark-tickets", label: "Lark Ticket", icon: "◫", title: "Lark Ticket" },
  { page: "meegle-workitems", hash: "#meegle-workitems", label: "Meegle", icon: "◇", title: "Meegle" },
  { page: "github-pull-requests", hash: "#github-pull-requests", label: "GitHub PR", icon: "↗", title: "GitHub PR" },
  { page: "integrations", hash: "#integrations", label: "Integrations", icon: "⚙", title: "Integrations" },
  { page: "sync", hash: "#sync", label: "同步", title: "数据同步" },
  { page: "shortcuts", hash: "#shortcuts", label: "快捷键", title: "快捷键" },
];

export const WORKSPACE_NAVIGATION_ROUTES = WORKSPACE_ROUTES.filter((route) => !["integrations", "sync", "shortcuts"].includes(route.page));
export const INTEGRATIONS_ROUTE = WORKSPACE_ROUTES.find((route) => route.page === "integrations");
export const INTEGRATIONS_SUBROUTES = WORKSPACE_ROUTES.filter((route) => ["integrations", "sync", "shortcuts"].includes(route.page));
export const WORKSPACE_BREADCRUMB_LIMIT = 5;

export function getLarkTicketDetailHash(recordId) {
  return `#lark-tickets/${encodeURIComponent(recordId)}`;
}

export function getWorkspaceRoute(hash) {
  const larkTicketDetailMatch = hash.match(/^#lark-tickets\/([^/?#]+)$/);
  if (larkTicketDetailMatch) {
    try {
      return {
        page: "lark-ticket-detail",
        hash,
        title: "Lark Ticket",
        ticketRecordId: decodeURIComponent(larkTicketDetailMatch[1]),
      };
    } catch {
      return INTEGRATIONS_ROUTE;
    }
  }
  return WORKSPACE_ROUTES.find((route) => route.hash === hash) || INTEGRATIONS_ROUTE;
}

export function appendWorkspaceBreadcrumb(trail, route) {
  const item = {
    hash: route.hash,
    label: route.page === "lark-ticket-detail" ? "Ticket 详情" : route.label || route.title,
  };
  const existingIndex = trail.findIndex((breadcrumb) => breadcrumb.hash === item.hash);
  if (existingIndex >= 0) {
    return trail.slice(0, existingIndex + 1);
  }
  return [...trail, item].slice(-WORKSPACE_BREADCRUMB_LIMIT);
}
