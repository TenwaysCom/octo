import { z } from "zod";
import { completeLarkH5Login, startLarkH5Login } from "./lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "./lark-auth.controller.js";

const startSchema = z.object({ actionRunId: z.string().uuid() }).strict();
const completeSchema = startSchema.extend({
  challengeId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().min(1).max(4096),
});
const PROOF_COOKIE = "octo_h5_login";
const PROOF_PATH = "/api/lark/auth/h5/complete";

export function createLarkH5LoginController(deps: {
  webOrigin: string; baseUrl: string;
  start?: typeof startLarkH5Login; complete?: typeof completeLarkH5Login;
}) {
  const attributes = `HttpOnly; SameSite=Lax${deps.webOrigin.startsWith("https:") ? "; Secure" : ""}`;
  const error = (statusCode: number, errorCode: string, actionRunId?: string) => ({
    statusCode, cookies: [] as string[],
    body: { ok: false as const, error: { errorCode, errorMessage: "Lark 免登未完成，请使用登录按钮重试。", actionRunId, layer: "server", module: "lark-h5-login", stage: "login" } },
  });
  return {
    async start(input: { origin?: string; body: unknown }) {
      if (input.origin !== deps.webOrigin) return error(403, "H5_LOGIN_ORIGIN_DENIED");
      const parsed = startSchema.safeParse(input.body);
      if (!parsed.success) return error(400, "INVALID_REQUEST");
      const { actionRunId } = parsed.data;
      try {
        const result = await (deps.start ?? startLarkH5Login)(deps.baseUrl);
        return { statusCode: 200,
          cookies: [`${PROOF_COOKIE}=${result.browserProof}; Path=${PROOF_PATH}; Max-Age=180; ${attributes}`],
          body: { ok: true as const, data: { appId: result.appId, challengeId: result.challengeId, actionRunId } },
        };
      } catch { return error(503, "H5_LOGIN_UNAVAILABLE", actionRunId); }
    },
    async complete(input: { origin?: string; cookieHeader?: string; body: unknown }) {
      if (input.origin !== deps.webOrigin) return error(403, "H5_LOGIN_ORIGIN_DENIED");
      const parsed = completeSchema.safeParse(input.body);
      if (!parsed.success) return error(400, "INVALID_REQUEST");
      const browserProof = input.cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${PROOF_COOKIE}=`))?.slice(PROOF_COOKIE.length + 1);
      if (!browserProof || !/^[A-Za-z0-9_-]{43}$/.test(browserProof)) return error(401, "H5_LOGIN_CHALLENGE_INVALID", parsed.data.actionRunId);
      const clearCookie = `${PROOF_COOKIE}=; Path=${PROOF_PATH}; Max-Age=0; ${attributes}`;
      try {
        const result = await (deps.complete ?? completeLarkH5Login)({ ...parsed.data, browserProof });
        if (!result.ok) return { ...error(401, result.errorCode, parsed.data.actionRunId), cookies: [clearCookie] };
        return { statusCode: 200,
          cookies: [clearCookie, `${WEB_SESSION_COOKIE_NAME}=${encodeURIComponent(result.sessionToken)}; Path=/; Max-Age=2592000; ${attributes}`],
          body: { ok: true as const, data: { loggedIn: true, actionRunId: parsed.data.actionRunId } },
        };
      } catch { return { ...error(503, "H5_LOGIN_UNAVAILABLE", parsed.data.actionRunId), cookies: [clearCookie] }; }
    },
  };
}
