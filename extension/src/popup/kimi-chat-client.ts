import type { KimiChatEvent, KimiChatRequest } from "../types/acp-kimi.js";

export interface KimiChatClient {
  sendMessage(
    input: KimiChatRequest,
    handlers?: {
      onEvent?: (event: KimiChatEvent) => void;
      signal?: AbortSignal;
    },
  ): Promise<void>;
}

export function createKimiChatClient(input: { baseUrl: string }): KimiChatClient {
  return {
    async sendMessage(request, handlers) {
      const body: {
        operatorLarkId: string;
        message: string;
        sessionId?: string;
      } = {
        operatorLarkId: request.operatorLarkId,
        message: request.message,
      };

      if (request.sessionId) {
        body.sessionId = request.sessionId;
      }

      const response = await fetch(`${input.baseUrl}/api/acp/kimi/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: handlers?.signal,
      });

      if (!response.ok) {
        const payload = await readErrorPayload(response);
        const error = new Error(
          payload?.error?.errorMessage ||
            `Kimi ACP request failed with ${response.status}`,
        );
        (
          error as Error & {
            code?: string;
          }
        ).code = payload?.error?.errorCode;
        throw error;
      }

      if (!response.body) {
        throw new Error("Kimi ACP response did not include a body");
      }

      await parseKimiChatEventStream(response.body, handlers?.onEvent);
    },
  };
}

async function parseKimiChatEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent?: (event: KimiChatEvent) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: KimiChatEvent["event"] | null = null;
  let currentData = "";

  const flushFrame = () => {
    if (!currentEvent) {
      currentData = "";
      return;
    }

    const data = JSON.parse(currentData || "{}") as KimiChatEvent["data"];
    onEvent?.({
      event: currentEvent,
      data,
    } as KimiChatEvent);
    currentEvent = null;
    currentData = "";
  };

  const processLine = (line: string) => {
    if (!line) {
      flushFrame();
      return;
    }

    if (line.startsWith("event:")) {
      currentEvent = line.slice("event:".length).trim() as KimiChatEvent["event"];
      return;
    }

    if (line.startsWith("data:")) {
      currentData = currentData
        ? `${currentData}\n${line.slice("data:".length).trim()}`
        : line.slice("data:".length).trim();
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      processLine(line);
      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      break;
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    processLine(buffer.replace(/\r$/, ""));
  }

  if (currentEvent) {
    flushFrame();
  }
}

async function readErrorPayload(response: Response): Promise<{
  error?: {
    errorCode?: string;
    errorMessage?: string;
  };
} | null> {
  try {
    return (await response.json()) as {
      error?: {
        errorCode?: string;
        errorMessage?: string;
      };
    };
  } catch {
    return null;
  }
}
