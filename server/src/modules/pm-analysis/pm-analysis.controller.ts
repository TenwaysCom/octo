import { runPMAnalysis } from "../../application/services/pm-analysis.service.js";
import { validatePMAnalysisRequest } from "./pm-analysis.dto.js";

export async function runPMAnalysisController(input: unknown) {
  return runPMAnalysis(validatePMAnalysisRequest(input));
}
