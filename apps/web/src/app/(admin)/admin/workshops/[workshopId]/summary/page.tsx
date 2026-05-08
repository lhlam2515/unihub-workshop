import { notFound } from "next/navigation";

import { getAdminWorkshop, getAiSummary } from "@/lib/api/services/admin";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopSummaryWidget } from "@/widgets/AdminWorkshopSummaryWidget";

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

export default async function AdminWorkshopSummaryPage({ params }: PageProps) {
  const { workshopId } = await params;

  const [workshopResult, summaryResult] = await Promise.all([
    getAdminWorkshop(workshopId),
    getAiSummary(workshopId),
  ]);

  if (workshopResult.isFailure) {
    notFound();
  }

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
          summaryResult.isFailure
            ? (summaryResult.error as { message?: string })?.message
            : undefined
        }
      />
    </div>
  );
}
