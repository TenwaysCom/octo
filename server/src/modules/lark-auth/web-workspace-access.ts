export interface WebWorkspaceAccess {
  platformLists: boolean;
  platformSync: boolean;
  dataQuery: boolean;
}

function hasRole(role: string | null | undefined, value: string): boolean {
  return role?.toLowerCase().includes(value) ?? false;
}

export function getWebWorkspaceAccess(role: string | null | undefined): WebWorkspaceAccess {
  const roleTokens = (role ?? "").toLowerCase().split(/[\s,]+/);
  const isAdmin = hasRole(role, "admin");
  const canOperatePlatform = hasRole(role, "devops") || hasRole(role, "pm");
  return {
    platformLists: isAdmin || hasRole(role, "dev") || canOperatePlatform,
    platformSync: isAdmin || canOperatePlatform,
    dataQuery: roleTokens.includes("it"),
  };
}
