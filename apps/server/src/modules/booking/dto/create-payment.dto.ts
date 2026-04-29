/**
 * Create Payment DTO
 *
 * Validate: { registration_id, gateway: PaymentGateway }
 * Header X-Idempotency-Key extracted by @IdempotencyKey() decorator
 */

import { z } from "zod";

export const CreatePaymentSchema = z.object({
  registration_id: z.string().uuid(),
  gateway: z.enum(["VNPAY", "MOMO", "STRIPE", "MOCK"]),
});

export type CreatePaymentDto = z.infer<typeof CreatePaymentSchema>;
