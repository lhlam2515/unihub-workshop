"use client";

import { useAsyncQuery } from "@/hooks/use-async-query";
import { getCircuitBreakers } from "@/lib/api/services/admin";
import { AdminSystemWidget } from "@/widgets/AdminSystemWidget";

export default function AdminSystemPage() {
  const { data, error } = useAsyncQuery(["admin-circuit-breakers"], () =>
    getCircuitBreakers()
  );

  return (
    <AdminSystemWidget
      initialCB={data ?? null}
      initialReconcileInfo={null}
      initialError={error?.message}
    />
  );
}
