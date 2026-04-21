/**
 * GitHub PR Meegle Lookup Module
 *
 * Extracts Meegle workitem references from PR description and fetches details
 */

export { prMeegleLookupController } from "./pr-meegle-lookup.controller.js";
export {
  executePrMeegleLookup,
  type PrMeegleLookupDeps,
} from "./pr-meegle-lookup.service.js";
export {
  validatePrMeegleLookupRequest,
  type PrMeegleLookupRequest,
  type PrMeegleLookupResult,
  type ExtractedMeegleId,
  type WorkitemInfo,
} from "./pr-meegle-lookup.dto.js";
