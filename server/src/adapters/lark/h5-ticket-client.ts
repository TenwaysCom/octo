import { z } from "zod";

const tokenSchema = z.object({ code: z.literal(0), tenant_access_token: z.string().min(1), expire: z.number().positive() });
const ticketSchema = z.object({ code: z.literal(0), data: z.object({ ticket: z.string().min(1), expire_in: z.number().positive() }) });
type Cached = { value: string; expiresAt: number };

// One instance per configured app/process, shared by all signing requests.
export function createLarkH5TicketClient(deps: {
  appId: string; appSecret: string; baseUrl: string; fetchImpl?: typeof fetch; now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  let token: Cached | undefined;
  let ticket: Cached | undefined;
  let pending: Promise<string> | undefined;
  const cache = (value: string, seconds: number, fetchedAt: number): Cached => ({
    value, expiresAt: fetchedAt + seconds * 1000 - Math.min(60000, seconds * 100),
  });
  const post = async (path: string, init: RequestInit, signal: AbortSignal) => {
    const response = await (deps.fetchImpl ?? fetch)(new URL(path, deps.baseUrl), {
      ...init, method: "POST", signal, redirect: "error",
    });
    if (!response.ok) throw new Error("H5_TICKET_FETCH_FAILED");
    return response.json();
  };
  const refresh = async () => {
    if (!deps.appId || !deps.appSecret) throw new Error("H5_APP_NOT_CONFIGURED");
    const signal = AbortSignal.timeout(10000);
    if (!token || token.expiresAt <= now()) {
      const fetchedAt = now();
      const parsed = tokenSchema.parse(await post("/open-apis/auth/v3/tenant_access_token/internal", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: deps.appId, app_secret: deps.appSecret }),
      }, signal));
      token = cache(parsed.tenant_access_token, parsed.expire, fetchedAt);
    }
    const fetchedAt = now();
    try {
      const parsed = ticketSchema.parse(await post("/open-apis/jssdk/ticket/get", {
        headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token.value}` },
      }, signal));
      ticket = cache(parsed.data.ticket, parsed.data.expire_in, fetchedAt);
      return ticket.value;
    } catch {
      // The cached token may have been revoked; retry only on a later request.
      token = undefined;
      throw new Error("H5_TICKET_FETCH_FAILED");
    }
  };
  return {
    getTicket(): Promise<string> {
      if (ticket && ticket.expiresAt > now()) return Promise.resolve(ticket.value);
      if (pending) return pending;
      pending = refresh();
      const clear = () => { pending = undefined; };
      void pending.then(clear, clear);
      return pending;
    },
  };
}
