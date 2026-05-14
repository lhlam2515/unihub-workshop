"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { ContentLoader } from "@/components/ContentLoader";
import { listWorkshops } from "@/features/workshop-browsing/api/catalog.service";
import { isApiError } from "@/lib/api/errors";
import type { PaginationMeta } from "@/lib/api/types";
import type { WorkshopListItem, WorkshopFilters } from "@/types/workshop";
import { WorkshopListWidget } from "@/widgets/WorkshopListWidget";

function filtersToSearchParams(f: WorkshopFilters): string {
  const p = new URLSearchParams();
  if (f.day) p.set("day", f.day);
  if (f.hasSeats) p.set("hasSeats", "true");
  if (f.sort) p.set("sort", f.sort);
  if (f.q) p.set("q", f.q);
  return p.toString();
}

function WorkshopsContent() {
  const router = useRouter();
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

  const filterKey = JSON.stringify(filters);

  const [items, setItems] = useState<WorkshopListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Fetch on mount or filter change
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setItems([]);
      setPagination(null);
      setError(undefined);

      const result = await listWorkshops(filters);
      if (cancelled) return;

      if (result.isFailure) {
        const err = result.error;
        if (isApiError(err) && err.status !== 404) setError(err.message);
      } else {
        setItems(result.data.items);
        setPagination(result.data.pagination);
      }
      setLoading(false);
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate on filter change
  const handleFilterChange = useCallback(
    (newFilters: WorkshopFilters) => {
      const qs = filtersToSearchParams(newFilters);
      router.replace(qs ? `/workshops?${qs}` : "/workshops", { scroll: false });
    },
    [router]
  );

  // Load more
  const handleLoadMore = useCallback(async () => {
    if (!pagination?.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);

    const result = await listWorkshops({
      ...filters,
      cursor: pagination.nextCursor,
    });

    if (result.isFailure) {
      const err = result.error;
      setError(
        isApiError(err)
          ? (err.message ?? "Không thể tải thêm")
          : "Không thể tải thêm"
      );
    } else {
      setItems((prev) => [...prev, ...result.data.items]);
      setPagination(result.data.pagination);
    }
    setIsLoadingMore(false);
  }, [filters, pagination, isLoadingMore]);

  // Retry current filter
  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(undefined);
    listWorkshops(filters)
      .then((result) => {
        if (result.isFailure) {
          const err = result.error;
          if (isApiError(err) && err.status !== 404) setError(err.message);
        } else {
          setItems(result.data.items);
          setPagination(result.data.pagination);
        }
      })
      .catch(() => setError("Lỗi kết nối, vui lòng thử lại"))
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <WorkshopListWidget
      items={items}
      pagination={pagination}
      filters={filters}
      loading={loading}
      isLoadingMore={isLoadingMore}
      error={error}
      onFilterChange={handleFilterChange}
      onLoadMore={handleLoadMore}
      onRetry={handleRetry}
    />
  );
}

export default function WorkshopsPage() {
  return (
    <Suspense
      fallback={<ContentLoader count={6} layout="grid" className="p-4" />}
    >
      <WorkshopsContent />
    </Suspense>
  );
}
