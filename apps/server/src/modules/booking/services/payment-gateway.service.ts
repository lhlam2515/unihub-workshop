/**
 * Payment Gateway Service
 *
 * Adapter layer cho các cổng thanh toán (VNPAY, MOMO, STRIPE, MOCK).
 * Interface chung:
 * - initiatePayment(gateway, amount, metadata)
 * - verifyHmacSignature(gateway, payload, signature)
 *
 * Mỗi gateway implement riêng phía sau adapter.
 */

import { Injectable } from "@nestjs/common";

@Injectable()
export class PaymentGatewayService {
  /**
   * initiatePayment(gateway: string, amount: number, metadata: any)
   *
   * TODO: Delegate to appropriate gateway adapter
   * Return: { redirect_url, gateway_txn_id }
   */
  async initiatePayment(gateway: string, amount: number, metadata: any) {
    // TODO: Implement gateway adapter delegation
    return {
      redirect_url: "",
      gateway_txn_id: "",
    };
  }

  /**
   * verifyHmacSignature(gateway: string, payload: any, signature: string)
   *
   * TODO: Verify HMAC for each gateway
   * Return: boolean
   */
  async verifyHmacSignature(
    gateway: string,
    payload: any,
    signature: string
  ): Promise<boolean> {
    // TODO: Implement gateway-specific HMAC verification
    return false;
  }
}
