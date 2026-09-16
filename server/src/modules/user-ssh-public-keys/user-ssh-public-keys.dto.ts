import { z } from "zod";

export const registerUserSshPublicKeySchema = z.object({
  publicKey: z.string().trim().min(1).max(16 * 1024),
  label: z.string().trim().min(1).max(80).optional(),
  actionRunId: z.string().trim().min(1).max(128),
});
