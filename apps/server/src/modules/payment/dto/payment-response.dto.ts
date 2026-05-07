/**
 * Payment Response DTOs
 *
 * Defines the public API response shapes for payment endpoints.
 * Factory methods (from / fromCreate) map database entities to
 * client-safe DTOs, stripping internal fields like raw_gateway_response.
 */

import type { Payment } from "@/infra/database/types/transaction.types";

export interface PaymentResponseDto {
  payment_id: string;
  registration_id: string;
  amount: number;
  status: string;
  gateway: string;
  gateway_txn_id?: string;
  initiated_at: Date;
  completed_at?: Date;
}

export interface CreatePaymentResponseDto {
  payment_id: string;
  redirect_url: string;
  payment_deadline: Date;
}

export class PaymentResponseBuilder {
  /**
   * Maps a Payment entity to a client-safe PaymentResponseDto.
   *
   * Strips internal fields (raw_gateway_response) and renames
   * camelCase DB columns to snake_case API response format.
   *
   * @param payment - The Payment entity from the database.
   * @returns A PaymentResponseDto suitable for API responses.
   */
  static from(payment: Payment): PaymentResponseDto {
    return {
      payment_id: payment.paymentId,
      registration_id: payment.registrationId,
      amount: Number(payment.amount),
      status: payment.status,
      gateway: payment.gateway,
      gateway_txn_id: payment.gatewayTxnId ?? undefined,
      initiated_at: payment.initiatedAt,
      completed_at: payment.completedAt ?? undefined,
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
      payment_id: payment.paymentId,
      redirect_url: redirectUrl,
      payment_deadline: deadline,
    };
  }
}
