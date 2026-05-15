import type { Result } from "@/shared/response/result";

export interface GatewayInitiateResult {
  redirectUrl: string;
  gatewayTxnId: string;
}

export interface GatewayStatusResult {
  status: "SUCCEEDED" | "FAILED" | "UNRESOLVED";
  gatewayTxnId?: string;
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
