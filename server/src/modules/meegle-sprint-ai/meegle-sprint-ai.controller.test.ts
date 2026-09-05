import { createWebMeegleSprintAiController } from "./meegle-sprint-ai.controller.js";

describe("web Meegle Sprint AI controller", () => {
  it("uses the server-resolved Web identity and validated Sprint ref", async () => {
    const service = { listSessions: vi.fn().mockResolvedValue([{ sessionId: "sess_1", title: "Release Notes", updatedAt: "2026-08-28T00:00:00.000Z" }]) };
    const controller = createWebMeegleSprintAiController({
      service: service as never,
      resolveSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "usr_1", role: "pm", baseUrl: "https://project.larksuite.com", user: {} }),
      resolveOperatorLarkId: vi.fn().mockResolvedValue("ou_1"),
    });

    await expect(controller.list({ cookieHeader: "octo_web_session=session_1", sprintId: "sprint_1", query: { projectKey: "proj_1" } })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: { sessions: [{ sessionId: "sess_1", title: "Release Notes", updatedAt: "2026-08-28T00:00:00.000Z" }] } },
    });
    expect(service.listSessions).toHaveBeenCalledWith({ operatorLarkId: "ou_1", sprint: { projectKey: "proj_1", sprintId: "sprint_1" } });
  });
});
