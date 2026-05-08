"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Registration } from "@/types/registration";
import type { WorkshopListItem } from "@/types/workshop";

import { CountdownTimer } from "./CountdownTimer";

interface PaymentSummaryProps {
  registration: Registration;
  workshop: WorkshopListItem;
  onCountdownExpired: () => void;
}

export function PaymentSummary({
  registration,
  workshop,
  onCountdownExpired,
}: PaymentSummaryProps) {
  const nextStep = registration.nextStep;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{workshop.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Thời gian</span>
          <span>
            {formatDate(workshop.startsAt)} – {formatTime(workshop.endsAt)}
          </span>
        </div>
        {workshop.room && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Phòng</span>
            <span>
              {workshop.room.name}
              {workshop.room.building ? ` — ${workshop.room.building}` : ""}
            </span>
          </div>
        )}
        {nextStep && (
          <>
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Tổng tiền</span>
              <span>
                {nextStep.amount.toLocaleString("vi-VN")} {nextStep.currency}
              </span>
            </div>
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>Đăng ký sẽ tự hủy sau</span>
              <CountdownTimer
                expiresAt={nextStep.expiresAt}
                onExpired={onCountdownExpired}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
