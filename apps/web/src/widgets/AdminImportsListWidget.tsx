"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PageHeader } from "@/components/PageHeader";
import { PaginationControls } from "@/components/PaginationControls";
import ROUTES from "@/constants/routes";
import { ImportsTable } from "@/features/admin-imports/components/ImportsTable";
import { TriggerImportDialog } from "@/features/admin-imports/components/TriggerImportDialog";
import type { PaginatedResult } from "@/lib/api/client";
import { listImports } from "@/lib/api/services/admin";
import type { ImportLog } from "@/types/admin-operations";

export interface AdminImportsListWidgetProps {
  initialResult: PaginatedResult<ImportLog> | null;
  initialError?: string;
}

export function AdminImportsListWidget({
  initialResult,
  initialError,
}: AdminImportsListWidgetProps) {
  const router = useRouter();
  const [items, setItems] = useState<ImportLog[]>(initialResult?.items ?? []);
  const [pagination, setPagination] = useState(
    initialResult?.pagination ?? null
  );
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const isFirstLoad = !initialResult && !initialError;
  const hasRunningImport = items.some((i) => i.status === "IN_PROGRESS");

  const handleRowClick = useCallback(
    (row: ImportLog) => {
      router.push(ROUTES.ADMIN_IMPORT(row.id));
    },
    [router]
  );

  const handleLoadMore = useCallback(async () => {
    if (!pagination?.nextCursor) return;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    const result = await listImports({ cursor: pagination.nextCursor });
    setIsLoadingMore(false);
    if (result.isFailure) {
      const msg =
        (result.error as { message?: string })?.message ??
        "Lỗi tải thêm dữ liệu.";
      setLoadMoreError(msg);
      return;
    }
    setItems((prev) => [...prev, ...result.data.items]);
    setPagination(result.data.pagination);
  }, [pagination]);

  // ---- Loading ----
  if (isFirstLoad) {
    return (
      <div className="space-y-4">
        <PageHeader title="Lịch sử Import" />
        <ImportsTable imports={[]} onRowClick={() => {}} isLoading />
      </div>
    );
  }

  // ---- Error ----
  if (initialError && items.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Lịch sử Import" />
        <ErrorDisplay error={initialError} variant="banner" />
      </div>
    );
  }

  // ---- Success ----
  return (
    <div className="space-y-4">
      <PageHeader
        title="Lịch sử Import"
        description="Danh sách các lần đồng bộ dữ liệu sinh viên từ CSV"
        action={
          <TriggerImportDialog
            hasRunningImport={hasRunningImport}
            onSuccess={() => router.refresh()}
            onError={(msg) => setLoadMoreError(msg)}
          />
        }
      />

      <ImportsTable imports={items} onRowClick={handleRowClick} />

      {loadMoreError && <ErrorDisplay error={loadMoreError} variant="inline" />}

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
