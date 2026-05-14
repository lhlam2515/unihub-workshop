/**
 * Create Payment DTO
 *
 * Validate: { registrationId, gateway, returnUrl }
 * Header X-Idempotency-Key extracted by @IdempotencyKey() decorator
 */

import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CreatePaymentSchema = z.object({
  registrationId: z.string().uuid(),
  gateway: z.enum(["VNPAY", "MOMO", "STRIPE", "MOCK"]),
  /** Gateway redirect URL — where the browser lands after payment completion. */
  returnUrl: z.string().url(),
});

export class CreatePaymentDto extends createZodDto(CreatePaymentSchema) {}

export type CreatePaymentDtoType = z.infer<typeof CreatePaymentSchema>;
