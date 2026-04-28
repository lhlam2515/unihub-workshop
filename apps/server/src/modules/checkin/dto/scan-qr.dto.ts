/**
 * Scan QR DTO
 *
 * Request: POST /checkin/scan
 * Validate: { qr_token, workshop_id, device_id? }
 */

import { z } from 'zod';

export const ScanQRSchema = z.object({
  qr_token: z.string(),
  workshop_id: z.string().uuid(),
  device_id: z.string().optional(),
});

export type ScanQRDto = z.infer<typeof ScanQRSchema>;
