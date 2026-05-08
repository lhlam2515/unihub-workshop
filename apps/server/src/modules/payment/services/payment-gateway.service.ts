/**
 * Payment Gateway Service
 *
 * Adapter layer for payment gateways (VNPAY, MOMO, STRIPE, MOCK).
 * Provides a unified interface for initiating payments and verifying
 * HMAC signatures by delegating to the appropriate IGatewayAdapter
 * via PaymentGatewayFactory.
 *
 * Business rules:
 * - Uses strategy pattern via PaymentGatewayFactory (multi-provider DI).
 * - Unsupported gateways return PAYMENT_GATEWAY_ERROR.
 *
 * Side effects:
 * - MOCK: no external HTTP calls (simulated delay only).
 * - Real gateways: delegates to their respective HTTP client implementations.
 */
import { Injectable, Logger } from "@nestjs/common";

import { paymentErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { PaymentGatewayFactory } from "../gateways/payment-gateway.factory";

import type { GatewayInitiateResult } from "../gateways/gateway-adapter.interface";

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(private readonly gatewayFactory: PaymentGatewayFactory) {}

  /**
   * Delegates payment initiation to the appropriate gateway adapter.
   *
   * @param gateway - Target payment gateway.
   * @param amount - Payment amount in VND.
   * @param metadata - Additional gateway-specific metadata.
   * @returns OkResult with redirect URL and gateway transaction ID,
   * or FailResult with PAYMENT_GATEWAY_ERROR for unsupported gateways.
   */
  async initiatePayment(
    gateway: string,
    amount: number,
    metadata: Record<string, unknown>
  ): Promise<Result<GatewayInitiateResult>> {
    try {
      const adapter = this.gatewayFactory.getAdapter(gateway);
      return adapter.initiatePayment(amount, metadata);
    } catch (err) {
      this.logger.warn(`No adapter for gateway "${gateway}": ${err}`);
      return Result.fail(paymentErrors.gatewayError(gateway));
    }
  }

  /**
   * Verifies the HMAC signature of a webhook payload for the given gateway.
   *
   * @param gateway - The payment gateway identifier.
   * @param payload - The webhook payload to verify.
   * @param signature - The HMAC signature header value.
   * @returns OkResult(true) for MOCK, or FailResult for unsupported gateways.
   */
  async verifyHmacSignature(
    gateway: string,
    payload: unknown,
    signature: string
  ): Promise<Result<boolean>> {
    try {
      const adapter = this.gatewayFactory.getAdapter(gateway);
      return adapter.verifyHmacSignature(payload, signature);
    } catch (err) {
      this.logger.warn(`No adapter for gateway "${gateway}": ${err}`);
      return Result.fail(paymentErrors.gatewayError(gateway));
    }
  }
}
