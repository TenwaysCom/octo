import { createMeegleSprintAiSessionService } from "./meegle-sprint-ai-session.service.js";

const sprint = { projectKey: "proj_1", sprintId: "sprint_1" };

function createSyncStore() {
  return {
    listMeegleSprintSnapshots: vi.fn().mockResolvedValue([{
      projectKey: "proj_1", workItemTypeKey: "sprint1", workItemId: "sprint_1", title: "Sprint 1", syncedAt: "2026-08-28T00:00:00.000Z",
      sourcePayload: { id: "sprint_1", key: "S-1", name: "Sprint 1", type: "sprint1", status: "Done", fields: {} },
    }]),
    listMeegleSprintMemberships: vi.fn().mockResolvedValue([
      {
        projectKey: "proj_1", workItemTypeKey: "story", workItemId: "story_1", title: "改善订单导出", workItemType: "Story", sprintId: "sprint_1", itemFinishTime: "2026-08-27T00:00:00.000Z", syncedAt: "2026-08-28T00:00:00.000Z", membershipSource: "incremental_observed",
        sourcePayload: { id: "story_1", key: "S-1", name: "改善订单导出", type: "story", status: "Done", fields: { description: "<p>支持按国家导出订单。</p>" } },
      },
      {
        projectKey: "proj_1", workItemTypeKey: "story", workItemId: "story_2", title: "未完成事项", workItemType: "Story", sprintId: "sprint_1", syncedAt: "2026-08-28T00:00:00.000Z", membershipSource: "incremental_observed",
      },
    ]),
  };
}

describe("Meegle Sprint AI Session service", () => {
  it("creates a session from only completed supported Sprint work items", async () => {
    const syncStore = createSyncStore();
    const ownershipStore = { getBySessionId: vi.fn(), rename: vi.fn().mockResolvedValue(undefined) };
    const sprintSessionStore = { get: vi.fn(), list: vi.fn(), attach: vi.fn().mockResolvedValue({}), touch: vi.fn() };
    const workflowPromptStore = { getByKey: vi.fn().mockResolvedValue({ prompt: "Sprint context:\n{{sprint_context}}\n\nUser request:\n{{user_message}}" }) };
    const acpService = { chat: vi.fn().mockImplementation(async (_input, emit) => {
      emit({ event: "session.created", data: { sessionId: "sess_1" } });
      emit({ event: "done", data: { sessionId: "sess_1", stopReason: "end_turn" } });
    }) };
    const service = createMeegleSprintAiSessionService({ syncStore: syncStore as never, ownershipStore: ownershipStore as never, sprintSessionStore: sprintSessionStore as never, acpService: acpService as never, workflowPromptStore: workflowPromptStore as never });

    await service.chat({ operatorLarkId: "ou_1", sprint, message: "生成 Release Notes", actionRunId: "run_1" }, vi.fn());

    expect(acpService.chat).toHaveBeenCalledWith(expect.objectContaining({
      operatorLarkId: "ou_1",
      actionRunId: "run_1",
      message: expect.stringContaining("改善订单导出"),
    }), expect.any(Function), expect.any(Object));
    expect(acpService.chat.mock.calls[0][0].message).not.toContain("未完成事项");
    expect(workflowPromptStore.getByKey).toHaveBeenCalledWith("meegle.sprint.release_notes");
    expect(acpService.chat.mock.calls[0][0].message).not.toContain("skill_path");
    expect(sprintSessionStore.attach).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "sess_1", operatorLarkId: "ou_1", projectKey: "proj_1", sprintId: "sprint_1",
    }));
  });

  it("lists only sessions attached to the requested Sprint", async () => {
    const sprintSessionStore = { get: vi.fn(), touch: vi.fn(), attach: vi.fn(), list: vi.fn().mockResolvedValue([{ sessionId: "sess_1", updatedAt: "2026-08-28T00:00:00.000Z" }]) };
    const ownershipStore = { getBySessionId: vi.fn().mockResolvedValue({ title: "生成 Release Notes" }), rename: vi.fn() };
    const service = createMeegleSprintAiSessionService({ syncStore: createSyncStore() as never, ownershipStore: ownershipStore as never, sprintSessionStore: sprintSessionStore as never });

    await expect(service.listSessions({ operatorLarkId: "ou_1", sprint })).resolves.toEqual([{ sessionId: "sess_1", title: "生成 Release Notes", updatedAt: "2026-08-28T00:00:00.000Z" }]);
    expect(sprintSessionStore.list).toHaveBeenCalledWith({ operatorLarkId: "ou_1", ...sprint });
  });

  it("renders quick actions from the workflow prompt without a workspace Skill", async () => {
    const workflowPromptStore = { getByKey: vi.fn().mockResolvedValue({ prompt: "仅根据以下上下文生成：{{sprint_context}}\n请求：{{user_message}}" }) };
    const acpService = { chat: vi.fn().mockResolvedValue(undefined) };
    const service = createMeegleSprintAiSessionService({
      syncStore: createSyncStore() as never,
      ownershipStore: { getBySessionId: vi.fn(), rename: vi.fn() } as never,
      sprintSessionStore: { get: vi.fn(), list: vi.fn(), attach: vi.fn(), touch: vi.fn() } as never,
      workflowPromptStore: workflowPromptStore as never,
      acpService: acpService as never,
    });

    await service.chat({
      operatorLarkId: "ou_1",
      sprint,
      message: "生成 Release Notes",
      actionKey: "meegle-sprint-release-notes",
    }, vi.fn());

    expect(workflowPromptStore.getByKey).toHaveBeenCalledWith("meegle.sprint.release_notes");
    expect(acpService.chat).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("改善订单导出"),
      permissionContext: {
        actionKey: "meegle-sprint-release-notes",
        executionPolicy: "read_only",
        policyVersion: "v1",
      },
    }), expect.any(Function), expect.any(Object));
  });
});
