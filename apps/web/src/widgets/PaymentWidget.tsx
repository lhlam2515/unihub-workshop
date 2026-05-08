"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ContentLoader } from "@/components/ContentLoader";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import ROUTES from "@/constants/routes";
import { createPayment } from "@/features/payment-processing/api/payment.service";
import { GatewaySelector } from "@/features/payment-processing/components/GatewaySelector";
import { PayButton } from "@/features/payment-processing/components/PayButton";
import { PaymentSummary } from "@/features/payment-processing/components/PaymentSummary";
import {
  clearIdempotencyKey,
  generateIdempotencyKey,
} from "@/features/payment-processing/lib/idempotency";
import type { PaymentGateway } from "@/types/registration";
import type { Registration } from "@/types/registration";
import type { WorkshopListItem } from "@/types/workshop";

interface PaymentWidgetProps {
  registration: Registration | null;
  workshop: WorkshopListItem | null;
  loading: boolean;
  error?: string;
  registrationId: string;
}

export function PaymentWidget({
  registration,
  workshop,
  loading,
  error,
  registrationId,
}: PaymentWidgetProps) {
  const router = useRouter();
  const [gateway, setGateway] = useState<PaymentGateway | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false);
  const [declinedMessage, setDeclinedMessage] = useState<string | null>(null);

  if (loading) return <ContentLoader count={1} />;
  if (error) return <ErrorDisplay error={error} variant="banner" />;
  if (!registration || !workshop) {
    return <ErrorDisplay error="Không tìm thấy thông tin" variant="banner" />;
  }

  const handlePay = async () => {
    if (!gateway) return;
    setSubmitting(true);
    setDeclinedMessage(null);

    const idempotencyKey = generateIdempotencyKey(registrationId);
    const result = await createPayment(
      {
        registrationId,
        gateway,
        returnUrl: `${window.location.origin}/payment-result`,
      },
      idempotencyKey
    );

    if (result.isFailure) {
      const err = result.error as {
        code?: string;
        message?: string;
      };
      if (err.code === "PAYMENT_GATEWAY_OPEN") {
        setCircuitBreakerOpen(true);
      } else if (err.code === "payment.declined") {
        setDeclinedMessage(err.message ?? "Thanh toán bị từ chối");
      } else {
        setDeclinedMessage(err.message ?? "Thanh toán thất bại");
      }
      setSubmitting(false);
      return;
    }

    const payment = result.data;
    if (payment.status === "SUCCEEDED") {
      clearIdempotencyKey(registrationId);
      router.push(`/payment-result?paymentId=${payment.id}&status=succeeded`);
    } else {
      router.push(`/payment-result?paymentId=${payment.id}&status=initiated`);
    }
  };

  const handleCountdownExpired = () => {
    router.push(ROUTES.ME_REGISTRATIONS);
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
