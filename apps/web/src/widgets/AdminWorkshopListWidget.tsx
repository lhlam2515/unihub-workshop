"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PageHeader } from "@/components/PageHeader";
import { PaginationControls } from "@/components/PaginationControls";
import { Input } from "@/components/ui/input";
import ROUTES from "@/constants/routes";
import { BulkActionBar } from "@/features/admin-workshop-management/components/BulkActionBar";
import { WorkshopAdminTable } from "@/features/admin-workshop-management/components/WorkshopAdminTable";
import type { PaginatedResult } from "@/lib/api/client";
import {
  cancelWorkshop,
  publishWorkshop,
  listAdminWorkshops,
} from "@/lib/api/services/admin";
import type {
  WorkshopAdmin,
  AdminWorkshopFilters,
  WorkshopStatus,
} from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminWorkshopListWidgetProps {
  initialResult: PaginatedResult<WorkshopAdmin> | null;
  initialError?: string;
  filters: AdminWorkshopFilters;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminWorkshopListWidget({
  initialResult,
  initialError,
  filters,
}: AdminWorkshopListWidgetProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [accumulated, setAccumulated] = useState<WorkshopAdmin[]>(
    initialResult?.items ?? []
  );
  const [pagination, setPagination] = useState(
    initialResult?.pagination ?? null
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.q ?? "");

  // Sync accumulated list when server re-renders with new filters
  const filterKey = JSON.stringify(filters);
  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (filterKey !== prevFilterKey.current) {
      prevFilterKey.current = filterKey;
      setAccumulated(initialResult?.items ?? []);
      setPagination(initialResult?.pagination ?? null);
      setSelectedIds(new Set());
    }
  }, [filterKey, initialResult]);

  // ---- Handlers ----

  const applyFilter = useCallback(
    (patch: Partial<AdminWorkshopFilters>) => {
      const params = new URLSearchParams();
      const merged = { ...filters, ...patch };
      for (const [k, v] of Object.entries(merged)) {
        if (v !== undefined && v !== null && v !== "") {
          params.set(k, String(v));
        }
      }
      const qs = params.toString();
      router.push(`${ROUTES.ADMIN_WORKSHOPS}${qs ? `?${qs}` : ""}`);
    },
    [filters, router]
  );

  const handleLoadMore = useCallback(async () => {
    if (!pagination?.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await listAdminWorkshops({
        ...filters,
        cursor: pagination.nextCursor,
      });
      if (result.isFailure) {
        setLoadMoreError(
          (result.error as { message?: string })?.message ?? "Lỗi tải thêm"
        );
      } else {
        setAccumulated((prev) => [...prev, ...result.data.items]);
        setPagination(result.data.pagination);
      }
    } catch {
      setLoadMoreError("Lỗi kết nối");
    } finally {
      setIsLoadingMore(false);
    }
  }, [filters, pagination, isLoadingMore]);

  const handleBulkPublish = useCallback(async () => {
    setBulkLoading(true);
    for (const id of selectedIds) {
      try {
        await publishWorkshop(id, 0);
      } catch {
        // Per-item failure handled by toast (future enhancement)
      }
    }
    setBulkLoading(false);
    setSelectedIds(new Set());
    router.refresh();
  }, [selectedIds, router]);

  const handleBulkCancel = useCallback(async () => {
    setBulkLoading(true);
    for (const id of selectedIds) {
      try {
        await cancelWorkshop(
          id,
          { reason: "Bulk cancel", notifyRegistered: true },
          0
        );
      } catch {
        // Per-item failure handled by toast (future enhancement)
      }
    }
    setBulkLoading(false);
    setSelectedIds(new Set());
    router.refresh();
  }, [selectedIds, router]);

  // ---- Derived state ----

  const selectedWorkshops = accumulated.filter((w) => selectedIds.has(w.id));
  const selectedStatuses: WorkshopStatus[] = selectedWorkshops.map(
    (w) => w.status
  );
  const isFirstLoad = !initialResult && !initialError;

  // ---- Loading ----
  if (isFirstLoad) {
    return (
      <div className="space-y-4">
        <PageHeader title="Quản lý workshop" />
        <WorkshopAdminTable
          workshops={[]}
          selectedIds={new Set()}
          onSelectionChange={() => {}}
          skeleton
        />
      </div>
    );
  }

  // ---- Error ----
  if (initialError && accumulated.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Quản lý workshop" />
        <ErrorDisplay error={initialError} variant="banner" />
      </div>
    );
  }

  // ---- Success ----
  return (
    <div className="space-y-4">
      <PageHeader
        title="Quản lý workshop"
        action={
          <a
            href={ROUTES.ADMIN_WORKSHOP_NEW}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Tạo workshop
          </a>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="border-input h-10 rounded-lg border bg-white px-3 text-sm shadow-xs"
          value={filters.status ?? ""}
          onChange={(e) =>
            applyFilter({
              status: (e.target.value as WorkshopStatus) || undefined,
            })
          }
        >
          <option value="">Tất cả trạng thái</option>
          <option value="DRAFT">Bản nháp</option>
          <option value="OPEN">Đang mở</option>
          <option value="COMPLETED">Hoàn thành</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>

        <Input
          type="date"
          className="h-10 w-44"
          value={filters.day ?? ""}
          onChange={(e) => applyFilter({ day: e.target.value || undefined })}
        />

        <div className="relative max-w-xs flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Tìm kiếm..."
            className="h-10 pl-9"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                applyFilter({ q: searchValue || undefined });
              }
            }}
          />
          {searchValue && (
            <button
              className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => {
                setSearchValue("");
                applyFilter({ q: undefined });
              }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        selectedIds={selectedIds}
        selectedStatuses={selectedStatuses}
        onPublish={handleBulkPublish}
        onCancel={handleBulkCancel}
        isLoading={bulkLoading}
      />

      {/* Table */}
      {accumulated.length === 0 ? (
        <EmptyState
          title="Không tìm thấy workshop"
          description="Thử thay đổi bộ lọc hoặc tạo workshop mới"
        />
      ) : (
        <>
          <WorkshopAdminTable
            workshops={accumulated}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />

          {pagination && (
            <PaginationControls
              pagination={{
                hasMore: pagination.hasMore,
                limit: pagination.limit,
                nextCursor: pagination.nextCursor,
                total: pagination.total ?? accumulated.length,
              }}
              onLoadMore={handleLoadMore}
              isLoading={isLoadingMore}
            />
          )}
        </>
      )}

      {loadMoreError && <ErrorDisplay error={loadMoreError} variant="inline" />}
    </div>
  );
}
