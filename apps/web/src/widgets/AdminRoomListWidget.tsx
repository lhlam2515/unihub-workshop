"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PageHeader } from "@/components/PageHeader";
import { CreateRoomDialog } from "@/features/admin-room-management/components/CreateRoomDialog";
import { RoomsTable } from "@/features/admin-room-management/components/RoomsTable";
import type { RoomAdmin } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminRoomListWidgetProps {
  initialResult: RoomAdmin[] | null;
  initialError?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminRoomListWidget({
  initialResult,
  initialError,
}: AdminRoomListWidgetProps) {
  const router = useRouter();
  const rooms = initialResult ?? [];
  const [showCreate, setShowCreate] = useState(false);

  const isFirstLoad = !initialResult && !initialError;

  const handleCreated = () => {
    router.refresh();
  };

  // ---- Loading ----
  if (isFirstLoad) {
    return (
      <div className="space-y-4">
        <PageHeader title="Quản lý phòng" />
        <RoomsTable rooms={[]} skeleton />
      </div>
    );
  }

  // ---- Error ----
  if (initialError && rooms.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Quản lý phòng" />
        <ErrorDisplay error={initialError} variant="banner" />
      </div>
    );
  }

  // ---- Success ----
  return (
    <div className="space-y-4">
      <PageHeader
        title="Quản lý phòng"
        action={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Tạo phòng
          </button>
        }
      />

      {rooms.length === 0 ? (
        <EmptyState
          title="Chưa có phòng nào"
          description="Tạo phòng đầu tiên để bắt đầu"
        />
      ) : (
        <RoomsTable rooms={rooms} />
      )}

      <CreateRoomDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
