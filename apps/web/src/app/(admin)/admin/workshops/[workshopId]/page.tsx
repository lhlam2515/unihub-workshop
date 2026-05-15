import { notFound, redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import {
  getAdminWorkshopServer,
  listRoomsServer,
  listSpeakersServer,
} from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopFormWidget } from "@/widgets/AdminWorkshopFormWidget";

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

export default async function AdminWorkshopDetailPage({ params }: PageProps) {
  const { workshopId } = await params;
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const result = await getAdminWorkshopServer(workshopId, session.accessToken);
  if (result.isFailure) notFound();

  // Fetch speakers and rooms in parallel — degrade gracefully on failure
  // (matching the current client behavior of defaulting to [])
  const [speakersResult, roomsResult] = await Promise.all([
    listSpeakersServer(session.accessToken),
    listRoomsServer(session.accessToken),
  ]);

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget workshop={result.data} />
      <AdminWorkshopFormWidget
        mode="edit"
        initialData={result.data}
        speakers={speakersResult.isSuccess ? speakersResult.data : []}
        rooms={roomsResult.isSuccess ? roomsResult.data : []}
      />
    </div>
  );
}
