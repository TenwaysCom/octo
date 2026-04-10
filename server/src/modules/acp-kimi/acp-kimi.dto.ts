import { z } from "zod";

export const acpKimiChatRequestSchema = z.object({
  operatorLarkId: z.string().min(1),
  message: z.string().min(1),
});

export type AcpKimiChatRequest = z.infer<typeof acpKimiChatRequestSchema>;

export function validateAcpKimiChatRequest(input: unknown): AcpKimiChatRequest {
  return acpKimiChatRequestSchema.parse(input);
}
