"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RegistrationListItem } from "@/types/registration";

interface RegistrationCardProps {
  registration: RegistrationListItem;
  onCancel: () => void;
  onPay: () => void;
  onClick: () => void;
}

const statusConfig: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  PENDING: { label: "Chờ thanh toán", variant: "secondary" },
  CONFIRMED: { label: "Đã xác nhận", variant: "default" },
  PAID: { label: "Đã thanh toán", variant: "default" },
  CANCELLED: { label: "Đã hủy", variant: "outline" },
};

export function RegistrationCard({
  registration,
  onCancel,
  onPay,
  onClick,
}: RegistrationCardProps) {
  const { workshop, status, qrCode } = registration;
  const config = statusConfig[status] ?? {
    label: "Không xác định",
    variant: "outline" as const,
  };

  const canCancel = status !== "CANCELLED";
  const needsPayment = status === "PENDING";

  return (
    <div
      className="cursor-pointer rounded-lg border p-4 transition-shadow hover:shadow-md"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{workshop.title}</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {formatTime(workshop.startsAt)} – {formatTime(workshop.endsAt)}
          </p>
          {workshop.room && (
            <p className="text-muted-foreground text-sm">
              {workshop.room.name}
              {workshop.room.building ? ` — ${workshop.room.building}` : ""}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {qrCode && <span className="text-xs text-green-600">✓ QR</span>}
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {needsPayment && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onPay();
            }}
          >
            Hoàn tất thanh toán
          </Button>
        )}
        {canCancel && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
          >
            Hủy đăng ký
          </Button>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
