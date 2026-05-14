/**
 * Payment Response DTOs
 *
 * Defines the public API response shapes for payment endpoints.
 * Factory methods (from / fromCreate) map database entities to
 * client-safe DTOs, stripping internal fields like raw_gateway_response.
 */

import type { Payment } from "@/infra/database/types/transaction.types";

export interface PaymentResponseDto {
  id: string;
  registrationId: string;
  amount: number;
  currency: string;
  status: string;
  gateway: string;
  gatewayChargeId: string | null;
  qrCode: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CreatePaymentResponseDto {
  paymentId: string;
  redirectUrl: string;
  paymentDeadline: string;
}

export class PaymentResponseBuilder {
  /**
   * Maps a Payment entity to a client-safe PaymentResponseDto.
   *
   * Strips internal fields (raw_gateway_response) and maps
   * DB fields to API response fields matching OpenAPI spec.
   *
   * @param payment - The Payment entity from the database.
   * @param qrCode - Optional QR code from the associated registration.
   * @returns A PaymentResponseDto suitable for API responses.
   */
  static from(payment: Payment, qrCode?: string | null): PaymentResponseDto {
    return {
      id: payment.paymentId,
      registrationId: payment.registrationId,
      amount: Number(payment.amount),
      currency: payment.currency || "VND",
      status: payment.status,
      gateway: payment.gateway,
      gatewayChargeId: payment.gatewayTxnId ?? null,
      qrCode: qrCode ?? null,
      createdAt:
        payment.initiatedAt?.toISOString() ?? new Date(0).toISOString(),
      resolvedAt: payment.completedAt?.toISOString() ?? null,
    };
  }

  /**
   * Maps payment creation result to CreatePaymentResponseDto.
   *
   * Includes the redirect URL for the payment gateway and the
   * payment deadline (15 minutes from creation).
   *
   * @param payment - The newly created Payment entity.
   * @param redirectUrl - The gateway redirect URL.
   * @param deadline - The payment timeout deadline.
   * @returns A CreatePaymentResponseDto with redirect instructions.
   */
  static fromCreate(
    payment: Payment,
    redirectUrl: string,
    deadline: Date
  ): CreatePaymentResponseDto {
    return {
      paymentId: payment.paymentId,
      redirectUrl: redirectUrl,
      paymentDeadline: deadline.toISOString(),
    };
  }
}
