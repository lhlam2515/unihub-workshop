"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PageLoader } from "@/components/PageLoader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { CancelWorkshopDialog } from "@/features/admin-workshop-management/components/CancelWorkshopDialog";
import {
  WorkshopEditTabs,
  type AdminEditTab,
} from "@/features/admin-workshop-management/components/WorkshopEditTabs";
import { publishWorkshop, cancelWorkshop } from "@/lib/api/services/admin";
import type { WorkshopAdmin } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminWorkshopEditWidgetProps {
  workshop: WorkshopAdmin;
  activeTab?: AdminEditTab;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminWorkshopEditWidget({
  workshop,
  activeTab,
}: AdminWorkshopEditWidgetProps) {
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const handlePublish = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const result = await publishWorkshop(workshop.id, workshop.version);
      if (result.isFailure) {
        setActionError(
          (result.error as { message?: string })?.message ??
            "Không thể công bố workshop"
        );
        return;
      }
      router.refresh();
    } catch {
      setActionError("Lỗi kết nối");
    } finally {
      setActionLoading(false);
    }
  }, [workshop.id, workshop.version, router]);

  const handleCancel = useCallback(
    async (reason: string, notifyRegistered: boolean) => {
      setActionLoading(true);
      setActionError(null);
      try {
        const result = await cancelWorkshop(
          workshop.id,
          { reason, notifyRegistered },
          workshop.version
        );
        if (result.isFailure) {
          setActionError(
            (result.error as { message?: string })?.message ??
              "Không thể hủy workshop"
          );
          return;
        }
        setShowCancelDialog(false);
        router.refresh();
      } catch {
        setActionError("Lỗi kết nối");
      } finally {
        setActionLoading(false);
      }
    },
    [workshop.id, workshop.version, router]
  );

  if (!workshop) {
    return <PageLoader />;
  }

  const isDraft = workshop.status === "DRAFT";
  const isOpenOrClosed =
    workshop.status === "OPEN" || workshop.status === "COMPLETED";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {workshop.title}
            </h1>
            <StatusBadge status={workshop.status} variant="workshop" />
          </div>
          <p className="text-sm text-slate-500">
            v{workshop.version} &middot; Cập nhật:{" "}
            {formatDateTime(workshop.updatedAt)}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {isDraft && (
          <Button
            variant="default"
            onClick={handlePublish}
            disabled={actionLoading}
          >
            {actionLoading ? "Đang xử lý..." : "Công bố workshop"}
          </Button>
        )}

        {isOpenOrClosed && (
          <Button
            variant="destructive"
            onClick={() => setShowCancelDialog(true)}
            disabled={actionLoading}
          >
            {actionLoading ? "Đang xử lý..." : "Hủy workshop"}
          </Button>
        )}
      </div>

      {actionError && <ErrorDisplay error={actionError} variant="inline" />}

      {/* Sub-route tabs */}
      <WorkshopEditTabs
        workshopId={workshop.id}
        activeTab={activeTab ?? "edit"}
      />

      {/* Cancel dialog */}
      <CancelWorkshopDialog
        open={showCancelDialog}
        onConfirm={handleCancel}
        onClose={() => setShowCancelDialog(false)}
      />
    </div>
  );
}
