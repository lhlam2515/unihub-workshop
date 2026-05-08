/**
 * Payment Webhook DTO
 *
 * Validate webhook payload:
 * { gateway_txn_id, status: 'SUCCESS' | 'FAILED', idempotency_key, raw_response? }
 */

import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const PaymentWebhookSchema = z.object({
  gatewayTxnId: z.string(),
  status: z.enum(["SUCCESS", "FAILED"]),
  idempotencyKey: z.string().uuid(),
  rawResponse: z.any().optional(),
});

export class PaymentWebhookDto extends createZodDto(PaymentWebhookSchema) {}

export type PaymentWebhookDtoType = z.infer<typeof PaymentWebhookSchema>;
