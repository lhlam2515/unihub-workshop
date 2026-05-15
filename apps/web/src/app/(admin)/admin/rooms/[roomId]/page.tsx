import { notFound, redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import type { WorkshopScheduleEntry } from "@/features/admin-room-management/components/RoomScheduleCalendar";
import {
  getRoomServer,
  listAdminWorkshopsServer,
} from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminRoomEditWidget } from "@/widgets/AdminRoomEditWidget";

interface PageProps {
  params: Promise<{ roomId: string }>;
}

export default async function AdminRoomEditPage({ params }: PageProps) {
  const { roomId } = await params;
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const [roomResult, workshopsResult] = await Promise.all([
    getRoomServer(roomId, session.accessToken),
    listAdminWorkshopsServer({ q: roomId }, session.accessToken),
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
