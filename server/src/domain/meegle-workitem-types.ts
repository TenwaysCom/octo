/**
 * Central Meegle workitem type identifiers used by server workflows.
 *
 * Deployments may override the Production Bug key without changing the
 * workflows that consume it.
 */
export const MEEGLE_PRODUCTION_BUG_API_NAME = "production_bug";
export const MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY =
  process.env.MEEGLE_WORKITEM_TYPE_KEY_PROD_BUG || "6932e40429d1cd8aac635c82";

export function isMeegleProductionBugType(workItemTypeKey: string): boolean {
  return workItemTypeKey === MEEGLE_PRODUCTION_BUG_API_NAME ||
    workItemTypeKey === MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY;
}
