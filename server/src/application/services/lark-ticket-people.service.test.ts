import { resolveLarkTicketPeople } from "./lark-ticket-people.service.js";

describe("Ticket contact avatar projection", () => {
  it("looks up IDs once across roles and tickets and returns only safe display fields", async () => {
    const contactStore = { listAvatarsByOpenIds: vi.fn().mockResolvedValue([
      { openId: "ou_a", avatarUrl: "https://example.com/a.png", email: "private@example.com" },
      { openId: "ou_b", avatarUrl: "https://example.com/b.png" },
    ]) };
    const result = await resolveLarkTicketPeople([
      { 需求人: [{ id: "ou_a", name: "Same Name", avatar_url: "https://example.com/source-old.png", email: "source@example.com" }], Responsible: [{ id: "ou_b", name: "Same Name" }] },
      { Requester: { id: "ou_a", name: "Same Name" }, 负责人: [{ id: "ou_missing", name: "No cache" }, { name: "No ID" }] },
    ], { contactStore });
    expect(contactStore.listAvatarsByOpenIds).toHaveBeenCalledTimes(1);
    expect(contactStore.listAvatarsByOpenIds).toHaveBeenCalledWith(["ou_a", "ou_b", "ou_missing"]);
    expect(result[0]).toEqual({ requesterPeople: [{ userId: "ou_a", name: "Same Name", avatarUrl: "https://example.com/a.png" }], responsiblePeople: [{ userId: "ou_b", name: "Same Name", avatarUrl: "https://example.com/b.png" }] });
    expect(result[1].responsiblePeople).toEqual([{ userId: "ou_missing", name: "No cache" }, { name: "No ID" }]);
    expect(JSON.stringify(result)).not.toMatch(/email|private|source-old/);
  });

  it("keeps people when cache lookup fails and does not use names to fetch avatars", async () => {
    const contactStore = { listAvatarsByOpenIds: vi.fn().mockRejectedValue(new Error("cache unavailable")) };
    expect(await resolveLarkTicketPeople([{ 需求人: [{ id: "ou_a", name: "Ada" }] }], { contactStore }))
      .toEqual([{ requesterPeople: [{ userId: "ou_a", name: "Ada" }], responsiblePeople: [] }]);
    contactStore.listAvatarsByOpenIds.mockClear();
    const result = await resolveLarkTicketPeople([{ 需求人: [{ name: "Ada" }, { id: "user-other-id", name: "Other" }] }, undefined], { contactStore });
    expect(contactStore.listAvatarsByOpenIds).not.toHaveBeenCalled();
    expect(result[0].requesterPeople).toEqual([{ name: "Ada" }, { name: "Other" }]);
  });

  it("deduplicates by ID and omits unsafe cached URL protocols", async () => {
    const contactStore = { listAvatarsByOpenIds: vi.fn().mockResolvedValue([{ openId: "ou_a", avatarUrl: "javascript:alert(1)" }]) };
    expect((await resolveLarkTicketPeople([{ 需求人: [{ id: "ou_a", name: "Ada" }, { id: "ou_a", name: "Ada" }] }], { contactStore }))[0].requesterPeople)
      .toEqual([{ userId: "ou_a", name: "Ada" }]);
  });
});
