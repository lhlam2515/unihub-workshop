"use client";

import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ContentLoader } from "@/components/ContentLoader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import ROUTES from "@/constants/routes";
import { cancelRegistration } from "@/features/registration-management/api/registration.service";
import { CancelConfirmDialog } from "@/features/registration-management/components/CancelConfirmDialog";
import { RegistrationCard } from "@/features/registration-management/components/RegistrationCard";
import { StatusFilterChips } from "@/features/registration-management/components/StatusFilterChips";
import type { PaginatedResult } from "@/lib/api/client";
import type { ApiError } from "@/lib/api/errors";
import type { RegistrationListItem } from "@/types/registration";

interface RegistrationListWidgetProps {
  initialResult: PaginatedResult<RegistrationListItem> | null;
  initialError?: string;
}

export function RegistrationListWidget({
  initialResult,
  initialError,
}: RegistrationListWidgetProps) {
  const router = useRouter();
  const [registrations, setRegistrations] = useState<RegistrationListItem[]>(
    initialResult?.items ?? []
  );
  const [filter, setFilter] = useState<{ status?: string; upcoming?: boolean }>(
    {}
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [cancelTarget, setCancelTarget] = useState<RegistrationListItem | null>(
    null
  );

  const handleFilterChange = async (newFilter: {
    status?: string;
    upcoming?: boolean;
  }) => {
    setFilter(newFilter);
    setLoading(true);
    setError(null);

    const { listMyRegistrations } =
      await import("@/features/registration-management/api/registration.service");
    const params: Record<string, string | boolean | number> = {};
    if (newFilter.status) params.status = newFilter.status;
    if (newFilter.upcoming) params.upcoming = true;

    const result = await listMyRegistrations(params);
    if (result.isSuccess) {
      setRegistrations(result.data.items);
    } else {
      setError(
        (result.error as ApiError)?.message ?? "Không thể tải danh sách"
      );
    }
    setLoading(false);
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const result = await cancelRegistration(cancelTarget.id);
    if (result.isSuccess) {
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === cancelTarget.id ? { ...r, status: "CANCELLED" as const } : r
        )
      );
    }
    setCancelTarget(null);
  };

  return (
    <div className="space-y-4">
      <StatusFilterChips activeFilter={filter} onChange={handleFilterChange} />

      {error && <ErrorDisplay error={error} variant="banner" />}

      {loading ? (
        <ContentLoader count={3} />
      ) : registrations.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Chưa có đăng ký nào"
          description="Khám phá các workshop và đăng ký tham gia"
          action={
            <a
              href={ROUTES.WORKSHOPS}
              className="bg-primary text-primary-foreground inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium"
            >
              Khám phá workshop
            </a>
          }
        />
      ) : (
        <div className="space-y-3">
          {registrations.map((r) => (
            <RegistrationCard
              key={r.id}
              registration={r}
              onClick={() => router.push(ROUTES.ME_REGISTRATION(r.id))}
              onCancel={() => setCancelTarget(r)}
              onPay={() => router.push(ROUTES.ME_REGISTRATION_PAY(r.id))}
            />
          ))}
        </div>
      )}

      <CancelConfirmDialog
        open={!!cancelTarget}
        registration={cancelTarget!}
        onConfirm={handleCancel}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
}
