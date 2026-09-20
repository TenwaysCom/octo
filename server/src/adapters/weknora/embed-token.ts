import { z } from "zod";

const exchangeResponseSchema = z.object({
  data: z.object({
    session_token: z.string().trim().min(1),
    expires_in: z.number().int().positive(),
  }),
});

export async function exchangeWeKnoraEmbedToken(input: {
  publishToken: string;
  origin: string;
}, deps: { fetch?: typeof fetch } = {}) {
  const response = await (deps.fetch ?? fetch)(
    "https://weknora.odoo.tenways.it:18443/api/v1/embed/6410a037-6485-4408-8173-4b0c498a0426/exchange",
    {
      method: "POST",
      headers: { Authorization: `Embed ${input.publishToken}`, Origin: input.origin },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    },
  );
  if (!response.ok) throw new Error("WEKNORA_EXCHANGE_FAILED");
  const { data } = exchangeResponseSchema.parse(await response.json());
  return { token: data.session_token, expiresIn: data.expires_in };
}
