"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";

import type { PaginatedResult } from "@/lib/api/client";
import { listImports } from "@/lib/api/services/admin";
import type { ImportLog } from "@/types/admin-operations";
import { AdminImportsListWidget } from "@/widgets/AdminImportsListWidget";

function ImportsContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<PaginatedResult<ImportLog> | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const filters = useMemo(
    () => ({
      status: searchParams.get("status") || undefined,
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : undefined,
    }),
    [searchParams]
  );

  useEffect(() => {
    listImports(filters).then((result) => {
      if (result.isFailure) {
        setError((result.error as { message?: string })?.message);
      } else {
        setData(result.data);
      }
    });
  }, [filters]);

  return <AdminImportsListWidget initialResult={data} initialError={error} />;
}

export default function ImportsPage() {
  return (
    <Suspense fallback={<div className="p-4">Đang tải...</div>}>
      <ImportsContent />
    </Suspense>
  );
}
