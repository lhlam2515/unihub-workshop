"use client";

import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

import type { PollState } from "../hooks/use-payment-polling";

interface PaymentStatusIconProps {
  state: PollState;
}

export function PaymentStatusIcon({ state }: PaymentStatusIconProps) {
  switch (state) {
    case "initiated":
      return <Loader2 className="size-12 animate-spin text-blue-500" />;
    case "succeeded":
      return <CheckCircle2 className="size-12 text-green-500" />;
    case "failed":
      return <XCircle className="size-12 text-red-500" />;
    case "unresolved":
    case "timeout":
      return <Clock className="size-12 text-yellow-500" />;
  }
}
