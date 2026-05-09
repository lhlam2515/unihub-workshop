"use client";

import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";

import type { WorkshopScheduleEntry } from "@/features/admin-room-management/components/RoomScheduleCalendar";
import { getRoom, listAdminWorkshops } from "@/lib/api/services/admin";
import type { RoomAdmin } from "@/types/workshop";
import { AdminRoomEditWidget } from "@/widgets/AdminRoomEditWidget";

export default function AdminRoomEditPage() {
  const params = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<RoomAdmin | null>(null);
  const [schedule, setSchedule] = useState<WorkshopScheduleEntry[]>([]);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    Promise.all([
      getRoom(params.roomId),
      listAdminWorkshops({ q: params.roomId }),
    ]).then(([roomResult, workshopsResult]) => {
      if (roomResult.isFailure) {
        setNotFoundState(true);
        return;
      }
      setRoom(roomResult.data);

      if (workshopsResult.isSuccess) {
        const items: WorkshopScheduleEntry[] = workshopsResult.data.items.map(
          (w) => ({
            id: w.id,
            title: w.title,
            startsAt: w.startsAt,
            endsAt: w.endsAt,
            status: w.status,
          })
        );
        setSchedule(items);
      }
    });
  }, [params.roomId]);

  if (notFoundState) notFound();
  if (!room) return null;

  return <AdminRoomEditWidget room={room} schedule={schedule} />;
}
