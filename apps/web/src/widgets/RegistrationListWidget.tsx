"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import ROUTES from "@/constants/routes";
import { cancelRegistration } from "@/features/registration-management/api/registration.service";
import { CancelConfirmDialog } from "@/features/registration-management/components/CancelConfirmDialog";
import { RegistrationCard } from "@/features/registration-management/components/RegistrationCard";
import { StatusFilterChips } from "@/features/registration-management/components/StatusFilterChips";
import type { RegistrationListItem } from "@/types/registration";

interface RegistrationListWidgetProps {
  registrations: RegistrationListItem[];
}

export function RegistrationListWidget({
  registrations,
}: RegistrationListWidgetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cancelTarget, setCancelTarget] = useState<RegistrationListItem | null>(
    null
  );

  const activeFilter = {
    status: searchParams.get("status") ?? undefined,
    upcoming: searchParams.get("upcoming") === "true",
  };

  const handleFilterChange = (newFilter: {
    status?: string;
    upcoming?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (newFilter.status) params.set("status", newFilter.status);
    if (newFilter.upcoming) params.set("upcoming", "true");
    router.push(`${ROUTES.ME_REGISTRATIONS}?${params.toString()}`);
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const result = await cancelRegistration(cancelTarget.id);
    if (result.isSuccess) {
      // Refresh the page to re-fetch registrations from the server
      router.refresh();
    }
    setCancelTarget(null);
  };

  return (
    <div className="space-y-4">
      <StatusFilterChips
        activeFilter={activeFilter}
        onChange={handleFilterChange}
      />

      {registrations.length === 0 ? (
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
