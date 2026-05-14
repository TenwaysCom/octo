import { createAcpServiceApp } from "./acp-service.js";
import { createKimiAcpSessionRuntime } from "../adapters/kimi-acp/kimi-acp-runtime.js";
import { acpLogger } from "../logger.js";

const serviceLogger = acpLogger.child({ module: "kimi-acp-service" });

const service = createAcpServiceApp({
  logger: serviceLogger,
  createYoloRuntime: () => createKimiAcpSessionRuntime({ yolo: true }),
});

void service.start();

// ── Graceful Shutdown ───────────────────────────────────────────────

process.on("SIGTERM", async () => {
  serviceLogger.info("KIMI_ACP_SERVICE_SHUTDOWN");
  await service.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  serviceLogger.info("KIMI_ACP_SERVICE_SHUTDOWN");
  await service.close();
  process.exit(0);
});
