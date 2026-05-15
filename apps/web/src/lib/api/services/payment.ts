import { api } from "@/lib/api/client";
import { Result } from "@/lib/result";
import type {
  CreatePaymentResponse,
  Payment,
  PaymentCreateRequest,
} from "@/types/registration";

/**
 * Initiate a payment for a pending registration.
 *
 * Requires a client-generated X-Idempotency-Key header.
 * The server checks Circuit Breaker before claiming the key.
 */
export async function createPayment(
  body: PaymentCreateRequest,
  idempotencyKey: string
): Promise<Result<CreatePaymentResponse>> {
  return Result.fromPromise(
    api.post<CreatePaymentResponse>("/payments", body, {
      headers: { "X-Idempotency-Key": idempotencyKey },
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
