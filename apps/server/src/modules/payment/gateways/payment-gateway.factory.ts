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
 * - Throws if no adapter is registered for the requested gateway name.
 * - The caller is responsible for catching and mapping the error.
 */
import { Injectable } from "@nestjs/common";

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
   * @returns The matching IGatewayAdapter instance.
   * @throws Error if no adapter is registered for the gateway.
   */
  getAdapter(gateway: string): IGatewayAdapter {
    const adapter = this.adapterMap.get(gateway);
    if (!adapter) {
      throw new Error(`No adapter registered for gateway: ${gateway}`);
    }
    return adapter;
  }
}
