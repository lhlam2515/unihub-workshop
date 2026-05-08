"use client";

import { useState } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/ui/button";
import { CheckinFunnel } from "@/features/admin-stats/components/CheckinFunnel";
import { RegistrationTimelineChart } from "@/features/admin-stats/components/RegistrationTimelineChart";
import { StatsKpiCards } from "@/features/admin-stats/components/StatsKpiCards";
import { getWorkshopStats } from "@/lib/api/services/admin";
import type { WorkshopAdmin, WorkshopStats } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminWorkshopStatsWidgetProps {
  workshop: Pick<WorkshopAdmin, "id">;
  initialStats?: WorkshopStats | null;
  initialError?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminWorkshopStatsWidget({
  workshop,
  initialStats,
  initialError,
}: AdminWorkshopStatsWidgetProps) {
  const [stats, setStats] = useState<WorkshopStats | null>(
    initialStats ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);

  const handleRetry = async () => {
    setIsLoading(true);
    setError(undefined);
    const result = await getWorkshopStats(workshop.id);
    if (result.isSuccess) {
      setStats(result.data);
    } else {
      const message =
        (result.error as { message?: string })?.message ??
        "Không thể tải thống kê";
      setError(message);
    }
    setIsLoading(false);
  };

  // -------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------
  if (isLoading) {
    return <StatsKpiCards isLoading />;
  }

  // -------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------
  if (error && !stats) {
    return (
      <div className="space-y-4">
        <ErrorDisplay error={error} variant="banner" />
        <div className="flex justify-center">
          <Button onClick={handleRetry}>Thử lại</Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Empty guard (should not happen in practice)
  // -------------------------------------------------------------------
  if (!stats) return null;

  // -------------------------------------------------------------------
  // Success state
  // -------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <StatsKpiCards stats={stats} />
      <div className="grid gap-6 lg:grid-cols-2">
        <RegistrationTimelineChart stats={stats} />
        <CheckinFunnel stats={stats} />
      </div>
    </div>
  );
}
