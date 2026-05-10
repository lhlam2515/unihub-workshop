"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useAsyncQuery } from "@/hooks/use-async-query";
import { listImports } from "@/lib/api/services/admin";
import { AdminImportsListWidget } from "@/widgets/AdminImportsListWidget";

function ImportsContent() {
  const searchParams = useSearchParams();

  const filters = {
    status: searchParams.get("status") || undefined,
    cursor: searchParams.get("cursor") || undefined,
    limit: searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : undefined,
  };

  const searchParamsKey = searchParams.toString();
  const { data, error } = useAsyncQuery(
    ["admin-imports", searchParamsKey],
    () => listImports(filters)
  );

  return (
    <AdminImportsListWidget
      initialResult={data ?? null}
      initialError={error?.message}
    />
  );
}

export default function ImportsPage() {
  return (
    <Suspense fallback={<div className="p-4">Đang tải...</div>}>
      <ImportsContent />
    </Suspense>
  );
}
