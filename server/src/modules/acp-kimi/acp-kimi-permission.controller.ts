import type { Request, Response } from "express";
import { ZodError } from "zod";
import { validateAcpKimiPermissionRespondRequest } from "./acp-kimi.dto.js";
import { respondToPermissionRequest } from "../../adapters/kimi-acp/kimi-acp-runtime.js";
import { acpLogger } from "../../logger.js";

const permissionControllerLogger = acpLogger.child({
  module: "acp-kimi-permission-controller",
});

export async function acpKimiPermissionRespondController(
  req: Request,
  res: Response,
) {
  let request;
  try {
    request = validateAcpKimiPermissionRespondRequest(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        ok: false,
        error: {
          errorCode: "INVALID_REQUEST",
          errorMessage: error.message,
        },
      });
      return;
    }

    res.status(500).json({
      ok: false,
      error: {
        errorCode: "INTERNAL_ERROR",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    return;
  }

  permissionControllerLogger.info(
    {
      sessionId: request.sessionId,
      requestId: request.requestId,
      optionId: request.optionId,
    },
    "ACP_KIMI_PERMISSION_RESPOND REQUEST",
  );

  const resolved = respondToPermissionRequest(
    request.sessionId,
    request.optionId,
  );

  if (!resolved) {
    permissionControllerLogger.warn(
      {
        sessionId: request.sessionId,
        requestId: request.requestId,
      },
      "ACP_KIMI_PERMISSION_RESPOND NOT_FOUND",
    );
    res.status(404).json({
      ok: false,
      error: {
        errorCode: "PERMISSION_REQUEST_NOT_FOUND",
        errorMessage: "Permission request not found or already resolved.",
      },
    });
    return;
  }

  permissionControllerLogger.info(
    {
      sessionId: request.sessionId,
      requestId: request.requestId,
      optionId: request.optionId,
    },
    "ACP_KIMI_PERMISSION_RESPOND OK",
  );

  res.json({
    ok: true,
  });
}
