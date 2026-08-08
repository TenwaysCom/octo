export const WORKSPACE_ROUTES = [
  { page: "lark-tickets", hash: "#lark-tickets", label: "Lark Ticket", icon: "◫", title: "Lark Ticket" },
  { page: "meegle-workitems", hash: "#meegle-workitems", label: "Meegle", icon: "◇", title: "Meegle" },
  { page: "github-pull-requests", hash: "#github-pull-requests", label: "GitHub PR", icon: "↗", title: "GitHub PR" },
  { page: "settings", hash: "#settings", label: "Settings", icon: "⚙", title: "Settings" },
];

export const WORKSPACE_NAVIGATION_ROUTES = WORKSPACE_ROUTES.filter((route) => route.page !== "settings");
export const SETTINGS_ROUTE = WORKSPACE_ROUTES.find((route) => route.page === "settings");

export function getWorkspaceRoute(hash) {
  return WORKSPACE_ROUTES.find((route) => route.hash === hash) || SETTINGS_ROUTE;
}
