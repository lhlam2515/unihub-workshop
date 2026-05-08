/**
 * Stripe Gateway Adapter (Placeholder)
 *
 * Placeholder adapter for Stripe integration. Returns PAYMENT_GATEWAY_ERROR
 * until the real Stripe HTTP client integration is implemented.
 *
 * Business rules:
 * - All methods return PAYMENT_GATEWAY_ERROR (not implemented yet).
 *
 * @see IGatewayAdapter for the full contract.
 */
import { Injectable } from "@nestjs/common";

import { paymentErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import type {
  GatewayInitiateResult,
  GatewayStatusResult,
  IGatewayAdapter,
} from "./gateway-adapter.interface";

@Injectable()
export class StripeGatewayAdapter implements IGatewayAdapter {
  readonly gatewayName = "STRIPE";

  async initiatePayment(
    _amount: number,
    _metadata: Record<string, unknown>
  ): Promise<Result<GatewayInitiateResult>> {
    return Result.fail(paymentErrors.gatewayError("STRIPE"));
  }

  async verifyHmacSignature(
    _payload: unknown,
    _signature: string
  ): Promise<Result<boolean>> {
    return Result.fail(paymentErrors.gatewayError("STRIPE"));
  }

  async checkPaymentStatus(
    _gatewayTxnId: string
  ): Promise<Result<GatewayStatusResult>> {
    return Result.fail(paymentErrors.gatewayError("STRIPE"));
  }
}
