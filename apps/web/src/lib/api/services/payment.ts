import { api } from "@/lib/api/client";
import { Result } from "@/lib/result";
import type { Payment, PaymentCreateRequest } from "@/types/registration";

/**
 * Initiate a payment for a pending registration.
 *
 * Requires a client-generated Idempotency-Key header.
 * The server checks Circuit Breaker before claiming the key.
 */
export async function createPayment(
  body: PaymentCreateRequest,
  idempotencyKey: string
): Promise<Result<Payment>> {
  return Result.fromPromise(
    api.post<Payment>("/payments", body, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  );
}

/**
 * Poll for payment status (used on the payment-result page after gateway redirect).
 *
 * 2s polling interval recommended, max 15 attempts.
 */
export async function getPayment(paymentId: string): Promise<Result<Payment>> {
  return Result.fromPromise(api.get<Payment>(`/payments/${paymentId}`));
}
