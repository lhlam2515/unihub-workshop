import { z } from "zod";

export const OfflineSyncSchema = z.object({
  workshop_id: z.string().uuid(),
  items: z.array(
    z.object({
      qr_token: z.string(),
      timestamp: z.coerce.date(),
      device_id: z.string().optional(),
    })
  ),
});

export type OfflineSyncDto = z.infer<typeof OfflineSyncSchema>;
