"use client";

import { CalendarFold } from "lucide-react";
import { useRouter } from "next/navigation";

import { WorkshopCard } from "@/components/cards/WorkshopCard";
import { ContentLoader } from "@/components/ContentLoader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PaginationControls } from "@/components/PaginationControls";
import ROUTES from "@/constants/routes";
import { FilterBar } from "@/features/workshop-browsing/components/FilterBar";
import type { PaginationMeta } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import type { WorkshopListItem, WorkshopFilters } from "@/types/workshop";

interface WorkshopListWidgetProps {
  items: WorkshopListItem[];
  pagination: PaginationMeta | null;
  filters: WorkshopFilters;
  loading: boolean;
  isLoadingMore: boolean;
  error?: string;
  onFilterChange: (filters: WorkshopFilters) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

/**
 * Workshop listing widget — pure presentation.
 *
 * Receives all data + callbacks from parent. Never fetches data directly.
 */
export function WorkshopListWidget({
  items,
  pagination,
  filters,
  loading,
  isLoadingMore,
  error,
  onFilterChange,
  onLoadMore,
  onRetry,
}: WorkshopListWidgetProps) {
  const router = useRouter();

  // ---- Render: states ----

  // Loading — initial fetch
  if (loading && items.length === 0) {
    return (
      <div className="space-y-6">
        <FilterBar filters={filters} onChange={onFilterChange} />
        <ContentLoader layout="grid" count={3} />
      </div>
    );
  }

  // Error — no data to show
  if (error && items.length === 0) {
    return (
      <div className="space-y-6">
        <FilterBar filters={filters} onChange={onFilterChange} />
        <ErrorDisplay error={error} variant="banner" />
        <button
          type="button"
          onClick={onRetry}
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
        <FilterBar filters={filters} onChange={onFilterChange} />
        <EmptyState
          icon={CalendarFold}
          title="Không tìm thấy workshop"
          description={
            filters.q || filters.day || filters.hasSeats
              ? "Thử thay đổi bộ lọc để tìm kết quả phù hợp hơn."
              : "Hiện tại chưa có workshop nào. Vui lòng quay lại sau."
          }
          action={
            filters.q || filters.day || filters.hasSeats ? (
              <button
                type="button"
                onClick={() => onFilterChange({})}
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
      <FilterBar filters={filters} onChange={onFilterChange} />

      {error ? <ErrorDisplay error={error} variant="banner" /> : null}

      {loading && (
        <div className="flex justify-center py-4">
          <ContentLoader layout="grid" count={3} />
        </div>
      )}

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
          onLoadMore={onLoadMore}
          isLoading={isLoadingMore}
        />
      )}
    </div>
  );
}
