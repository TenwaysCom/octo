import { z } from "zod";

export const platformDataListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

export type PlatformDataListQuery = z.infer<typeof platformDataListQuerySchema>;
