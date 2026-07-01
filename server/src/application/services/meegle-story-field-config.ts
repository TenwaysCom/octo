export type MeegleStorySemanticField = "storySummary" | "techSummary";

const MEEGLE_STORY_FIELD_KEYS = {
  storySummary: "field_e67b43",
  techSummary: "field_44d048",
} satisfies Record<MeegleStorySemanticField, string>;

export function resolveMeegleStoryFieldKey(
  semanticField: MeegleStorySemanticField,
): string {
  return MEEGLE_STORY_FIELD_KEYS[semanticField];
}
