export type MeegleProductionBugSemanticField = "analysisSummary";

const MEEGLE_PRODUCTION_BUG_FIELD_KEYS = {
  analysisSummary: "field_c22a1a",
} satisfies Record<MeegleProductionBugSemanticField, string>;

export function resolveMeegleProductionBugFieldKey(
  semanticField: MeegleProductionBugSemanticField,
): string {
  return MEEGLE_PRODUCTION_BUG_FIELD_KEYS[semanticField];
}
