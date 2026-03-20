import { applyB1, analyzeA2, createB1Draft } from "../../application/services/a2-workflow.service";
import {
  validateA2ApplyRequest,
  validateA2RecordRequest,
} from "./a2.dto";

export async function analyzeA2Controller(input: unknown) {
  return analyzeA2(validateA2RecordRequest(input));
}

export async function createB1DraftController(input: unknown) {
  return createB1Draft(validateA2RecordRequest(input));
}

export async function applyB1Controller(input: unknown) {
  return applyB1(validateA2ApplyRequest(input));
}
