import { notFound } from "next/navigation";

import type { WorkshopScheduleEntry } from "@/features/admin-room-management/components/RoomScheduleCalendar";
import { getRoom, listAdminWorkshops } from "@/lib/api/services/admin";
import { AdminRoomEditWidget } from "@/widgets/AdminRoomEditWidget";

interface PageProps {
  params: Promise<{ roomId: string }>;
}

export default async function AdminRoomEditPage({ params }: PageProps) {
  const { roomId } = await params;

  const [roomResult, workshopsResult] = await Promise.all([
    getRoom(roomId),
    listAdminWorkshops({ q: roomId }), // TODO: use dedicated roomId filter when available
  ]);

  if (roomResult.isFailure) notFound();

  const schedule: WorkshopScheduleEntry[] = workshopsResult.isSuccess
    ? workshopsResult.data.items.map((w) => ({
        id: w.id,
        title: w.title,
        startsAt: w.startsAt,
        endsAt: w.endsAt,
        status: w.status,
      }))
    : [];

  return <AdminRoomEditWidget room={roomResult.data} schedule={schedule} />;
}
