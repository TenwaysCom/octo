import { z } from "zod";

export const registerUserSshPublicKeySchema = z.object({
  publicKey: z.string().trim().min(1).max(16 * 1024),
  actionRunId: z.string().trim().min(1).max(128),
});
