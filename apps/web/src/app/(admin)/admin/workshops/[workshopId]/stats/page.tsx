import { notFound } from "next/navigation";

import { getAdminWorkshop, getWorkshopStats } from "@/lib/api/services/admin";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopStatsWidget } from "@/widgets/AdminWorkshopStatsWidget";

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

export default async function AdminWorkshopStatsPage({ params }: PageProps) {
  const { workshopId } = await params;

  const [workshopResult, statsResult] = await Promise.all([
    getAdminWorkshop(workshopId),
    getWorkshopStats(workshopId),
  ]);

  if (workshopResult.isFailure) {
    notFound();
  }

  const workshop = workshopResult.data;

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget workshop={workshop} activeTab="stats" />
      <AdminWorkshopStatsWidget
        workshop={workshop}
        initialStats={statsResult.isSuccess ? statsResult.data : null}
        initialError={
          statsResult.isFailure
            ? (statsResult.error as { message?: string })?.message
            : undefined
        }
      />
    </div>
  );
}
