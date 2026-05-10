"use client";

import { useEffect, useState, useRef } from "react";

import { getPayment } from "@/lib/api/services/payment";
import type { Payment } from "@/types/registration";

export type PollState =
  | "initiated"
  | "succeeded"
  | "failed"
  | "unresolved"
  | "timeout";

/**
 * Poll payment status every 2s, max 15 attempts.
 *
 * Transitions:
 * - `initiated` → (polling) → `succeeded` | `failed` | `unresolved`
 * - If still `initiated` after 15 attempts → `timeout`
 */
export function usePaymentPolling(paymentId: string | null, retryKey?: number) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [state, setState] = useState<PollState>("initiated");
  const attemptsRef = useRef(0);
  const MAX_ATTEMPTS = 15;

  useEffect(() => {
    if (!paymentId) return;

    const interval = setInterval(async () => {
      attemptsRef.current++;

      const result = await getPayment(paymentId);
      if (result.isFailure) return;

      const p = result.data;
      setPayment(p);

      switch (p.status) {
        case "SUCCEEDED":
          setState("succeeded");
          clearInterval(interval);
          return;
        case "FAILED":
          setState("failed");
          clearInterval(interval);
          return;
        case "UNRESOLVED":
          setState("unresolved");
          clearInterval(interval);
          return;
      }

      if (attemptsRef.current >= MAX_ATTEMPTS) {
        setState("timeout");
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [paymentId, retryKey]);

  return { payment, state };
}
