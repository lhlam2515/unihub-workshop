"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PageHeader } from "@/components/PageHeader";
import { PaginationControls } from "@/components/PaginationControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ROUTES from "@/constants/routes";
import { BulkActionBar } from "@/features/admin-workshop-management/components/BulkActionBar";
import { WorkshopAdminTable } from "@/features/admin-workshop-management/components/WorkshopAdminTable";
import type { PaginatedResult } from "@/lib/api/client";
import {
  cancelWorkshop,
  listAdminWorkshops,
  publishWorkshop,
} from "@/lib/api/services/admin";
import type {
  AdminWorkshopFilters,
  WorkshopAdmin,
  WorkshopStatus,
} from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminWorkshopListWidgetProps {
  filters: AdminWorkshopFilters;
}

const STATUS_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "DRAFT", label: "Bản nháp" },
  { value: "OPEN", label: "Đang mở" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "CANCELLED", label: "Đã hủy" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminWorkshopListWidget({
  filters,
}: AdminWorkshopListWidgetProps) {
  const router = useRouter();
  const requestIdRef = useRef(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [accumulated, setAccumulated] = useState<WorkshopAdmin[]>([]);
  const [pagination, setPagination] = useState<
    PaginatedResult<WorkshopAdmin>["pagination"] | null
  >(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.q ?? "");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  useEffect(() => {
    setSearchValue(filters.q ?? "");
  }, [filters.q]);

  useEffect(() => {
    let isActive = true;
    const requestId = ++requestIdRef.current;

    setIsInitialLoading(true);
    setInitialError(null);
    setLoadMoreError(null);
    setSelectedIds(new Set());
    setAccumulated([]);
    setPagination(null);

    void listAdminWorkshops(filters)
      .then((result) => {
        if (!isActive || requestId !== requestIdRef.current) {
          return;
        }

        if (result.isFailure) {
          setInitialError(
            (result.error as { message?: string })?.message ?? "Lỗi tải dữ liệu"
          );
          return;
        }

        setAccumulated(result.data.items);
        setPagination(result.data.pagination);
      })
      .finally(() => {
        if (isActive && requestId === requestIdRef.current) {
          setIsInitialLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [filters]);

  // ---- Handlers ----

  const applyFilter = useCallback(
    (patch: Partial<AdminWorkshopFilters>) => {
      const params = new URLSearchParams();
      const merged = { ...filters, ...patch, cursor: undefined };
      for (const [key, value] of Object.entries(merged)) {
        if (value !== undefined && value !== null && value !== "") {
          params.set(key, String(value));
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
        return;
      }

      setAccumulated((prev) => [...prev, ...result.data.items]);
      setPagination(result.data.pagination);
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

  const selectedWorkshops = accumulated.filter((workshop) =>
    selectedIds.has(workshop.id)
  );
  const selectedStatuses: WorkshopStatus[] = selectedWorkshops.map(
    (workshop) => workshop.status
  );

  // ---- Loading ----
  if (isInitialLoading) {
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
          <Button asChild>
            <Link href={ROUTES.ADMIN_WORKSHOP_NEW}>+ Tạo workshop</Link>
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filters.status ?? "all"}
          onValueChange={(value) =>
            applyFilter({
              status: value === "all" ? undefined : (value as WorkshopStatus),
            })
          }
        >
          <SelectTrigger className="h-10 w-48">
            <SelectValue placeholder="Tất cả trạng thái" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="h-10 w-44"
          value={filters.day ?? ""}
          onChange={(event) =>
            applyFilter({ day: event.target.value || undefined })
          }
        />

        <div className="relative max-w-xs flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Tìm kiếm..."
            className="h-10 pl-9"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyFilter({ q: searchValue || undefined });
              }
            }}
          />
          {searchValue && (
            <button
              type="button"
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
                nextCursor: pagination.nextCursor ?? null,
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
