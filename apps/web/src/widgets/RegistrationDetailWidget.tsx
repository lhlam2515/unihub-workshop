"use client";

import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ROUTES from "@/constants/routes";
import { QRCodeDisplay } from "@/features/registration-detail/components/QRCodeDisplay";
import { RegistrationStatusBadge } from "@/features/registration-detail/components/RegistrationStatusBadge";
import type { Registration } from "@/types/registration";
import type { WorkshopDetail } from "@/types/workshop";

interface RegistrationDetailWidgetProps {
  registration: Registration;
  workshop: WorkshopDetail | null;
  registrationId: string;
}

export function RegistrationDetailWidget({
  registration,
  workshop,
  registrationId,
}: RegistrationDetailWidgetProps) {
  const hasQR =
    registration.qrCode != null &&
    (registration.status === "CONFIRMED" || registration.status === "PAID");
  const needsPayment =
    registration.status === "PENDING" && registration.nextStep;
  const workshopCancelled = workshop?.status === "CANCELLED";

  return (
    <div className="space-y-6">
      <Link
        href={ROUTES.ME_REGISTRATIONS}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Quay lại
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{workshop?.title ?? "Workshop"}</h1>
        <RegistrationStatusBadge status={registration.status} />
      </div>

      {workshopCancelled && (
        <div className="border-destructive/20 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          Workshop đã bị hủy
        </div>
      )}

      {workshop && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Thông tin workshop</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Thời gian</span>
              <span>
                {formatDate(workshop.startsAt)} – {formatDate(workshop.endsAt)}
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
            {workshop.speaker && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Diễn giả</span>
                <span>{workshop.speaker.fullName}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasQR && (
        <div className="flex flex-col items-center gap-4">
          <QRCodeDisplay qrCode={registration.qrCode!} />
          <p className="text-muted-foreground text-xs">
            Hiển thị mã QR cho nhân sự tại cửa phòng
          </p>
          <Button variant="outline" size="sm">
            <Download className="mr-1 size-4" />
            Tải QR về máy
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {needsPayment && (
          <Button asChild>
            <a href={ROUTES.ME_REGISTRATION_PAY(registrationId)}>
              Hoàn tất thanh toán
            </a>
          </Button>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Đăng ký lúc:{" "}
        {new Date(registration.registeredAt).toLocaleString("vi-VN")}
      </p>
    </div>
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
