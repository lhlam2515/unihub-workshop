"use client";

import { CalendarFold } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { WorkshopCard } from "@/components/cards/WorkshopCard";
import { ContentLoader } from "@/components/ContentLoader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PaginationControls } from "@/components/PaginationControls";
import ROUTES from "@/constants/routes";
import { listWorkshops } from "@/features/workshop-browsing/api/catalog.service";
import { FilterBar } from "@/features/workshop-browsing/components/FilterBar";
import type { PaginatedResult } from "@/lib/api/client";
import type { ApiError } from "@/lib/api/errors";
import type { PaginationMeta } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import type { WorkshopListItem, WorkshopFilters } from "@/types/workshop";

interface WorkshopListWidgetProps {
  initialResult: PaginatedResult<WorkshopListItem> | null;
  initialError?: string;
  filters: WorkshopFilters;
}

function filtersToSearchParams(f: WorkshopFilters): string {
  const p = new URLSearchParams();
  if (f.day) p.set("day", f.day);
  if (f.hasSeats) p.set("hasSeats", "true");
  if (f.sort) p.set("sort", f.sort);
  if (f.search) p.set("search", f.search);
  return p.toString();
}

/**
 * Workshop listing widget.
 *
 * Receives initial data + current filters from the server page (RSC).
 * Filter changes update the URL — Next.js re-renders the page with fresh data.
 * "Load more" fetches client-side and appends to the accumulated list.
 */
export function WorkshopListWidget({
  initialResult,
  initialError,
  filters,
}: WorkshopListWidgetProps) {
  const router = useRouter();

  // Accumulated items — survives RSC re-renders (append on load-more)
  const [accumulated, setAccumulated] = useState<WorkshopListItem[]>(
    () => initialResult?.items ?? []
  );
  const [pagination, setPagination] = useState<PaginationMeta | null>(
    () => initialResult?.pagination ?? null
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Detect filter changes (new RSC render) — reset accumulated list
  const filterKey = JSON.stringify(filters);
  const prevKey = useRef(filterKey);
  useEffect(() => {
    if (prevKey.current !== filterKey) {
      prevKey.current = filterKey;
      setAccumulated(initialResult?.items ?? []);
      setPagination(initialResult?.pagination ?? null);
      setLoadMoreError(null);
    }
  }, [filterKey, initialResult]);

  // ---- Navigation helpers ----

  const navTo = useCallback(
    (newFilters: WorkshopFilters) => {
      const qs = filtersToSearchParams(newFilters);
      router.replace(qs ? `${ROUTES.WORKSHOPS}?${qs}` : ROUTES.WORKSHOPS, {
        scroll: false,
      });
    },
    [router]
  );

  // ---- Event handlers ----

  const handleFilterChange = useCallback(
    (newFilters: WorkshopFilters) => navTo(newFilters),
    [navTo]
  );

  const handleLoadMore = useCallback(async () => {
    if (!pagination?.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadMoreError(null);

    try {
      const result = await listWorkshops({
        ...filters,
        cursor: pagination.nextCursor,
      });
      if (result.isFailure) {
        setLoadMoreError(
          (result.error as ApiError).message ?? "Không thể tải thêm"
        );
        return;
      }
      setAccumulated((prev) => [...prev, ...result.data.items]);
      setPagination(result.data.pagination);
    } catch {
      setLoadMoreError("Không thể tải thêm dữ liệu");
    } finally {
      setIsLoadingMore(false);
    }
  }, [filters, pagination, isLoadingMore]);

  const handleRetry = useCallback(() => navTo(filters), [navTo, filters]);

  // ---- Helpers for down-stream components ----

  const error = initialError ?? loadMoreError;
  const items = accumulated;

  // ---- Render: states ----

  // No initial data (server fetch failed)
  if (initialError && items.length === 0) {
    return (
      <div className="space-y-6">
        <FilterBar filters={filters} onChange={handleFilterChange} />
        <ErrorDisplay error={initialError} variant="banner" />
        <button
          type="button"
          onClick={handleRetry}
          className="bg-background text-foreground hover:bg-accent hover:text-accent-foreground mx-auto inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium shadow-sm transition-colors"
        >
          Thử lại
        </button>
      </div>
    );
  }

  // Empty
  if (!isLoadingMore && items.length === 0) {
    return (
      <div className="space-y-6">
        <FilterBar filters={filters} onChange={handleFilterChange} />
        <EmptyState
          icon={CalendarFold}
          title="Không tìm thấy workshop"
          description={
            filters.search || filters.day || filters.hasSeats
              ? "Thử thay đổi bộ lọc để tìm kết quả phù hợp hơn."
              : "Hiện tại chưa có workshop nào. Vui lòng quay lại sau."
          }
          action={
            filters.search || filters.day || filters.hasSeats ? (
              <button
                type="button"
                onClick={() => handleFilterChange({})}
                className="text-primary text-sm underline underline-offset-2"
              >
                Xóa tất cả bộ lọc
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  // ---- Render: list ----
  return (
    <div className="space-y-6">
      <FilterBar filters={filters} onChange={handleFilterChange} />

      {error ? <ErrorDisplay error={error} variant="banner" /> : null}

      <div className={cn("grid gap-4", "sm:grid-cols-2 lg:grid-cols-3")}>
        {items.map((workshop) => (
          <WorkshopCard
            key={workshop.id}
            workshop={workshop}
            onClick={() => router.push(ROUTES.WORKSHOP(workshop.id))}
          />
        ))}
      </div>

      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <ContentLoader layout="grid" count={3} />
        </div>
      )}

      {pagination && (
        <PaginationControls
          pagination={pagination}
          onLoadMore={handleLoadMore}
          isLoading={isLoadingMore}
        />
      )}
    </div>
  );
}
