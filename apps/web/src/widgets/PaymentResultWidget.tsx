"use client";

import { ContentLoader } from "@/components/ContentLoader";
import { ActionFooter } from "@/features/payment-result/components/ActionFooter";
import { PaymentStatusIcon } from "@/features/payment-result/components/PaymentStatusIcon";
import type { PollState } from "@/features/payment-result/hooks/use-payment-polling";
import type { Payment } from "@/types/registration";

interface PaymentResultWidgetProps {
  state: PollState;
  payment: Payment | null;
  registrationId?: string;
  onCheckAgain: () => void;
}

export function PaymentResultWidget({
  state,
  payment,
  registrationId,
  onCheckAgain,
}: PaymentResultWidgetProps) {
  const statusMessage = getStatusMessage(state);

  if (state === "initiated" && !payment) {
    return <ContentLoader count={1} />;
  }

  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <PaymentStatusIcon state={state} />

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{statusMessage.title}</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          {statusMessage.description}
        </p>
      </div>

      {payment && (
        <div className="w-full max-w-sm space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Số tiền</span>
            <span className="font-medium">
              {payment.amount.toLocaleString("vi-VN")} {payment.currency}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mã giao dịch</span>
            <span className="font-mono text-xs">
              {payment.id.slice(0, 8)}...
            </span>
          </div>
        </div>
      )}

      <ActionFooter
        state={state}
        registrationId={registrationId}
        onCheckAgain={onCheckAgain}
      />
    </div>
  );
}

function getStatusMessage(state: PollState): {
  title: string;
  description: string;
} {
  switch (state) {
    case "initiated":
      return {
        title: "Đang xác nhận thanh toán...",
        description: "Vui lòng chờ trong giây lát",
      };
    case "succeeded":
      return {
        title: "Thanh toán thành công!",
        description: "Bạn có thể xem mã QR để check-in tại workshop",
      };
    case "failed":
      return {
        title: "Thanh toán thất bại",
        description: "Vui lòng thử lại hoặc chọn phương thức thanh toán khác",
      };
    case "unresolved":
      return {
        title: "Đang chờ xác nhận",
        description:
          "Chúng tôi đang kiểm tra với cổng thanh toán. Bạn sẽ nhận thông báo trong vòng 5 phút.",
      };
    case "timeout":
      return {
        title: "Quá thời gian chờ",
        description:
          "Kết nối đến cổng thanh toán bị gián đoạn. Vui lòng kiểm tra lại.",
      };
  }
}
