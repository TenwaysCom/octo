import {
  AUTOMATION_SKILL_PROFILES,
  getSprintAiAutomationAction,
  getTicketAiAutomationAction,
} from "./automation-actions.config.js";

describe("ticket AI automation actions", () => {
  it("keeps the Support-QA profile and its action permission policies in the shared catalog", () => {
    expect(AUTOMATION_SKILL_PROFILES.support_qa_eu).toEqual({
      workspaceEnv: "SUPPORT_QA_EU_WORKSPACE_DIR",
      skills: {
        support_qa_query: ".agents/skills/query-support-qa/SKILL.md",
        support_qa_write: ".agents/skills/write-support-qa/SKILL.md",
      },
    });
    expect(getTicketAiAutomationAction("lark-ticket-support-qa-summarize")).toMatchObject({
      promptKey: "lark_ticket.support_qa.summarize",
      skillProfile: "support_qa_eu",
      skillId: "support_qa_query",
      executionPolicy: "write+shell",
      requiresConfirmation: false,
    });
    expect(getTicketAiAutomationAction("lark-ticket-support-qa-document-preview")).toMatchObject({
      promptKey: "lark_ticket.support_qa.document_preview",
      skillId: "support_qa_write",
      executionPolicy: "write+shell",
    });
    expect(getTicketAiAutomationAction("update-lark-and-push")).toBeUndefined();
  });
});

describe("Sprint AI automation actions", () => {
  it("uses the workflow prompt without a workspace Skill profile", () => {
    expect(getSprintAiAutomationAction("meegle-sprint-release-notes")).toEqual(expect.objectContaining({
      promptKey: "meegle.sprint.release_notes",
      executionPolicy: "read_only",
      requiresConfirmation: false,
    }));
    expect(getSprintAiAutomationAction("meegle-sprint-internal-summary")).toEqual(expect.objectContaining({
      promptKey: "meegle.sprint.internal_summary",
    }));
    expect(getSprintAiAutomationAction("meegle-sprint-confirm-gaps")).toEqual(expect.objectContaining({
      promptKey: "meegle.sprint.confirm_gaps",
    }));
    expect(AUTOMATION_SKILL_PROFILES).not.toHaveProperty("octo_sprint_release_notes");
  });
});
