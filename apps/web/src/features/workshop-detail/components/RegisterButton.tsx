"use client";

import { Loader2, LogIn, QrCode, TicketX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/ui/button";
import ROUTES from "@/constants/routes";
import { useAuth } from "@/context/auth-context";
import { isApiError } from "@/lib/api/errors";
import { createRegistration } from "@/lib/api/services/booking";
import logger from "@/lib/logger";
import type { WorkshopDetail } from "@/types/workshop";

interface RegisterButtonProps {
  workshop: WorkshopDetail;
}

const ERROR_MESSAGES: Record<string, string> = {
  SEAT_UNAVAILABLE: "Workshop đã hết chỗ.",
  REGISTRATION_DUPLICATE: "Bạn đã đăng ký workshop này rồi.",
  WORKSHOP_NOT_PUBLISHED: "Workshop chưa mở đăng ký.",
  WORKSHOP_CANCELLED: "Workshop đã bị hủy.",
  WORKSHOP_FULL: "Workshop đã hết chỗ.",
  SEAT_LOCK_EXPIRED: "Phiên đăng ký đã hết hạn, vui lòng thử lại.",
};

export function RegisterButton({ workshop }: RegisterButtonProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRegister =
    workshop.seatsAvailable > 0 &&
    !workshop.isRegistered &&
    workshop.status === "OPEN";

  const isFull = workshop.seatsAvailable <= 0 && !workshop.isRegistered;

  // ---- Submit handler ----
  const handleRegister = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);

    const idempotencyKey = crypto.randomUUID();
    const result = await createRegistration(
      { workshopId: workshop.id },
      idempotencyKey
    );

    if (result.isFailure) {
      const err = result.error;
      if (isApiError(err)) {
        if (err.code === "REGISTRATION_DUPLICATE") {
          router.push(ROUTES.ME_REGISTRATIONS);
          return;
        }
        setError(ERROR_MESSAGES[err.code] ?? err.message);
      } else {
        setError("Đã xảy ra lỗi, vui lòng thử lại.");
      }
      setIsSubmitting(false);
      return;
    }

    const registration = result.data;
    // Paid workshop → payment page; free → detail page
    if (registration.nextStep) {
      router.push(ROUTES.ME_REGISTRATION_PAY(registration.id));
    } else {
      router.push(ROUTES.ME_REGISTRATION(registration.id));
    }
  }, [workshop.id, router]);

  // Not authenticated — show login prompt
  if (!isAuthenticated) {
    return (
      <Button
        variant="default"
        className="w-full gap-2"
        onClick={() => router.push(ROUTES.LOGIN)}
      >
        <LogIn className="size-4" />
        Đăng nhập để đăng ký
      </Button>
    );
  }

  // Already registered — show QR link
  if (workshop.isRegistered && workshop.myRegistrationId) {
    return (
      <Button
        variant="default"
        className="w-full gap-2"
        onClick={() =>
          router.push(ROUTES.ME_REGISTRATION(workshop.myRegistrationId!))
        }
      >
        <QrCode className="size-4" />
        Xem QR của tôi
      </Button>
    );
  }

  // Full
  if (isFull) {
    return (
      <Button variant="secondary" className="w-full gap-2" disabled>
        <TicketX className="size-4" />
        Hết chỗ
      </Button>
    );
  }

  // Cancelled
  if (workshop.status === "CANCELLED") {
    return (
      <Button variant="secondary" className="w-full" disabled>
        Workshop đã hủy
      </Button>
    );
  }

  // Not yet open / closed
  if (workshop.status !== "OPEN") {
    return (
      <Button variant="secondary" className="w-full" disabled>
        {workshop.status === "DRAFT"
          ? "Chưa mở đăng ký"
          : workshop.status === "COMPLETED"
            ? "Đã đóng đăng ký"
            : "Không khả dụng"}
      </Button>
    );
  }

  // Can register
  if (canRegister) {
    return (
      <div className="space-y-2">
        {error && <ErrorDisplay error={error} variant="banner" />}
        <Button
          data-testid="register-button"
          className="w-full gap-2"
          disabled={isSubmitting}
          onClick={handleRegister}
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isSubmitting ? "Đang xử lý..." : "Đăng ký"}
        </Button>
      </div>
    );
  }

  return null;
}
