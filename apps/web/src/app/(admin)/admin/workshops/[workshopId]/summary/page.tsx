"use client";

import dynamic from "next/dynamic";
import { useParams, notFound } from "next/navigation";

import { ContentLoader } from "@/components/ContentLoader";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { getAdminWorkshop, getAiSummary } from "@/lib/api/services/admin";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";

const AdminWorkshopSummaryWidget = dynamic(
  () =>
    import("@/widgets/AdminWorkshopSummaryWidget").then((mod) => ({
      default: mod.AdminWorkshopSummaryWidget,
    })),
  {
    loading: () => <ContentLoader count={2} />,
    ssr: false,
  }
);

export default function AdminWorkshopSummaryPage() {
  const { workshopId } = useParams<{ workshopId: string }>();

  const workshopQuery = useAsyncQuery(
    ["admin-workshop-summary", workshopId],
    () => getAdminWorkshop(workshopId)
  );
  const summaryQuery = useAsyncQuery(
    ["admin-workshop-summary-ai", workshopId],
    () => getAiSummary(workshopId)
  );

  if (workshopQuery.error) notFound();
  if (workshopQuery.isLoading) return <ContentLoader count={2} />;

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget
        workshop={workshopQuery.data!}
        activeTab="summary"
      />
      <AdminWorkshopSummaryWidget
        workshop={workshopQuery.data!}
        initialSummary={summaryQuery.data ?? null}
        initialError={summaryQuery.error?.message}
      />
    </div>
  );
}
