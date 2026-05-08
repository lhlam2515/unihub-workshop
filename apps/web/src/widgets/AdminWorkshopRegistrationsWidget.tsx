"use client";

import { useCallback, useState } from "react";

import { ContentLoader } from "@/components/ContentLoader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PaginationControls } from "@/components/PaginationControls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkshopRegistrations } from "@/features/admin-registrations/api/admin-registrations.service";
import { ExportCSVButton } from "@/features/admin-registrations/components/ExportCSVButton";
import { RegistrationFilters } from "@/features/admin-registrations/components/RegistrationFilters";
import { RegistrationTable } from "@/features/admin-registrations/components/RegistrationTable";
import type { RegistrationFilters as Filters } from "@/features/admin-registrations/lib/types";
import type { PaginationMeta } from "@/lib/api/types";
import type { RegistrationAdmin } from "@/types/registration";
import type { WorkshopAdmin } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminWorkshopRegistrationsWidgetProps {
  workshop: WorkshopAdmin;
  initialRegistrations: RegistrationAdmin[];
  initialPagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminWorkshopRegistrationsWidget({
  workshop,
  initialRegistrations,
  initialPagination,
}: AdminWorkshopRegistrationsWidgetProps) {
  const [filters, setFilters] = useState<Filters>({});
  const [registrations, setRegistrations] =
    useState<RegistrationAdmin[]>(initialRegistrations);
  const [pagination, setPagination] =
    useState<PaginationMeta>(initialPagination);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Fetch helpers
  // -------------------------------------------------------------------------

  const fetchRegistrations = useCallback(
    async (currentFilters: Filters, cursor?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getWorkshopRegistrations(workshop.id, {
          ...currentFilters,
          cursor,
        });
        if (result.isFailure) {
          setError(
            (result.error as { message?: string })?.message ??
              "Không thể tải danh sách đăng ký"
          );
        } else {
          if (cursor) {
            // Append — load more
            setRegistrations((prev) => [...prev, ...result.data.items]);
          } else {
            // Replace — filter change
            setRegistrations(result.data.items);
          }
          setPagination(result.data.pagination);
        }
      } catch {
        setError("Lỗi kết nối");
      } finally {
        setIsLoading(false);
      }
    },
    [workshop.id]
  );

  const handleFilterChange = useCallback(
    (newFilters: Filters) => {
      setFilters(newFilters);
      fetchRegistrations(newFilters);
    },
    [fetchRegistrations]
  );

  const handleLoadMore = useCallback(() => {
    if (!pagination.nextCursor || isLoading) return;
    fetchRegistrations(filters, pagination.nextCursor);
  }, [filters, pagination.nextCursor, isLoading, fetchRegistrations]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh sách đăng ký</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters + CSV */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <RegistrationFilters
            filters={filters}
            onFilterChange={handleFilterChange}
          />
          <ExportCSVButton workshopId={workshop.id} />
        </div>

        {/* Error */}
        {error && <ErrorDisplay error={error} variant="inline" />}

        {/* Content */}
        {isLoading && registrations.length === 0 ? (
          <ContentLoader count={5} />
        ) : registrations.length === 0 ? (
          <EmptyState
            title="Không có đăng ký"
            description="Chưa có sinh viên nào đăng ký workshop này"
          />
        ) : (
          <>
            <RegistrationTable registrations={registrations} />
            <PaginationControls
              pagination={pagination}
              onLoadMore={handleLoadMore}
              isLoading={isLoading}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
