"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { ContentLoader } from "@/components/ContentLoader";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { createPayment } from "@/features/payment-processing/api/payment.service";
import {
  clearIdempotencyKey,
  generateIdempotencyKey,
} from "@/features/payment-processing/lib/idempotency";
import { getRegistration } from "@/lib/api/services/booking";
import { getWorkshopDetail } from "@/lib/api/services/catalog";
import type { PaymentGateway } from "@/types/registration";
import type { Registration } from "@/types/registration";
import type { WorkshopDetail } from "@/types/workshop";
import { PaymentWidget } from "@/widgets/PaymentWidget";

const PayPage = ({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) => {
  const { registrationId } = use(params);
  const router = useRouter();

  const [registration, setRegistration] = useState<Registration | null>(null);
  const [workshop, setWorkshop] = useState<WorkshopDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const [submitting, setSubmitting] = useState(false);
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false);
  const [declinedMessage, setDeclinedMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const regResult = await getRegistration(registrationId);
      if (regResult.isFailure) {
        setError(
          (regResult.error as { message?: string })?.message ??
            "Không thể tải thông tin đăng ký"
        );
        setLoading(false);
        return;
      }
      setRegistration(regResult.data);

      const wsResult = await getWorkshopDetail(regResult.data.workshopId);
      if (wsResult.isSuccess) {
        setWorkshop(wsResult.data);
      }
      setLoading(false);
    }
    load();
  }, [registrationId]);

  const handlePay = async (gateway: PaymentGateway) => {
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
    router.push("/me/registrations");
  };

  if (loading) return <ContentLoader count={1} />;
  if (error) return <ErrorDisplay error={error} variant="banner" />;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <h1 className="text-2xl font-bold">Thanh toán</h1>
      <PaymentWidget
        registration={registration}
        workshop={workshop}
        loading={false}
        registrationId={registrationId}
        submitting={submitting}
        circuitBreakerOpen={circuitBreakerOpen}
        declinedMessage={declinedMessage}
        onPay={handlePay}
        onCountdownExpired={handleCountdownExpired}
      />
    </div>
  );
};

export default PayPage;
