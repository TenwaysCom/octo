import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

describe("acp-kimi controller", () => {
  it("returns a 400 INVALID_REQUEST envelope without starting SSE", async () => {
    const { createAcpKimiChatController } = await import(
      "../src/modules/acp-kimi/acp-kimi.controller.js"
    );

    const req = createRequestMock({
      message: "missing operator",
    });
    const res = createSseResponseMock();
    const service = {
      assertSessionAccess: vi.fn(),
      chat: vi.fn(),
    };

    const acpKimiChatController = createAcpKimiChatController(service as never);

    await acpKimiChatController(req as never, res as never);

    expect(service.chat).not.toHaveBeenCalled();
    expect(service.assertSessionAccess).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        errorCode: "INVALID_REQUEST",
        errorMessage: expect.stringMatching(/operatorLarkId/i),
      },
    });
  });

  it("streams session.created, one update, and done over SSE", async () => {
    const { createAcpKimiChatController } = await import(
      "../src/modules/acp-kimi/acp-kimi.controller.js"
    );

    const req = createRequestMock({
      operatorLarkId: "ou_123",
      message: "请帮我总结当前会话。",
    });
    const res = createSseResponseMock();
    const timeline: string[] = [];
    const writes: string[] = [];
    res.setHeader.mockImplementation(() => {
      timeline.push("headers");
      return res;
    });
    res.write.mockImplementation((chunk: unknown) => {
      const text = String(chunk);
      timeline.push(`write:${text}`);
      writes.push(text);
      return true;
    });
    const deferred = createDeferred<void>();
    const service = {
      assertSessionAccess: vi.fn(),
      chat: vi.fn(async (_input: unknown, emit: (event: unknown) => void) => {
        timeline.push("service:start");
        emit({
          event: "session.created",
          data: {
            sessionId: "sess_1",
          },
        });
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "sess_1",
            update: {
              content: "你好",
            },
          },
        });

        await deferred.promise;

        emit({
          event: "done",
          data: {
            sessionId: "sess_1",
            stopReason: "end_turn",
          },
        });
      }),
    };

    const acpKimiChatController = createAcpKimiChatController(service as never);

    const controllerPromise = acpKimiChatController(req as never, res as never);

    await vi.waitFor(() => {
      expect(parseSseEvents(writes.join(""))).toHaveLength(2);
    });

    expect(service.chat).toHaveBeenCalledWith(
      req.body,
      expect.any(Function),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(service.assertSessionAccess).toHaveBeenCalledWith({
      operatorLarkId: "ou_123",
      sessionId: undefined,
    });
    expect(timeline.slice(0, 4)).toEqual([
      "headers",
      "headers",
      "headers",
      "service:start",
    ]);
    expect(parseSseEvents(writes.join(""))).toEqual([
      {
        event: "session.created",
        data: {
          sessionId: "sess_1",
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_1",
          update: {
            content: "你好",
          },
        },
      },
    ]);

    deferred.resolve();
    await controllerPromise;

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream; charset=utf-8",
    );
    expect(timeline).toEqual([
      "headers",
      "headers",
      "headers",
      "service:start",
      expect.stringMatching(/^write:event: session\.created/),
      expect.stringMatching(/^write:event: acp\.session\.update/),
      expect.stringMatching(/^write:event: done/),
    ]);
    const events = parseSseEvents(writes.join(""));

    expect(events).toEqual([
      {
        event: "session.created",
        data: {
          sessionId: "sess_1",
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_1",
          update: {
            content: "你好",
          },
        },
      },
      {
        event: "done",
        data: {
          sessionId: "sess_1",
          stopReason: "end_turn",
        },
      },
    ]);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it("ends the SSE stream safely when the request is aborted after headers are sent", async () => {
    const { createAcpKimiChatController } = await import(
      "../src/modules/acp-kimi/acp-kimi.controller.js"
    );

    const req = createRequestMock({
      operatorLarkId: "ou_123",
      message: "请帮我总结当前会话。",
    });
    const res = createSseResponseMock();
    const service = {
      assertSessionAccess: vi.fn(),
      chat: vi.fn(async (_input: unknown, _emit: unknown, deps?: { signal?: AbortSignal }) => {
        if (!deps?.signal) {
          throw new Error("missing abort signal");
        }

        await new Promise<void>((_resolve, reject) => {
          deps.signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    };

    const acpKimiChatController = createAcpKimiChatController(service as never);
    const controllerPromise = acpKimiChatController(req as never, res as never);

    await vi.waitFor(() => {
      expect(res.setHeader).toHaveBeenCalled();
    });

    req.emit("aborted");
    await controllerPromise;

    expect(res.json).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it("returns a 403 error envelope for follow-up ownership violations", async () => {
    const { createAcpKimiChatController } = await import(
      "../src/modules/acp-kimi/acp-kimi.controller.js"
    );
    const { AcpKimiProxyError } = await import(
      "../src/application/services/acp-kimi-proxy.service.js"
    );

    const req = createRequestMock({
      operatorLarkId: "ou_intruder",
      sessionId: "sess_1",
      message: "follow up",
    });
    const res = createSseResponseMock();
    const service = {
      assertSessionAccess: vi.fn().mockRejectedValue(
        new AcpKimiProxyError(
          "SESSION_FORBIDDEN",
          403,
          "Kimi ACP session sess_1 does not belong to ou_intruder.",
        ),
      ),
      chat: vi.fn().mockRejectedValue(
        new AcpKimiProxyError(
          "SESSION_FORBIDDEN",
          403,
          "Kimi ACP session sess_1 does not belong to ou_intruder.",
        ),
      ),
    };

    const acpKimiChatController = createAcpKimiChatController(service as never);

    await acpKimiChatController(req as never, res as never);

    expect(service.chat).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        errorCode: "SESSION_FORBIDDEN",
        errorMessage: "Kimi ACP session sess_1 does not belong to ou_intruder.",
      },
    });
  });
});

function createRequestMock(body: Record<string, unknown>) {
  const req = new EventEmitter() as EventEmitter & {
    body: Record<string, unknown>;
    once: EventEmitter["once"];
    off: EventEmitter["off"];
  };

  req.body = body;
  return req;
}

function createSseResponseMock() {
  const response = {
    headersSent: false,
    writableEnded: false,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };

  response.status.mockReturnValue(response);
  response.flushHeaders.mockImplementation(() => {
    response.headersSent = true;
  });
  response.write.mockImplementation(() => {
    response.headersSent = true;
    return true;
  });
  response.end.mockImplementation(() => {
    response.writableEnded = true;
  });

  return response;
}

function parseSseEvents(output: string) {
  return output
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));

      if (!eventLine || !dataLine) {
        throw new Error(`invalid SSE frame: ${frame}`);
      }

      return {
        event: eventLine.slice("event:".length).trim(),
        data: JSON.parse(dataLine.slice("data:".length).trim()),
      };
    });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return {
    promise,
    resolve,
  };
}
