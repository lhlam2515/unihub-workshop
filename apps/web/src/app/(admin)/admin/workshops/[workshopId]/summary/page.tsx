import { notFound, redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import {
  getAdminWorkshopServer,
  getWorkshopSummaryServer,
} from "@/lib/api/server-services/admin";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopSummaryWidget } from "@/widgets/AdminWorkshopSummaryWidget";
import ROUTES from "@/constants/routes";

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

export default async function AdminWorkshopSummaryPage({ params }: PageProps) {
  const { workshopId } = await params;
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const [workshopResult, summaryResult] = await Promise.all([
    getAdminWorkshopServer(workshopId, session.accessToken),
    getWorkshopSummaryServer(workshopId, session.accessToken),
  ]);

  if (workshopResult.isFailure) notFound();

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget
        workshop={workshopResult.data}
        activeTab="summary"
      />
      <AdminWorkshopSummaryWidget
        workshop={workshopResult.data}
        initialSummary={summaryResult.isSuccess ? summaryResult.data : null}
        initialError={
          summaryResult.isFailure ? String(summaryResult.error) : undefined
        }
      />
    </div>
  );
}
