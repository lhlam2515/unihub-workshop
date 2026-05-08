import type { Result } from "@/shared/response/result";

export interface GatewayInitiateResult {
  redirect_url: string;
  gateway_txn_id: string;
}

export interface GatewayStatusResult {
  status: "SUCCEEDED" | "FAILED" | "UNRESOLVED";
  gateway_txn_id?: string;
}

export interface IGatewayAdapter {
  readonly gatewayName: string;
  initiatePayment(
    amount: number,
    metadata: Record<string, unknown>
  ): Promise<Result<GatewayInitiateResult>>;
  verifyHmacSignature(
    payload: unknown,
    signature: string
  ): Promise<Result<boolean>>;
  checkPaymentStatus(
    gatewayTxnId: string
  ): Promise<Result<GatewayStatusResult>>;
}
