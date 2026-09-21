import { z } from "zod";

const exchangeResponseSchema = z.object({
  data: z.object({
    session_token: z.string().trim().min(1),
    expires_in: z.number().int().positive(),
  }),
});

export class WeKnoraExchangeError extends Error {
  constructor(readonly errorCode: string, readonly rawStatusCode?: number) {
    super(errorCode);
    this.name = "WeKnoraExchangeError";
  }
}

export async function exchangeWeKnoraEmbedToken(input: {
  publishToken: string;
  origin: string;
}, deps: { fetch?: typeof fetch } = {}) {
  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(
      "https://weknora.odoo.tenways.it:18443/api/v1/embed/6410a037-6485-4408-8173-4b0c498a0426/exchange",
      {
        method: "POST",
        headers: { Authorization: `Embed ${input.publishToken}`, Origin: input.origin },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      },
    );
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new WeKnoraExchangeError(timeout ? "WEKNORA_EXCHANGE_TIMEOUT" : "WEKNORA_CONNECTION_FAILED");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Classify known upstream failures without returning or logging raw bodies.
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error.toLowerCase() : "";
    const originRejected = response.status === 403 && message.includes("origin") && message.includes("allow");
    throw new WeKnoraExchangeError(originRejected ? "WEKNORA_ORIGIN_NOT_ALLOWED" : "WEKNORA_EXCHANGE_REJECTED", response.status);
  }
  const parsed = exchangeResponseSchema.safeParse(body);
  if (!parsed.success) throw new WeKnoraExchangeError("WEKNORA_INVALID_RESPONSE", response.status);
  const { data } = parsed.data;
  return { token: data.session_token, expiresIn: data.expires_in };
}
