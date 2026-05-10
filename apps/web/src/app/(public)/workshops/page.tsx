"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { listWorkshops } from "@/features/workshop-browsing/api/catalog.service";
import type { PaginatedResult } from "@/lib/api/client";
import type { ApiError } from "@/lib/api/errors";
import type { WorkshopListItem, WorkshopFilters } from "@/types/workshop";
import { WorkshopListWidget } from "@/widgets/WorkshopListWidget";

function WorkshopsContent() {
  const searchParams = useSearchParams();

  const filters = useMemo((): WorkshopFilters => {
    const f: WorkshopFilters = { limit: 20 };
    const day = searchParams.get("day");
    if (day) f.day = day;
    if (searchParams.get("hasSeats") === "true") f.hasSeats = true;
    const sort = searchParams.get("sort");
    if (sort) f.sort = sort;
    const q = searchParams.get("q");
    if (q) f.q = q;
    return f;
  }, [searchParams]);

  const [result, setResult] =
    useState<PaginatedResult<WorkshopListItem> | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    listWorkshops(filters).then((res) => {
      if (res.isFailure) {
        const err = res.error as ApiError;
        if (err.status !== 404) setError(err.message);
        return;
      }
      setResult(res.data);
    });
  }, [filters]);

  return (
    <WorkshopListWidget
      initialResult={result}
      initialError={error}
      filters={filters}
    />
  );
}

export default function WorkshopsPage() {
  return (
    <Suspense fallback={<div className="p-4">Đang tải...</div>}>
      <WorkshopsContent />
    </Suspense>
  );
}
