import express from "express";
import type { KimiAcpSessionRuntime } from "../adapters/kimi-acp/kimi-acp-runtime.js";
import type { AcpKimiStreamEvent } from "../modules/acp-kimi/event-stream.js";
import type { Logger } from "pino";

export interface AcpServiceDeps {
  createRuntime?: () => Promise<KimiAcpSessionRuntime>;
  createYoloRuntime?: () => Promise<KimiAcpSessionRuntime>;
  logger?: Logger;
  port?: number;
}

export interface AcpServiceApp {
  app: express.Express;
  start(): Promise<number>;
  close(): Promise<void>;
  getQueueLength(): number;
  getYoloQueueLength(): number;
  isProcessing(): boolean;
  isYoloProcessing(): boolean;
}

export function createAcpServiceApp(deps: AcpServiceDeps = {}): AcpServiceApp {
  const serviceLogger = deps.logger;
  const createRuntime = deps.createRuntime;
  const createYoloRuntime = deps.createYoloRuntime;
  const port = deps.port ?? Number(process.env.KIMI_ACP_SERVICE_PORT || 3456);

  let runtime: KimiAcpSessionRuntime | null = null;

  async function getRuntime(): Promise<KimiAcpSessionRuntime> {
    if (!runtime) {
      if (!createRuntime) {
        // 动态导入避免顶层循环依赖（测试时通过 deps 注入，不会走到这里）
        const { createKimiAcpSessionRuntime } = await import(
          "../adapters/kimi-acp/kimi-acp-runtime.js"
        );
        runtime = await createKimiAcpSessionRuntime();
      } else {
        runtime = await createRuntime();
      }
      serviceLogger?.info({ sessionId: runtime.sessionId }, "KIMI_ACP_SERVICE_INIT_OK");
    }
    return runtime;
  }

  let yoloRuntime: KimiAcpSessionRuntime | null = null;

  async function getYoloRuntime(): Promise<KimiAcpSessionRuntime> {
    if (!yoloRuntime) {
      if (!createYoloRuntime) {
        const { createKimiAcpSessionRuntime } = await import(
          "../adapters/kimi-acp/kimi-acp-runtime.js"
        );
        yoloRuntime = await createKimiAcpSessionRuntime({ yolo: true });
      } else {
        yoloRuntime = await createYoloRuntime();
      }
      serviceLogger?.info({ sessionId: yoloRuntime.sessionId }, "KIMI_ACP_SERVICE_YOLO_INIT_OK");
    }
    return yoloRuntime;
  }

  // ── 请求队列（单进程串行处理）───────────────────────────────────────

  interface QueuedRequest {
    message: string;
    resolve: (result: { text: string; stopReason: string }) => void;
    reject: (err: Error) => void;
  }

  let processing = false;
  const queue: QueuedRequest[] = [];
  let yoloProcessing = false;
  const yoloQueue: QueuedRequest[] = [];

  // ── System Prompt（注入到每个请求前，减少交互式确认和循环）────────────────

  const SYSTEM_PROMPT = `【系统指令】
你当前运行在自动化服务模式。请严格遵守以下规则：

1. 直接执行：如果需要调用工具或执行命令，直接执行，不要询问用户确认或反馈。
2. 简洁思考：思考过程简短，不输出冗长的推理步骤。
3. 限制重试：工具调用失败时最多重试 1 次，连续失败后停止并报告错误，不要无限循环。
4. 结论输出：最终只输出结论，不输出中间执行过程。

【任务】
`;  

  async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    const { message, resolve, reject } = queue.shift()!;

    try {
      const rt = await getRuntime();
      const chunks: string[] = [];

      const result = await rt.prompt({
        message: SYSTEM_PROMPT + message,
        emit: (event: AcpKimiStreamEvent) => {
          if (event.event === "acp.session.update") {
            const update = event.data.update as Record<string, unknown>;
            if (update.sessionUpdate === "agent_message_chunk") {
              const content = update.content as {
                type?: string;
                text?: string;
              };
              if (content?.type === "text" && content.text) {
                chunks.push(content.text);
              }
            }
          }
        },
      });

      resolve({ text: chunks.join(""), stopReason: result.stopReason });
    } catch (err) {
      serviceLogger?.error(
        { error: err instanceof Error ? err.message : String(err) },
        "KIMI_ACP_SERVICE_PROMPT_ERROR",
      );
      reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      processing = false;
      setImmediate(processQueue);
    }
  }

  async function processYoloQueue() {
    if (yoloProcessing || yoloQueue.length === 0) return;
    yoloProcessing = true;

    const { message, resolve, reject } = yoloQueue.shift()!;

    try {
      const rt = await getYoloRuntime();
      const chunks: string[] = [];

      const result = await rt.prompt({
        message: SYSTEM_PROMPT + message,
        emit: (event: AcpKimiStreamEvent) => {
          if (event.event === "acp.session.update") {
            const update = event.data.update as Record<string, unknown>;
            if (update.sessionUpdate === "agent_message_chunk") {
              const content = update.content as {
                type?: string;
                text?: string;
              };
              if (content?.type === "text" && content.text) {
                chunks.push(content.text);
              }
            }
          }
        },
      });

      resolve({ text: chunks.join(""), stopReason: result.stopReason });
    } catch (err) {
      serviceLogger?.error(
        { error: err instanceof Error ? err.message : String(err) },
        "KIMI_ACP_SERVICE_YOLO_PROMPT_ERROR",
      );
      reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      yoloProcessing = false;
      setImmediate(processYoloQueue);
    }
  }

  // ── Express App ─────────────────────────────────────────────────────

  const app = express();
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    try {
      await getRuntime();
      res.json({ ok: true, status: "ready" });
    } catch (err) {
      res.status(503).json({
        ok: false,
        status: "unavailable",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/prompt", (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ ok: false, error: "message is required" });
      return;
    }

    serviceLogger?.info(
      { messageLength: message.length, queueLength: queue.length, message: message.slice(0, 500) },
      "KIMI_ACP_SERVICE_PROMPT_REQUEST",
    );

    new Promise<{ text: string; stopReason: string }>((resolve, reject) => {
      queue.push({ message, resolve, reject });
      processQueue();
    })
      .then((result) => {
        serviceLogger?.info(
          { textLength: result.text.length, stopReason: result.stopReason },
          "KIMI_ACP_SERVICE_PROMPT_OK",
        );
        res.json({ ok: true, ...result });
      })
      .catch((err) => {
        serviceLogger?.error(
          { error: err instanceof Error ? err.message : String(err) },
          "KIMI_ACP_SERVICE_PROMPT_FAIL",
        );
        res.status(500).json({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });

  app.post("/prompt-yolo", (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ ok: false, error: "message is required" });
      return;
    }

    serviceLogger?.info(
      { messageLength: message.length, yoloQueueLength: yoloQueue.length, message: message.slice(0, 500) },
      "KIMI_ACP_SERVICE_YOLO_PROMPT_REQUEST",
    );

    new Promise<{ text: string; stopReason: string }>((resolve, reject) => {
      yoloQueue.push({ message, resolve, reject });
      processYoloQueue();
    })
      .then((result) => {
        serviceLogger?.info(
          { textLength: result.text.length, stopReason: result.stopReason },
          "KIMI_ACP_SERVICE_YOLO_PROMPT_OK",
        );
        res.json({ ok: true, ...result });
      })
      .catch((err) => {
        serviceLogger?.error(
          { error: err instanceof Error ? err.message : String(err) },
          "KIMI_ACP_SERVICE_YOLO_PROMPT_FAIL",
        );
        res.status(500).json({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });

  let server: ReturnType<typeof app.listen> | null = null;

  return {
    app,
    getQueueLength() {
      return queue.length;
    },
    getYoloQueueLength() {
      return yoloQueue.length;
    },
    isProcessing() {
      return processing;
    },
    isYoloProcessing() {
      return yoloProcessing;
    },
    async start() {
      // 预热
      if (createRuntime) {
        await getRuntime();
      }
      const actualPort = await new Promise<number>((resolve, reject) => {
        server = app.listen(port, () => {
          const addr = server?.address();
          const listeningPort = typeof addr === "object" && addr !== null ? addr.port : port;
          serviceLogger?.info({ port: listeningPort }, "KIMI_ACP_SERVICE_LISTENING");
          resolve(listeningPort);
        });
        server.once("error", (err) => {
          serviceLogger?.error({ error: err.message }, "KIMI_ACP_SERVICE_LISTEN_ERROR");
          reject(err);
        });
      });
      return actualPort;
    },
    async close() {
      if (server) {
        await new Promise<void>((resolve) => {
          server!.close(() => resolve());
        });
        server = null;
      }
      if (runtime) {
        await runtime.close();
        runtime = null;
      }
      if (yoloRuntime) {
        await yoloRuntime.close();
        yoloRuntime = null;
      }
      // 清空队列，拒绝所有等待中的请求
      while (queue.length > 0) {
        const req = queue.shift()!;
        req.reject(new Error("service shutting down"));
      }
      while (yoloQueue.length > 0) {
        const req = yoloQueue.shift()!;
        req.reject(new Error("service shutting down"));
      }
    },
  };
}
