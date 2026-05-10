"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
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
import type { RegistrationListItem } from "@/types/registration";

interface RegistrationListWidgetProps {
  registrations: RegistrationListItem[];
  filter: { status?: string; upcoming?: boolean };
  onFilterChange: (filter: { status?: string; upcoming?: boolean }) => void;
  loading: boolean;
  error: string | null;
}

export function RegistrationListWidget({
  registrations,
  filter,
  onFilterChange,
  loading,
  error,
}: RegistrationListWidgetProps) {
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = useState<RegistrationListItem | null>(
    null
  );

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const result = await cancelRegistration(cancelTarget.id);
    if (result.isSuccess) {
      // Note: parent page will re-fetch to get fresh state
      onFilterChange(filter);
    }
    setCancelTarget(null);
  };

  return (
    <div className="space-y-4">
      <StatusFilterChips activeFilter={filter} onChange={onFilterChange} />

      {error && <ErrorDisplay error={error} variant="banner" />}

      {loading ? (
        <ContentLoader count={3} />
      ) : registrations.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Chưa có đăng ký nào"
          description="Khám phá các workshop và đăng ký tham gia"
          action={
            <Link
              href={ROUTES.WORKSHOPS}
              className="bg-primary text-primary-foreground inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium"
            >
              Khám phá workshop
            </Link>
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
        registration={cancelTarget}
        onConfirm={handleCancel}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
}
