"use client";

import { useEffect, useState } from "react";

import { getCircuitBreakers } from "@/lib/api/services/admin";
import type { CircuitBreakerState } from "@/types/admin-operations";
import { AdminSystemWidget } from "@/widgets/AdminSystemWidget";

export default function AdminSystemPage() {
  const [cb, setCb] = useState<CircuitBreakerState[] | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    getCircuitBreakers().then((result) => {
      if (result.isFailure) {
        setError((result.error as { message?: string })?.message);
      } else {
        setCb(result.data);
      }
    });
  }, []);

  return (
    <AdminSystemWidget
      initialCB={cb}
      initialReconcileInfo={null}
      initialError={error}
    />
  );
}
