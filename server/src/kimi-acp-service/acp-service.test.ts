import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAcpServiceApp } from "./acp-service.js";
import type { KimiAcpSessionRuntime } from "../adapters/kimi-acp/kimi-acp-runtime.js";

function createMockRuntime(textChunks: string[]): KimiAcpSessionRuntime {
  return {
    sessionId: "fake-session-001",
    async prompt({ emit }) {
      for (const chunk of textChunks) {
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "fake-session-001",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: chunk },
            },
          },
        } as never);
      }
      return { stopReason: "stop" };
    },
    async close() {
      // no-op
    },
  };
}

function createFailingRuntime(errorMessage: string): KimiAcpSessionRuntime {
  return {
    sessionId: "fake-session-fail",
    async prompt() {
      throw new Error(errorMessage);
    },
    async close() {
      // no-op
    },
  };
}

describe("kimi-acp-service", () => {
  let service: ReturnType<typeof createAcpServiceApp>;

  afterEach(async () => {
    await service.close();
  });

  describe("GET /health", () => {
    it("returns ready when runtime is initialized", async () => {
      service = createAcpServiceApp({
        createRuntime: async () => createMockRuntime(["hello"]),
        port: 0,
      });
      const port = await service.start();

      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, status: "ready" });
    });
  });

  describe("POST /prompt", () => {
    it("returns 400 when message is missing", async () => {
      service = createAcpServiceApp({
        createRuntime: async () => createMockRuntime(["hello"]),
        port: 0,
      });
      const port = await service.start();

      const res = await fetch(`http://localhost:${port}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("message is required");
    });

    it("returns generated text on success", async () => {
      service = createAcpServiceApp({
        createRuntime: async () => createMockRuntime(["Hello", " ", "world", "!"]),
        port: 0,
      });
      const port = await service.start();

      const res = await fetch(`http://localhost:${port}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test prompt" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.text).toBe("Hello world!");
      expect(body.stopReason).toBe("stop");
    });

    it("returns 500 when runtime fails", async () => {
      service = createAcpServiceApp({
        createRuntime: async () => createFailingRuntime("runtime exploded"),
        port: 0,
      });
      const port = await service.start();

      const res = await fetch(`http://localhost:${port}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("runtime exploded");
    });

    it("processes requests sequentially", async () => {
      let activeCount = 0;
      let maxConcurrent = 0;

      const trackedRuntime: KimiAcpSessionRuntime = {
        sessionId: "tracked-session",
        async prompt({ emit }) {
          activeCount++;
          maxConcurrent = Math.max(maxConcurrent, activeCount);
          await new Promise((r) => setTimeout(r, 30));
          emit({
            event: "acp.session.update",
            data: {
              sessionId: "tracked-session",
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "done" },
              },
            },
          } as never);
          activeCount--;
          return { stopReason: "stop" };
        },
        async close() {},
      };

      service = createAcpServiceApp({
        createRuntime: async () => trackedRuntime,
        port: 0,
      });
      const port = await service.start();

      // 并发发 3 个请求
      await Promise.all([
        fetch(`http://localhost:${port}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "req1" }),
        }),
        fetch(`http://localhost:${port}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "req2" }),
        }),
        fetch(`http://localhost:${port}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "req3" }),
        }),
      ]);

      // 单进程串行：任意时刻最多只有 1 个请求在 processing
      expect(maxConcurrent).toBe(1);
    });

    it("queues concurrent requests and processes them in order", async () => {
      const order: number[] = [];

      const orderedRuntime: KimiAcpSessionRuntime = {
        sessionId: "ordered-session",
        async prompt({ emit }, index = order.length) {
          order.push(index);
          await new Promise((r) => setTimeout(r, 10));
          emit({
            event: "acp.session.update",
            data: {
              sessionId: "ordered-session",
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: `result-${index}` },
              },
            },
          } as never);
          return { stopReason: "stop" };
        },
        async close() {},
      };

      service = createAcpServiceApp({
        createRuntime: async () => orderedRuntime,
        port: 0,
      });
      const port = await service.start();

      const results = await Promise.all([
        fetch(`http://localhost:${port}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "first" }),
        }).then((r) => r.json()),
        fetch(`http://localhost:${port}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "second" }),
        }).then((r) => r.json()),
      ]);

      expect(results[0].text).toBe("result-0");
      expect(results[1].text).toBe("result-1");
      // 两个请求按顺序处理
      expect(order).toEqual([0, 1]);
    });
  });

  describe("POST /prompt-yolo", () => {
    it("returns 400 when message is missing", async () => {
      service = createAcpServiceApp({
        createRuntime: async () => createMockRuntime(["hello"]),
        createYoloRuntime: async () => createMockRuntime(["yolo"]),
        port: 0,
      });
      const port = await service.start();

      const res = await fetch(`http://localhost:${port}/prompt-yolo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("message is required");
    });

    it("returns generated text via yolo runtime", async () => {
      service = createAcpServiceApp({
        createRuntime: async () => createMockRuntime(["normal"]),
        createYoloRuntime: async () => createMockRuntime(["yolo-result"]),
        port: 0,
      });
      const port = await service.start();

      const res = await fetch(`http://localhost:${port}/prompt-yolo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test yolo" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.text).toBe("yolo-result");
    });

    it("isolates normal and yolo queues", async () => {
      let normalCalls = 0;
      let yoloCalls = 0;

      const normalRuntime: KimiAcpSessionRuntime = {
        sessionId: "normal-session",
        async prompt({ emit }) {
          normalCalls++;
          emit({
            event: "acp.session.update",
            data: {
              sessionId: "normal-session",
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "normal" },
              },
            },
          } as never);
          return { stopReason: "stop" };
        },
        async close() {},
      };

      const yoloOnlyRuntime: KimiAcpSessionRuntime = {
        sessionId: "yolo-session",
        async prompt({ emit }) {
          yoloCalls++;
          emit({
            event: "acp.session.update",
            data: {
              sessionId: "yolo-session",
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "yolo" },
              },
            },
          } as never);
          return { stopReason: "stop" };
        },
        async close() {},
      };

      service = createAcpServiceApp({
        createRuntime: async () => normalRuntime,
        createYoloRuntime: async () => yoloOnlyRuntime,
        port: 0,
      });
      const port = await service.start();

      await Promise.all([
        fetch(`http://localhost:${port}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "normal" }),
        }).then((r) => r.json()),
        fetch(`http://localhost:${port}/prompt-yolo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "yolo" }),
        }).then((r) => r.json()),
      ]);

      expect(normalCalls).toBe(1);
      expect(yoloCalls).toBe(1);
    });
  });
});
