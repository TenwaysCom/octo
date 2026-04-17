import type { Request, Response } from "express";
import { ZodError } from "zod";
import { validateAcpKimiChatRequest } from "./acp-kimi.dto.js";
import {
  AcpKimiProxyError,
  acpKimiProxyService,
  type AcpKimiProxyService,
} from "../../application/services/acp-kimi-proxy.service.js";
import {
  prepareAcpKimiEventStream,
  writeAcpKimiEvent,
} from "./event-stream.js";
import { logger } from "../../logger.js";

const acpKimiControllerLogger = logger.child({ module: "acp-kimi-controller" });

export function createAcpKimiChatController(
  service: AcpKimiProxyService = acpKimiProxyService,
) {
  return async function acpKimiChatController(req: Request, res: Response) {
    let request;
    try {
      request = validateRequest(req.body);
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

    acpKimiControllerLogger.info({
      operatorLarkId: request.operatorLarkId,
      hasSessionId: Boolean(request.sessionId),
      sessionId: request.sessionId,
      messageLength: request.message.length,
    }, "ACP_KIMI_CHAT REQUEST");

    const abortController = new AbortController();
    const cleanup = bindRequestAbortHandlers(req, abortController);
    let emittedEvents = 0;

    try {
      const session = await service.assertSessionAccess({
        operatorLarkId: request.operatorLarkId,
        sessionId: request.sessionId,
      });
      acpKimiControllerLogger.info({
        operatorLarkId: request.operatorLarkId,
        requestedSessionId: request.sessionId,
        resolvedSessionId: session?.sessionId ?? null,
        reusedSession: Boolean(session),
      }, "ACP_KIMI_CHAT SESSION_READY");
      prepareAcpKimiEventStream(res);
      await service.chat(request, (event) => {
        emittedEvents += 1;
        acpKimiControllerLogger.info({
          operatorLarkId: request.operatorLarkId,
          sessionId:
            ("data" in event && event.data && "sessionId" in event.data)
              ? event.data.sessionId
              : request.sessionId ?? null,
          event: event.event,
          emittedEvents,
        }, "ACP_KIMI_CHAT EMIT");
        writeAcpKimiEvent(res, event);
      }, {
        signal: abortController.signal,
        session: session ?? null,
      });

      acpKimiControllerLogger.info({
        operatorLarkId: request.operatorLarkId,
        requestedSessionId: request.sessionId,
        emittedEvents,
      }, "ACP_KIMI_CHAT COMPLETE");
      res.end();
    } catch (error) {
      if (abortController.signal.aborted || isAbortError(error)) {
        acpKimiControllerLogger.warn({
          operatorLarkId: request.operatorLarkId,
          requestedSessionId: request.sessionId,
          emittedEvents,
        }, "ACP_KIMI_CHAT ABORTED");
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      if (error instanceof AcpKimiProxyError) {
        acpKimiControllerLogger.warn({
          operatorLarkId: request.operatorLarkId,
          requestedSessionId: request.sessionId,
          emittedEvents,
          errorCode: error.code,
          errorMessage: error.message,
        }, "ACP_KIMI_CHAT PROXY_ERROR");
        res.status(error.statusCode).json({
          ok: false,
          error: {
            errorCode: error.code,
            errorMessage: error.message,
          },
        });
        return;
      }

      if (res.headersSent) {
        acpKimiControllerLogger.error({
          operatorLarkId: request.operatorLarkId,
          requestedSessionId: request.sessionId,
          emittedEvents,
          errorMessage: error instanceof Error ? error.message : String(error),
        }, "ACP_KIMI_CHAT STREAM_ERROR_AFTER_HEADERS");
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      acpKimiControllerLogger.error({
        operatorLarkId: request.operatorLarkId,
        requestedSessionId: request.sessionId,
        emittedEvents,
        errorMessage: error instanceof Error ? error.message : String(error),
      }, "ACP_KIMI_CHAT ERROR");
      res.status(500).json({
        ok: false,
        error: {
          errorCode: "INTERNAL_ERROR",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    } finally {
      cleanup();
    }
  };
}

export const acpKimiChatController = createAcpKimiChatController();

function validateRequest(input: unknown) {
  return validateAcpKimiChatRequest(input);
}

function bindRequestAbortHandlers(
  req: Request,
  abortController: AbortController,
): () => void {
  const abort = () => abortController.abort();

  req.once("aborted", abort);
  req.once("close", abort);

  return () => {
    req.off("aborted", abort);
    req.off("close", abort);
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
