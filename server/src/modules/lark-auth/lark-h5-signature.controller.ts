import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { logger } from "../../logger.js";
import { resolveLarkWebSessionIdentity } from "./lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "./lark-auth.controller.js";

const requestSchema = z.object({ url: z.string().url().max(16384), actionRunId: z.string().uuid() }).strict();

export function signLarkH5Url(ticket: string, nonceStr: string, timestamp: number, url: string): string {
  return createHash("sha1").update(`jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`).digest("hex");
}

export function createLarkH5SignatureController(deps: {
  appId: string; webOrigin: string; getTicket: () => Promise<string>;
  ensureSession?: typeof resolveLarkWebSessionIdentity; now?: () => number;
}) {
  return async (input: { origin?: string; cookieHeader?: string; body: unknown }) => {
    const fail = (statusCode: number, errorCode: string, actionRunId?: string) => ({ statusCode,
      body: { ok: false as const, error: { errorCode, errorMessage: "H5 会话鉴权未完成。", actionRunId, layer: "server", module: "lark-h5", stage: "signature" } },
    });
    if (input.origin !== deps.webOrigin) return fail(403, "H5_ORIGIN_DENIED");
    const parsed = requestSchema.safeParse(input.body);
    if (!parsed.success) return fail(400, "INVALID_REQUEST");
    const { actionRunId } = parsed.data;
    const pageUrl = parsed.data.url.split("#")[0];
    const url = new URL(pageUrl);
    if (url.origin !== deps.webOrigin || url.username || url.password || !["https:", "http:"].includes(url.protocol)) return fail(403, "H5_URL_DENIED", actionRunId);
    let cookie: string | undefined;
    try {
      const part = input.cookieHeader?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${WEB_SESSION_COOKIE_NAME}=`));
      cookie = part ? decodeURIComponent(part.slice(WEB_SESSION_COOKIE_NAME.length + 1)) : undefined;
    } catch { return fail(401, "UNAUTHENTICATED", actionRunId); }
    try {
      const session = await (deps.ensureSession ?? resolveLarkWebSessionIdentity)(cookie);
      if (!session.ok) return fail(401, "UNAUTHENTICATED", actionRunId);
      const ticket = await deps.getTicket();
      const timestamp = (deps.now ?? Date.now)(); // Lark requires milliseconds, not seconds.
      const nonceStr = randomBytes(16).toString("hex");
      const signature = signLarkH5Url(ticket, nonceStr, timestamp, pageUrl);
      logger.info({ actionRunId, layer: "server", module: "lark-h5", stage: "signature", masterUserId: session.masterUserId }, "LARK_H5_SIGNATURE_OK");
      return { statusCode: 200, body: { ok: true as const, data: { appId: deps.appId, timestamp, nonceStr, signature, actionRunId } } };
    } catch {
      logger.warn({ actionRunId, layer: "server", module: "lark-h5", stage: "signature", errorCode: "H5_SIGNATURE_FAILED" }, "LARK_H5_SIGNATURE_FAILED");
      return fail(503, "H5_SIGNATURE_FAILED", actionRunId);
    }
  };
}
