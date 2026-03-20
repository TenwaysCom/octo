import { runPMAnalysis } from "../../application/services/pm-analysis.service";
import { validatePMAnalysisRequest } from "./pm-analysis.dto";

export async function pmAnalysisController(input: unknown) {
  return runPMAnalysis(validatePMAnalysisRequest(input));
}
