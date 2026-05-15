/**
 * Mock Gateway Adapter
 *
 * Simulates a payment gateway for local development and testing.
 * Returns deterministic fake responses without external HTTP calls.
 *
 * Business rules:
 * - initiatePayment: 100ms simulated delay, returns fake redirect URL + txn ID.
 * - verifyHmacSignature: always returns true (no real signature verification).
 * - checkPaymentStatus: always returns SUCCEEDED (simulated).
 *
 * Side effects:
 * - None (no external HTTP calls, simulated delay only).
 */
import { Injectable } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import type {
  GatewayInitiateResult,
  GatewayStatusResult,
  IGatewayAdapter,
} from "./gateway-adapter.interface";

@Injectable()
export class MockGatewayAdapter implements IGatewayAdapter {
  readonly gatewayName = "MOCK";

  async initiatePayment(
    _amount: number,
    _metadata: Record<string, unknown>
  ): Promise<Result<GatewayInitiateResult>> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return Result.ok({
      redirectUrl: `https://mock-gateway.test/pay/demo-txn-${Date.now()}`,
      gatewayTxnId: `mock_txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  async verifyHmacSignature(
    _payload: unknown,
    _signature: string
  ): Promise<Result<boolean>> {
    return Result.ok(true);
  }

  async checkPaymentStatus(
    _gatewayTxnId: string
  ): Promise<Result<GatewayStatusResult>> {
    return Result.ok({ status: "SUCCEEDED" });
  }
}
