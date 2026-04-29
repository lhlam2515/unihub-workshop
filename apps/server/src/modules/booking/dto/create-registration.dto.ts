/**
 * Create Registration DTO
 *
 * Validate: { workshop_id: uuid }
 */

import { z } from "zod";

export const CreateRegistrationSchema = z.object({
  workshop_id: z.string().uuid(),
});

export type CreateRegistrationDto = z.infer<typeof CreateRegistrationSchema>;
