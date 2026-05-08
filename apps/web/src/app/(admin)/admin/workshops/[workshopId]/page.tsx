import { notFound } from "next/navigation";

import {
  getAdminWorkshop,
  listSpeakers,
  listRooms,
} from "@/lib/api/services/admin";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

export default async function AdminWorkshopEditPage({ params }: PageProps) {
  const { workshopId } = await params;

  const [workshopResult, speakersResult, roomsResult] = await Promise.all([
    getAdminWorkshop(workshopId),
    listSpeakers(),
    listRooms(),
  ]);

  if (workshopResult.isFailure) {
    notFound();
  }

  const speakers = speakersResult.isSuccess ? speakersResult.data.items : [];
  const rooms = roomsResult.isSuccess ? roomsResult.data.items : [];

  return (
    <AdminWorkshopEditWidget
      workshop={workshopResult.data}
      speakers={speakers}
      rooms={rooms}
    />
  );
}
