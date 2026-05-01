/**
 * Payment Gateway Service
 *
 * Adapter layer for payment gateways (VNPAY, MOMO, STRIPE, MOCK).
 * Provides a unified interface for initiating payments and verifying
 * HMAC signatures across different gateway implementations.
 *
 * Design rationale (switch over strategy):
 * For MVP with 4 gateways and 2 methods each, a switch statement is
 * simpler and more readable than a Strategy pattern with injected adapters.
 * Strategy pattern is warranted when runtime plugin registration is needed,
 * which is not yet the case.
 *
 * MOCK adapter:
 * - Simulates 1-2s gateway delay.
 * - Returns deterministic fake redirect URL and transaction ID.
 * - Always succeeds (no real HTTP calls).
 *
 * Business rules:
 * - Each gateway has its own initiatePayment and verifyHmacSignature logic.
 * - Unsupported gateways return PAYMENT_GATEWAY_ERROR.
 *
 * Side effects:
 * - MOCK: no external HTTP calls (simulated delay only).
 */
import { Injectable } from "@nestjs/common";

import { paymentErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

export interface GatewayInitiateResult {
  redirect_url: string;
  gateway_txn_id: string;
}

@Injectable()
export class PaymentGatewayService {
  /**
   * Delegates payment initiation to the appropriate gateway adapter.
   *
   * Business rules:
   * - MOCK returns a simulated redirect URL and transaction ID.
   * - VNPAY, STRIPE, MOMO are placeholder cases — returns PAYMENT_GATEWAY_ERROR
   *   until real adapters are implemented.
   *
   * @param gateway - Target payment gateway.
   * @param amount - Payment amount in VND.
   * @param metadata - Additional gateway-specific metadata (e.g., order info).
   * @returns OkResult with redirect URL and gateway transaction ID,
   * or FailResult with PAYMENT_GATEWAY_ERROR for unsupported gateways.
   */
  async initiatePayment(
    gateway: string,
    amount: number,
    metadata: Record<string, unknown>
  ): Promise<Result<GatewayInitiateResult>> {
    switch (gateway) {
      case "MOCK": {
        // Simulate gateway processing delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        return Result.ok({
          redirect_url: `https://mock-gateway.test/pay/demo-txn-${Date.now()}`,
          gateway_txn_id: `mock_txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        });
      }
      // Explicit placeholder cases — ready for real adapters without refactoring
      case "VNPAY":
      case "STRIPE":
      case "MOMO":
      default:
        return Result.fail(paymentErrors.gatewayError(gateway));
    }
  }

  /**
   * Verifies the HMAC signature of a webhook payload for the given gateway.
   *
   * Business rules:
   * - MOCK: always returns true (simulated verification).
   * - Real gateways: the HMAC is verified by HmacSignatureGuard before
   *   reaching this service, so this method serves as an additional
   *   layer or for non-webhook verification contexts.
   *
   * @param gateway - The payment gateway identifier.
   * @param _payload - The webhook payload to verify.
   * @param _signature - The HMAC signature header value.
   * @returns OkResult(true) for MOCK, or FailResult for unsupported gateways.
   */
  async verifyHmacSignature(
    gateway: string,
    _payload: unknown,
    _signature: string
  ): Promise<Result<boolean>> {
    switch (gateway) {
      case "MOCK":
        return Result.ok(true);
      case "VNPAY":
      case "STRIPE":
      case "MOMO":
      default:
        return Result.fail(paymentErrors.gatewayError(gateway));
    }
  }
}
