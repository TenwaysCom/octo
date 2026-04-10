import type { AcpKimiChatRequest } from "../../modules/acp-kimi/acp-kimi.dto.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import { runKimiAcpSingleTurn } from "../../adapters/kimi-acp/kimi-acp-runtime.js";

export interface AcpKimiProxyServiceDeps {
  runSingleTurn?: (
    input: AcpKimiChatRequest,
    deps: {
      emit: (event: AcpKimiStreamEvent) => void;
      signal?: AbortSignal;
    },
  ) => Promise<void>;
}

export interface AcpKimiProxyService {
  chat(
    input: AcpKimiChatRequest,
    emit: (event: AcpKimiStreamEvent) => void,
    deps?: {
      signal?: AbortSignal;
    },
  ): Promise<void>;
}

export function createAcpKimiProxyService(
  deps: AcpKimiProxyServiceDeps = {},
): AcpKimiProxyService {
  const runSingleTurn = deps.runSingleTurn ?? runKimiAcpSingleTurn;

  return {
    async chat(
      input: AcpKimiChatRequest,
      emit: (event: AcpKimiStreamEvent) => void,
      deps?: {
        signal?: AbortSignal;
      },
    ) {
      await runSingleTurn(input, { emit, signal: deps?.signal });
    },
  };
}

export const acpKimiProxyService = createAcpKimiProxyService();
