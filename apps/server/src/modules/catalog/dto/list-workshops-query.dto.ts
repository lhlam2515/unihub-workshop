/**
 * List Workshops Query DTO
 *
 * Validate query params:
 * { faculty?, date_from?, date_to?, is_paid?, page?, limit? }
 */

import { z } from 'zod';

export const ListWorkshopsQuerySchema = z.object({
  faculty: z.string().optional(),
  date_from: z.date().optional(),
  date_to: z.date().optional(),
  is_paid: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().default(20),
});

export type ListWorkshopsQueryDto = z.infer<typeof ListWorkshopsQuerySchema>;
