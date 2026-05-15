"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { createPayment } from "@/features/payment-processing/api/payment.service";
import { GatewaySelector } from "@/features/payment-processing/components/GatewaySelector";
import { PayButton } from "@/features/payment-processing/components/PayButton";
import { PaymentSummary } from "@/features/payment-processing/components/PaymentSummary";
import {
  clearIdempotencyKey,
  generateIdempotencyKey,
} from "@/features/payment-processing/lib/idempotency";
import type { PaymentGateway, Registration } from "@/types/registration";
import type { WorkshopListItem } from "@/types/workshop";

interface PaymentWidgetProps {
  registration: Registration;
  workshop: WorkshopListItem | null;
}

export function PaymentWidget({ registration, workshop }: PaymentWidgetProps) {
  const router = useRouter();
  const [gateway, setGateway] = useState<PaymentGateway | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false);
  const [declinedMessage, setDeclinedMessage] = useState<string | null>(null);

  if (!workshop) {
    return (
      <ErrorDisplay
        error="Không tìm thấy thông tin workshop"
        variant="banner"
      />
    );
  }

  const handlePay = async () => {
    if (!gateway) return;
    setSubmitting(true);
    setDeclinedMessage(null);

    const idempotencyKey = generateIdempotencyKey(registration.id);
    const result = await createPayment(
      {
        registrationId: registration.id,
        gateway,
        returnUrl: `${window.location.origin}/payment-result`,
      },
      idempotencyKey
    );

    if (result.isFailure) {
      const err = result.error as { code?: string; message?: string };
      if (err.code === "PAYMENT_GATEWAY_OPEN") {
        setCircuitBreakerOpen(true);
      } else {
        setDeclinedMessage(err.message ?? "Thanh toán thất bại");
      }
      setSubmitting(false);
      return;
    }

    const payment = result.data;
    clearIdempotencyKey(registration.id);
    if (payment.status === "SUCCEEDED") {
      router.push(`/payment-result?paymentId=${payment.id}&status=succeeded`);
    } else {
      router.push(`/payment-result?paymentId=${payment.id}&status=initiated`);
    }
  };

  const handleCountdownExpired = () => {
    router.push("/me/registrations");
  };

  return (
    <div className="space-y-6">
      <PaymentSummary
        registration={registration}
        workshop={workshop}
        onCountdownExpired={handleCountdownExpired}
      />

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Chọn cổng thanh toán</h3>
        <GatewaySelector
          value={gateway}
          onChange={setGateway}
          disabled={submitting}
        />
      </div>

      {declinedMessage && (
        <ErrorDisplay error={declinedMessage} variant="banner" />
      )}

      {circuitBreakerOpen && (
        <ErrorDisplay
          error="Cổng thanh toán đang gặp sự cố. Vui lòng thử lại sau."
          variant="banner"
        />
      )}

      <PayButton
        disabled={!gateway}
        loading={submitting}
        circuitBreakerOpen={circuitBreakerOpen}
        onClick={handlePay}
      />
    </div>
  );
}
