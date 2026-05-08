"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import ROUTES from "@/constants/routes";
import { RoomForm } from "@/features/admin-room-management/components/RoomForm";
import { RoomScheduleCalendar } from "@/features/admin-room-management/components/RoomScheduleCalendar";
import type { WorkshopScheduleEntry } from "@/features/admin-room-management/components/RoomScheduleCalendar";
import { updateRoom } from "@/lib/api/services/admin";
import type { RoomAdmin } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminRoomEditWidgetProps {
  room: RoomAdmin;
  schedule: WorkshopScheduleEntry[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminRoomEditWidget({
  room,
  schedule,
}: AdminRoomEditWidgetProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const body = {
        name: data.name as string,
        building: (data.building as string) || undefined,
        floor:
          data.floor !== undefined && data.floor !== ""
            ? Number(data.floor)
            : undefined,
        capacity:
          data.capacity !== undefined ? Number(data.capacity) : undefined,
        floorPlanUrl: (data.floorPlanUrl as string) || undefined,
      };

      const result = await updateRoom(room.id, body);

      if (result.isFailure) {
        const err = result.error;
        setServerError(
          typeof err === "object" && err !== null && "message" in err
            ? String(err.message)
            : "Có lỗi xảy ra"
        );
        throw err;
      }

      router.push(ROUTES.ADMIN_ROOMS);
      router.refresh();
    } catch (err) {
      if (err instanceof Error || (typeof err === "object" && err !== null)) {
        throw err;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={room.name}
        description={
          room.building
            ? `${room.building}${room.floor != null ? `, Tầng ${room.floor}` : ""}`
            : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-lg font-semibold">Thông tin phòng</h2>
          <RoomForm
            mode="edit"
            defaultValues={{
              name: room.name,
              building: room.building ?? "",
              floor: room.floor ?? undefined,
              capacity: room.capacity,
              floorPlanUrl: room.floorPlanUrl ?? "",
            }}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverError={serverError}
          />
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold">Lịch sử dụng phòng</h2>
          <RoomScheduleCalendar workshops={schedule} />
        </div>
      </div>
    </div>
  );
}
