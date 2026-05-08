"use client";

import { Loader2, QrCode, TicketX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import ROUTES from "@/constants/routes";
import type { WorkshopDetail } from "@/types/workshop";

interface RegisterButtonProps {
  workshop: WorkshopDetail;
}

export function RegisterButton({ workshop }: RegisterButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canRegister =
    workshop.seatsAvailable > 0 &&
    !workshop.isRegistered &&
    workshop.status === "OPEN";

  const isFull = workshop.seatsAvailable <= 0 && !workshop.isRegistered;

  const handleRegister = useCallback(async () => {
    setIsSubmitting(true);
    // Phase 2 placeholder — actual registration will call POST /registrations
    // with Idempotency-Key header in a later phase.
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsSubmitting(false);
  }, []);

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
      <Button
        className="w-full gap-2"
        disabled={isSubmitting}
        onClick={handleRegister}
      >
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        {isSubmitting ? "Đang xử lý..." : "Đăng ký"}
      </Button>
    );
  }

  return null;
}
