export interface MeegleWorkitemRoleMember {
  roleKey: string;
  roleName: string;
  memberKey: string;
  memberName: string;
  roleOrder: number;
  memberOrder: number;
}

export interface MeegleWorkitemRoleMembersProjection {
  present: boolean;
  members: MeegleWorkitemRoleMember[];
}

export class MeegleWorkitemRoleMembersError extends Error {
  readonly errorCode = "MEEGLE_ROLE_MEMBERS_INVALID";

  constructor(message: string) {
    super(`${message} (MEEGLE_ROLE_MEMBERS_INVALID)`);
    this.name = "MeegleWorkitemRoleMembersError";
  }
}

export function extractMeegleWorkitemRoleMembers(workitem: unknown): MeegleWorkitemRoleMembersProjection {
  const workitemRecord = asRecord(workitem);
  const fields = asRecord(workitemRecord?.fields);
  const attributes = asRecord(fields?.work_item_attribute);
  if (!attributes || !Object.prototype.hasOwnProperty.call(attributes, "role_members")) {
    return { present: false, members: [] };
  }

  const rawRoles = attributes.role_members;
  if (!Array.isArray(rawRoles)) {
    throw invalid("role_members must be an array");
  }

  const members: MeegleWorkitemRoleMember[] = [];
  const seen = new Set<string>();
  rawRoles.forEach((rawRole, roleOrder) => {
    const role = asRecord(rawRole);
    if (!role) throw invalid(`role_members[${roleOrder}] must be an object`);

    if (!Object.prototype.hasOwnProperty.call(role, "members")) return;
    if (!Array.isArray(role.members)) {
      throw invalid(`role_members[${roleOrder}].members must be an array`);
    }
    if (role.members.length === 0) return;

    const roleKey = stableKey(role.key);
    if (!roleKey) throw invalid(`role_members[${roleOrder}].key is required`);
    const roleName = displayName(role.name, roleKey);

    role.members.forEach((rawMember, memberOrder) => {
      const member = asRecord(rawMember);
      if (!member) {
        throw invalid(`role_members[${roleOrder}].members[${memberOrder}] must be an object`);
      }
      const memberKey = stableKey(member.key);
      if (!memberKey) {
        throw invalid(`role_members[${roleOrder}].members[${memberOrder}].key is required`);
      }
      const identity = `${roleKey}\u0000${memberKey}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      members.push({
        roleKey,
        roleName,
        memberKey,
        memberName: displayName(member.name, memberKey),
        roleOrder,
        memberOrder,
      });
    });
  });

  return { present: true, members };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stableKey(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function displayName(value: unknown, fallback: string): string {
  const name = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return name || fallback;
}

function invalid(message: string): MeegleWorkitemRoleMembersError {
  return new MeegleWorkitemRoleMembersError(message);
}
