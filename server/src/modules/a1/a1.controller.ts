import { applyB2, analyzeA1, createB2Draft } from "../../application/services/a1-workflow.service.js";
import {
  validateA1ApplyRequest,
  validateA1RecordRequest,
} from "./a1.dto.js";

export async function analyzeA1Controller(input: unknown) {
  return analyzeA1(validateA1RecordRequest(input));
}

export async function createB2DraftController(input: unknown) {
  return createB2Draft(validateA1RecordRequest(input));
}

export async function applyB2Controller(input: unknown) {
  return applyB2(validateA1ApplyRequest(input));
}
