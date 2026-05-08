"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PageHeader } from "@/components/PageHeader";
import ROUTES from "@/constants/routes";
import { DeleteSpeakerDialog } from "@/features/admin-speaker-management/components/DeleteSpeakerDialog";
import { SpeakersTable } from "@/features/admin-speaker-management/components/SpeakersTable";
import { deleteSpeaker } from "@/lib/api/services/admin";
import type { SpeakerAdmin } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminSpeakerListWidgetProps {
  initialResult: SpeakerAdmin[] | null;
  initialError?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminSpeakerListWidget({
  initialResult,
  initialError,
}: AdminSpeakerListWidgetProps) {
  const router = useRouter();
  const [speakers, setSpeakers] = useState<SpeakerAdmin[]>(initialResult ?? []);
  const [deleteTarget, setDeleteTarget] = useState<SpeakerAdmin | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isFirstLoad = !initialResult && !initialError;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteSpeaker(deleteTarget.id);
      if (result.isFailure) {
        const err = result.error;
        setDeleteError(
          typeof err === "object" && err !== null && "message" in err
            ? String(err.message)
            : "Có lỗi xảy ra"
        );
      } else {
        setSpeakers((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        setDeleteTarget(null);
        router.refresh();
      }
    } catch {
      setDeleteError("Lỗi kết nối");
    } finally {
      setIsDeleting(false);
    }
  };

  // ---- Loading ----
  if (isFirstLoad) {
    return (
      <div className="space-y-4">
        <PageHeader title="Quản lý diễn giả" />
        <SpeakersTable speakers={[]} onDelete={() => {}} skeleton />
      </div>
    );
  }

  // ---- Error ----
  if (initialError && speakers.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Quản lý diễn giả" />
        <ErrorDisplay error={initialError} variant="banner" />
      </div>
    );
  }

  // ---- Success ----
  return (
    <div className="space-y-4">
      <PageHeader
        title="Quản lý diễn giả"
        action={
          <a
            href={ROUTES.ADMIN_SPEAKER_NEW}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Tạo diễn giả
          </a>
        }
      />

      {speakers.length === 0 ? (
        <EmptyState
          title="Chưa có diễn giả nào"
          description="Tạo diễn giả đầu tiên để bắt đầu"
        />
      ) : (
        <SpeakersTable
          speakers={speakers}
          onDelete={(s) => setDeleteTarget(s)}
        />
      )}

      <DeleteSpeakerDialog
        speaker={deleteTarget}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        error={deleteError}
      />
    </div>
  );
}
