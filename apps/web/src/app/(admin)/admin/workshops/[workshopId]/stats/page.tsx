"use client";

import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";

import { getAdminWorkshop, getWorkshopStats } from "@/lib/api/services/admin";
import type { WorkshopAdmin, WorkshopStats } from "@/types/workshop";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopStatsWidget } from "@/widgets/AdminWorkshopStatsWidget";

export default function AdminWorkshopStatsPage() {
  const params = useParams<{ workshopId: string }>();
  const [workshop, setWorkshop] = useState<WorkshopAdmin | null>(null);
  const [stats, setStats] = useState<WorkshopStats | null>(null);
  const [statsError, setStatsError] = useState<string | undefined>(undefined);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    Promise.all([
      getAdminWorkshop(params.workshopId),
      getWorkshopStats(params.workshopId),
    ]).then(([workshopResult, statsResult]) => {
      if (workshopResult.isFailure) {
        setNotFoundState(true);
        return;
      }
      setWorkshop(workshopResult.data);

      if (statsResult.isSuccess) {
        setStats(statsResult.data);
      } else {
        setStatsError((statsResult.error as { message?: string })?.message);
      }
    });
  }, [params.workshopId]);

  if (notFoundState) notFound();
  if (!workshop) return null;

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget workshop={workshop} activeTab="stats" />
      <AdminWorkshopStatsWidget
        workshop={workshop}
        initialStats={stats}
        initialError={statsError}
      />
    </div>
  );
}
