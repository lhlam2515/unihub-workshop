/**
 * Offline Sync DTO
 *
 * Request: POST /checkin/sync
 * Validate: { items: Array<{ qr_token, timestamp }> }
 */

import { z } from "zod";

export const OfflineSyncSchema = z.object({
  items: z.array(
    z.object({
      qr_token: z.string(),
      timestamp: z.date(),
    })
  ),
});

export type OfflineSyncDto = z.infer<typeof OfflineSyncSchema>;
