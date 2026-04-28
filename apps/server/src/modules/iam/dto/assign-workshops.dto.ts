/**
 * Assign Workshops DTO
 *
 * Request: POST /admin/checkin-staff/{user_id}/assign-workshops
 * Validate: { workshop_ids: string[] (UUIDs) }
 */

import { z } from 'zod';

export const AssignWorkshopsSchema = z.object({
  workshop_ids: z.array(z.string().uuid()),
});

export type AssignWorkshopsDto = z.infer<typeof AssignWorkshopsSchema>;
