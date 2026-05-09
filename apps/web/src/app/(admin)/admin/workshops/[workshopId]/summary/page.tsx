"use client";

import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";

import { getAdminWorkshop, getAiSummary } from "@/lib/api/services/admin";
import type { WorkshopAdmin } from "@/types/workshop";
import type { AiSummary } from "@/types/workshop";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopSummaryWidget } from "@/widgets/AdminWorkshopSummaryWidget";

export default function AdminWorkshopSummaryPage() {
  const params = useParams<{ workshopId: string }>();
  const [workshop, setWorkshop] = useState<WorkshopAdmin | null>(null);
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | undefined>(
    undefined
  );
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    Promise.all([
      getAdminWorkshop(params.workshopId),
      getAiSummary(params.workshopId),
    ]).then(([workshopResult, summaryResult]) => {
      if (workshopResult.isFailure) {
        setNotFoundState(true);
        return;
      }
      setWorkshop(workshopResult.data);

      if (summaryResult.isSuccess) {
        setSummary(summaryResult.data);
      } else {
        setSummaryError((summaryResult.error as { message?: string })?.message);
      }
    });
  }, [params.workshopId]);

  if (notFoundState) notFound();
  if (!workshop) return null;

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget workshop={workshop} activeTab="summary" />
      <AdminWorkshopSummaryWidget
        workshop={workshop}
        initialSummary={summary}
        initialError={summaryError}
      />
    </div>
  );
}
