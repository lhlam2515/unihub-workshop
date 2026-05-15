import { notFound, redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import {
  getAdminWorkshopServer,
  getWorkshopStatsServer,
} from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopStatsWidget } from "@/widgets/AdminWorkshopStatsWidget";

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

export default async function AdminWorkshopStatsPage({ params }: PageProps) {
  const { workshopId } = await params;
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const [workshopResult, statsResult] = await Promise.all([
    getAdminWorkshopServer(workshopId, session.accessToken),
    getWorkshopStatsServer(workshopId, session.accessToken),
  ]);

  if (workshopResult.isFailure) notFound();

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget
        workshop={workshopResult.data}
        activeTab="stats"
      />
      <AdminWorkshopStatsWidget
        workshop={workshopResult.data}
        initialStats={statsResult.isSuccess ? statsResult.data : null}
        initialError={
          statsResult.isFailure ? String(statsResult.error) : undefined
        }
      />
    </div>
  );
}
