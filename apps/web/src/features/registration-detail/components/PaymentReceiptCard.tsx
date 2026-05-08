import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Payment } from "@/types/registration";

interface PaymentReceiptCardProps {
  payment: Payment;
}

export function PaymentReceiptCard({ payment }: PaymentReceiptCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Thông tin thanh toán</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Số tiền</span>
          <span className="font-medium">
            {payment.amount.toLocaleString("vi-VN")} {payment.currency}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cổng thanh toán</span>
          <span>{payment.gateway}</span>
        </div>
        {payment.gatewayChargeId && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mã giao dịch</span>
            <span className="font-mono text-xs">{payment.gatewayChargeId}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Trạng thái</span>
          <span>
            {payment.status === "SUCCEEDED" ? "Thành công" : payment.status}
          </span>
        </div>
        {payment.resolvedAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Hoàn tất lúc</span>
            <span>{new Date(payment.resolvedAt).toLocaleString("vi-VN")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
