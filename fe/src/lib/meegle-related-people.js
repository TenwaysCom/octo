export function flattenMeegleRelatedPeople(relatedPeople) {
  if (!Array.isArray(relatedPeople)) return [];
  return relatedPeople.flatMap((role) => {
    if (!role || typeof role !== "object" || !Array.isArray(role.members)) return [];
    return role.members.flatMap((member) => {
      if (!member || typeof member !== "object") return [];
      const roleKey = String(role.roleKey || "").trim();
      const roleName = String(role.roleName || roleKey).trim();
      const memberKey = String(member.memberKey || "").trim();
      const name = String(member.name || memberKey).trim();
      return roleKey && roleName && memberKey && name
        ? [{ roleKey, roleName, memberKey, name }]
        : [];
    });
  });
}

export function formatMeegleRelatedPeopleLabel(relatedPeople) {
  if (!Array.isArray(relatedPeople)) return "";
  return relatedPeople.flatMap((role) => {
    if (!role || typeof role !== "object" || !Array.isArray(role.members)) return [];
    const roleName = String(role.roleName || role.roleKey || "").trim();
    const names = role.members.map((member) => String(member?.name || member?.memberKey || "").trim()).filter(Boolean);
    return roleName && names.length ? [`${roleName}：${names.join("、")}`] : [];
  }).join("；");
}
