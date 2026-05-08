"use client";

import { useState } from "react";

import { ContentLoader } from "@/components/ContentLoader";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { GatewaySelector } from "@/features/payment-processing/components/GatewaySelector";
import { PayButton } from "@/features/payment-processing/components/PayButton";
import { PaymentSummary } from "@/features/payment-processing/components/PaymentSummary";
import type { PaymentGateway } from "@/types/registration";
import type { Registration } from "@/types/registration";
import type { WorkshopListItem } from "@/types/workshop";

interface PaymentWidgetProps {
  registration: Registration | null;
  workshop: WorkshopListItem | null;
  loading: boolean;
  error?: string;
  registrationId: string;
  submitting: boolean;
  circuitBreakerOpen: boolean;
  declinedMessage: string | null;
  onPay: (gateway: PaymentGateway) => void;
  onCountdownExpired: () => void;
}

export function PaymentWidget({
  registration,
  workshop,
  loading,
  error,
  submitting,
  circuitBreakerOpen,
  declinedMessage,
  onPay,
  onCountdownExpired,
}: PaymentWidgetProps) {
  const [gateway, setGateway] = useState<PaymentGateway | null>(null);

  if (loading) return <ContentLoader count={1} />;
  if (error) return <ErrorDisplay error={error} variant="banner" />;
  if (!registration || !workshop) {
    return <ErrorDisplay error="Không tìm thấy thông tin" variant="banner" />;
  }

  const handlePay = () => {
    if (!gateway) return;
    onPay(gateway);
  };

  return (
    <div className="space-y-6">
      <PaymentSummary
        registration={registration}
        workshop={workshop}
        onCountdownExpired={onCountdownExpired}
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
