import { extractMeegleWorkitemRoleMembers } from "./meegle-workitem-role-members.js";

function workitem(roleMembers?: unknown, includeField = true) {
  return {
    fields: {
      work_item_attribute: includeField ? { role_members: roleMembers } : {},
    },
  };
}

describe("extractMeegleWorkitemRoleMembers", () => {
  it("distinguishes missing role evidence from an explicitly empty relation", () => {
    expect(extractMeegleWorkitemRoleMembers(workitem(undefined, false))).toEqual({ present: false, members: [] });
    expect(extractMeegleWorkitemRoleMembers(workitem([]))).toEqual({ present: true, members: [] });
    expect(extractMeegleWorkitemRoleMembers(workitem([{ key: "reviewer", name: "Reviewer" }]))).toEqual({ present: true, members: [] });
  });

  it("trims names, keeps source order, deduplicates within a role, and preserves cross-role membership", () => {
    expect(extractMeegleWorkitemRoleMembers(workitem([
      {
        key: "developer",
        name: " Developer ",
        members: [
          { key: "u-1", name: " Ada ", email: "not-persisted@example.com" },
          { key: "u-1", name: "Ada duplicate" },
          { key: "u-2", name: "" },
        ],
      },
      { key: "reviewer", name: " Reviewer ", members: [{ key: "u-1", name: " Ada " }] },
    ]))).toEqual({
      present: true,
      members: [
        { roleKey: "developer", roleName: "Developer", memberKey: "u-1", memberName: "Ada", roleOrder: 0, memberOrder: 0 },
        { roleKey: "developer", roleName: "Developer", memberKey: "u-2", memberName: "u-2", roleOrder: 0, memberOrder: 2 },
        { roleKey: "reviewer", roleName: "Reviewer", memberKey: "u-1", memberName: "Ada", roleOrder: 1, memberOrder: 0 },
      ],
    });
  });

  it("rejects malformed observed data instead of treating it as deletion", () => {
    expect(() => extractMeegleWorkitemRoleMembers(workitem(null))).toThrow("MEEGLE_ROLE_MEMBERS_INVALID");
    expect(() => extractMeegleWorkitemRoleMembers(workitem([null]))).toThrow("MEEGLE_ROLE_MEMBERS_INVALID");
    expect(() => extractMeegleWorkitemRoleMembers(workitem([{ key: "role", members: null }]))).toThrow("MEEGLE_ROLE_MEMBERS_INVALID");
    expect(() => extractMeegleWorkitemRoleMembers(workitem([{ key: "", members: [{ key: "u-1" }] }]))).toThrow("MEEGLE_ROLE_MEMBERS_INVALID");
    expect(() => extractMeegleWorkitemRoleMembers(workitem([{ key: "role", members: [{}] }]))).toThrow("MEEGLE_ROLE_MEMBERS_INVALID");
  });

  it("does not search other role_members keys recursively", () => {
    expect(extractMeegleWorkitemRoleMembers({ fields: { nested: { role_members: [] } } })).toEqual({ present: false, members: [] });
  });
});
