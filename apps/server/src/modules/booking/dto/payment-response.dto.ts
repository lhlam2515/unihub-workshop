/**
 * Payment Response DTOs
 *
 * PaymentResponseDto: full payment entity (loại bỏ raw_gateway_response)
 * CreatePaymentResponseDto: { payment_id, redirect_url, payment_deadline }
 */

export interface PaymentResponseDto {
  payment_id: string;
  registration_id: string;
  amount: number;
  status: string;
  gateway: string;
  gateway_txn_id?: string;
  created_at: Date;
  updated_at?: Date;
}

export interface CreatePaymentResponseDto {
  payment_id: string;
  redirect_url: string;
  payment_deadline: Date;
}

export class PaymentResponseBuilder {
  static from(payment: any): PaymentResponseDto {
    // TODO: Implement factory
    return {
      payment_id: "",
      registration_id: "",
      amount: 0,
      status: "",
      gateway: "",
      created_at: new Date(),
    };
  }

  static fromCreate(
    payment: any,
    redirectUrl: string,
    deadline: Date
  ): CreatePaymentResponseDto {
    // TODO: Implement factory
    return {
      payment_id: "",
      redirect_url: redirectUrl,
      payment_deadline: deadline,
    };
  }
}
