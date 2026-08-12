export const WORKSPACE_ROUTES = [
  { page: "lark-tickets", hash: "#lark-tickets", label: "Lark Ticket", icon: "◫", title: "Lark Ticket" },
  { page: "meegle-workitems", hash: "#meegle-workitems", label: "Meegle", icon: "◇", title: "Meegle" },
  { page: "github-pull-requests", hash: "#github-pull-requests", label: "GitHub PR", icon: "↗", title: "GitHub PR" },
  { page: "settings", hash: "#settings", label: "Settings", icon: "⚙", title: "Settings" },
  { page: "shortcuts", hash: "#shortcuts", label: "快捷键", title: "快捷键" },
];

export const WORKSPACE_NAVIGATION_ROUTES = WORKSPACE_ROUTES.filter((route) => !["settings", "shortcuts"].includes(route.page));
export const SETTINGS_ROUTE = WORKSPACE_ROUTES.find((route) => route.page === "settings");
export const SETTINGS_SUBROUTES = WORKSPACE_ROUTES.filter((route) => ["settings", "shortcuts"].includes(route.page));

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
      return SETTINGS_ROUTE;
    }
  }
  return WORKSPACE_ROUTES.find((route) => route.hash === hash) || SETTINGS_ROUTE;
}
