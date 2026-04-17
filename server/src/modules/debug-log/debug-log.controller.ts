import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const clientDebugLogRequestSchema = z.object({
  source: z.string().min(1),
  level: z.enum(["debug", "info", "warn", "error"]),
  event: z.string().min(1),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export async function writeClientDebugLogController(input: unknown) {
  const payload = clientDebugLogRequestSchema.parse(input);
  const logFile = resolve(process.env.CLIENT_DEBUG_LOG_FILE || "./logs/popup-client.log");
  await mkdir(dirname(logFile), { recursive: true });
  await appendFile(
    logFile,
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...payload,
    })}\n`,
    "utf-8",
  );

  return {
    ok: true,
  };
}
