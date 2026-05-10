"use client";

import { useParams, notFound } from "next/navigation";

import { ContentLoader } from "@/components/ContentLoader";
import type { WorkshopScheduleEntry } from "@/features/admin-room-management/components/RoomScheduleCalendar";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { getRoom, listAdminWorkshops } from "@/lib/api/services/admin";
import { AdminRoomEditWidget } from "@/widgets/AdminRoomEditWidget";

export default function AdminRoomEditPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const roomQuery = useAsyncQuery(["admin-room", roomId], () =>
    getRoom(roomId)
  );
  const workshopsQuery = useAsyncQuery(["admin-room-schedule", roomId], () =>
    listAdminWorkshops({ q: roomId })
  );

  if (roomQuery.error) notFound();
  if (roomQuery.isLoading) return <ContentLoader count={2} />;

  const schedule: WorkshopScheduleEntry[] =
    workshopsQuery.data?.items.map((w) => ({
      id: w.id,
      title: w.title,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      status: w.status,
    })) ?? [];

  return <AdminRoomEditWidget room={roomQuery.data!} schedule={schedule} />;
}
