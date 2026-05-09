"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

import type { AdminWorkshopFilters, WorkshopStatus } from "@/types/workshop";
import { AdminWorkshopListWidget } from "@/widgets/AdminWorkshopListWidget";

function AdminWorkshopListContent() {
  const searchParams = useSearchParams();

  const searchParamsKey = searchParams.toString();

  const filters: AdminWorkshopFilters = useMemo(
    () => ({
      status: (searchParams.get("status") as WorkshopStatus) || undefined,
      day: searchParams.get("day") || undefined,
      q: searchParams.get("q") || undefined,
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : undefined,
    }),
    [searchParams]
  );

  return <AdminWorkshopListWidget key={searchParamsKey} filters={filters} />;
}

export default function AdminWorkshopListPage() {
  return (
    <Suspense fallback={<div className="p-4">Đang tải...</div>}>
      <AdminWorkshopListContent />
    </Suspense>
  );
}
