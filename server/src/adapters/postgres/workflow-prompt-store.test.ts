import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresWorkflowPromptStore } from "./workflow-prompt-store.js";
import {
  DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_NOTE,
  STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY,
} from "../../domain/workflow-prompts.js";

describe("PostgresWorkflowPromptStore", () => {
  it("reads the seeded Story Review prompt by key with note", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresWorkflowPromptStore(db);

    const prompt = await store.getByKey(STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY);

    expect(prompt).toMatchObject({
      key: STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY,
      note: DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_NOTE,
    });
    expect(prompt?.prompt).toContain("{{storySummary}}");
  });

  it("upserts prompt text and note for a stable key", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresWorkflowPromptStore(db);

    await store.upsert({
      key: STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY,
      prompt: "custom {{storyTitle}}",
      note: "custom note",
    });

    const prompt = await store.getByKey(STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY);

    expect(prompt).toMatchObject({
      key: STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY,
      prompt: "custom {{storyTitle}}",
      note: "custom note",
    });
  });
});
