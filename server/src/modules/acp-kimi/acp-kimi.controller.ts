import type { Request, Response } from "express";
import { ZodError } from "zod";
import { validateAcpKimiChatRequest } from "./acp-kimi.dto.js";
import {
  acpKimiProxyService,
  type AcpKimiProxyService,
} from "../../application/services/acp-kimi-proxy.service.js";
import {
  prepareAcpKimiEventStream,
  writeAcpKimiEvent,
} from "./event-stream.js";

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

    const abortController = new AbortController();
    const cleanup = bindRequestAbortHandlers(req, abortController);

    try {
      prepareAcpKimiEventStream(res);
      await service.chat(request, (event) => {
        writeAcpKimiEvent(res, event);
      }, {
        signal: abortController.signal,
      });

      res.end();
    } catch (error) {
      if (abortController.signal.aborted || isAbortError(error)) {
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      if (res.headersSent) {
        if (!res.writableEnded) {
          res.end();
        }
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
