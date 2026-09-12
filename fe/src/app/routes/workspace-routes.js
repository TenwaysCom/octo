export const WORKSPACE_ROUTES = [
  { page: "lark-tickets", hash: "#lark-tickets", label: "Lark Ticket", icon: "◫", title: "Lark Ticket" },
  { page: "meegle-workitems", hash: "#meegle-workitems", label: "Meegle", icon: "◇", title: "Meegle" },
  { page: "meegle-sprints", hash: "#meegle-sprints", label: "Meegle Sprint", icon: "◷", title: "Sprint 历史" },
  { page: "github-pull-requests", hash: "#github-pull-requests", label: "GitHub PR", icon: "↗", title: "GitHub PR" },
  { page: "integrations", hash: "#integrations", label: "平台授权", icon: "⚙", title: "Integrations" },
  { page: "sync", hash: "#sync", label: "数据同步", title: "数据同步" },
  { page: "shortcuts", hash: "#shortcuts", label: "快捷键", title: "快捷键" },
];

export const WORKSPACE_NAVIGATION_ROUTES = WORKSPACE_ROUTES.filter((route) => !["integrations", "sync", "shortcuts"].includes(route.page));
export const INTEGRATIONS_ROUTE = WORKSPACE_ROUTES.find((route) => route.page === "integrations");
export const SYNC_ROUTE = WORKSPACE_ROUTES.find((route) => route.page === "sync");
export const INTEGRATIONS_SUBROUTES = WORKSPACE_ROUTES.filter((route) => ["integrations", "sync", "shortcuts"].includes(route.page));
export const WORKSPACE_BREADCRUMB_LIMIT = 5;
const PLATFORM_LIST_PAGES = new Set(["lark-tickets", "lark-ticket-detail", "meegle-workitems", "meegle-sprints", "meegle-sprint-detail", "github-pull-requests"]);

export function canAccessWorkspaceRoute(workspaceAccess, route) {
  if (PLATFORM_LIST_PAGES.has(route.page)) {
    return Boolean(workspaceAccess?.platformLists);
  }
  if (route.page === "sync") {
    return Boolean(workspaceAccess?.platformSync);
  }
  return true;
}

export function getWorkspaceNavigationRoutes(workspaceAccess) {
  return WORKSPACE_NAVIGATION_ROUTES.filter((route) => canAccessWorkspaceRoute(workspaceAccess, route));
}

export function getIntegrationsSubroutes(workspaceAccess) {
  return INTEGRATIONS_SUBROUTES.filter((route) => canAccessWorkspaceRoute(workspaceAccess, route));
}

export function getDefaultSettingsRoute(workspaceAccess) {
  return canAccessWorkspaceRoute(workspaceAccess, SYNC_ROUTE) ? SYNC_ROUTE : INTEGRATIONS_ROUTE;
}

export function getLarkTicketDetailHash(recordId) {
  return `#lark-tickets/${encodeURIComponent(recordId)}`;
}

export function getMeegleSprintDetailHash(sprintName) {
  return `#meegle-sprints/${encodeURIComponent(sprintName)}`;
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
  const meegleSprintDetailMatch = hash.match(/^#meegle-sprints\/([^/?#]+)$/);
  if (meegleSprintDetailMatch) {
    try {
      const sprintName = decodeURIComponent(meegleSprintDetailMatch[1]);
      return { page: "meegle-sprint-detail", hash, title: sprintName, sprintName };
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
  if (route.page === "meegle-sprint-detail") {
    const parent = WORKSPACE_ROUTES.find((candidate) => candidate.page === "meegle-sprints");
    const parentTrail = appendWorkspaceBreadcrumb(trail, parent);
    const existingDetailIndex = parentTrail.findIndex((breadcrumb) => breadcrumb.hash === item.hash);
    return existingDetailIndex >= 0
      ? parentTrail.slice(0, existingDetailIndex + 1)
      : [...parentTrail, item].slice(-WORKSPACE_BREADCRUMB_LIMIT);
  }
  const existingIndex = trail.findIndex((breadcrumb) => breadcrumb.hash === item.hash);
  if (existingIndex >= 0) {
    return trail.slice(0, existingIndex + 1);
  }
  return [...trail, item].slice(-WORKSPACE_BREADCRUMB_LIMIT);
}
