import { ZodError } from "zod";
import { executeLarkBugAnalyze } from "../../application/services/lark-bug-analyze.service.js";
import { validateLarkBugAnalyzeRequest } from "./lark-bug-analyze.dto.js";
import {
  createActionErrorEnvelopeFromError,
  getActionRunId,
} from "../../application/action-error-envelope.js";

const MODULE = "lark-bug-analyze";

export async function larkBugAnalyzeController(input: unknown) {
  const actionRunId = getActionRunId(input);
  try {
    const validated = validateLarkBugAnalyzeRequest(input);
    return await executeLarkBugAnalyze(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false as const,
        error: createActionErrorEnvelopeFromError(error, {
          module: MODULE,
          stage: "server.action.received",
          errorCode: "INVALID_REQUEST",
          actionRunId,
        }),
      };
    }

    return {
      ok: false as const,
      error: createActionErrorEnvelopeFromError(error, {
        module: MODULE,
        stage: "server.workflow.failed",
        errorCode: "LARK_BUG_ANALYZE_FAILED",
        actionRunId,
      }),
    };
  }
}
