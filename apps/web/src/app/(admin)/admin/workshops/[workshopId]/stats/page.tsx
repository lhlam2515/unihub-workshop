"use client";

import dynamic from "next/dynamic";
import { useParams, notFound } from "next/navigation";

import { ContentLoader } from "@/components/ContentLoader";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { getAdminWorkshop, getWorkshopStats } from "@/lib/api/services/admin";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";

const AdminWorkshopStatsWidget = dynamic(
  () =>
    import("@/widgets/AdminWorkshopStatsWidget").then((mod) => ({
      default: mod.AdminWorkshopStatsWidget,
    })),
  {
    loading: () => <ContentLoader count={3} />,
    ssr: false,
  }
);

export default function AdminWorkshopStatsPage() {
  const { workshopId } = useParams<{ workshopId: string }>();

  const workshopQuery = useAsyncQuery(
    ["admin-workshop-stats", workshopId],
    () => getAdminWorkshop(workshopId)
  );
  const statsQuery = useAsyncQuery(
    ["admin-workshop-stats-data", workshopId],
    () => getWorkshopStats(workshopId)
  );

  if (workshopQuery.error) notFound();
  if (workshopQuery.isLoading) return <ContentLoader count={2} />;

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget
        workshop={workshopQuery.data!}
        activeTab="stats"
      />
      <AdminWorkshopStatsWidget
        workshop={workshopQuery.data!}
        initialStats={statsQuery.data ?? null}
        initialError={statsQuery.error?.message}
      />
    </div>
  );
}
