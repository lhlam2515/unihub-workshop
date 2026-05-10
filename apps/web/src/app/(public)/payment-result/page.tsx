"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PageLoader } from "@/components/PageLoader";
import { usePaymentPolling } from "@/features/payment-result/hooks/use-payment-polling";
import { PaymentResultWidget } from "@/widgets/PaymentResultWidget";

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paymentId = searchParams.get("paymentId");
  const [pollKey, setPollKey] = useState(0);

  useEffect(() => {
    if (!paymentId) router.replace("/me/registrations");
  }, [paymentId, router]);

  // pollKey change restarts polling via hook dependency
  const { payment, state } = usePaymentPolling(paymentId, pollKey);

  const handleCheckAgain = () => {
    setPollKey((k) => k + 1);
  };

  // Prevent flash render before redirect
  if (!paymentId) return null;

  return (
    <div className="mx-auto max-w-lg p-4">
      <PaymentResultWidget
        state={state}
        payment={payment}
        registrationId={payment?.registrationId}
        onCheckAgain={handleCheckAgain}
      />
    </div>
  );
}

const PaymentResultPage = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <PaymentResultContent />
    </Suspense>
  );
};

export default PaymentResultPage;
