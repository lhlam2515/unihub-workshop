/**
 * Payment Gateway Factory
 *
 * Resolves the appropriate IGatewayAdapter implementation for a given
 * gateway name from a pre-built registry of adapters.
 *
 * Design rationale:
 * Accepts adapters via constructor injection (array of IGatewayAdapter).
 * The PaymentModule registers this factory with a useFactory provider
 * that passes all registered adapters explicitly.
 *
 * Business rules:
 * - Returns FailResult if no adapter is registered for the requested gateway name.
 */
import { Injectable } from "@nestjs/common";

import { paymentErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import type { IGatewayAdapter } from "./gateway-adapter.interface";

@Injectable()
export class PaymentGatewayFactory {
  private readonly adapterMap: Map<string, IGatewayAdapter>;

  constructor(adapters: IGatewayAdapter[]) {
    this.adapterMap = new Map(
      adapters.map((adapter) => [adapter.gatewayName, adapter])
    );
  }

  /**
   * Returns the adapter registered for the given gateway name.
   *
   * @param gateway - Uppercase gateway identifier (e.g., "MOCK", "VNPAY").
   * @returns OkResult with the matching IGatewayAdapter,
   *          or FailResult (PAYMENT_GATEWAY_ERROR) if no adapter is registered.
   */
  getAdapter(gateway: string): Result<IGatewayAdapter> {
    const adapter = this.adapterMap.get(gateway);
    if (!adapter) {
      return Result.fail(paymentErrors.gatewayError(gateway));
    }
    return Result.ok(adapter);
  }
}
