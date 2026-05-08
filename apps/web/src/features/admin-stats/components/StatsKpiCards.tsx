"use client";

import { CheckCheck, DollarSign, UserX, Users } from "lucide-react";

import { MetricTile } from "@/components/MetricTile";
import type { WorkshopStats } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatsKpiCardsProps {
  stats?: WorkshopStats | null;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatsKpiCards({ stats, isLoading }: StatsKpiCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Đã đăng ký" value="" skeleton />
        <MetricTile label="Đã check-in" value="" skeleton />
        <MetricTile label="Vắng mặt" value="" skeleton />
        <MetricTile label="Doanh thu" value="" skeleton />
      </div>
    );
  }

  if (!stats) return null;

  const totalRegistrations = stats.registrations.total;
  const checkedIn = stats.checkins.total;
  const checkedInRate = stats.checkins.rate;
  const noShowRate =
    totalRegistrations > 0
      ? ((totalRegistrations - checkedIn) / totalRegistrations) * 100
      : 0;
  const revenueFormatted = Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: stats.revenue.currency,
  }).format(stats.revenue.amount);

  const byStatusEntries = Object.entries(stats.registrations.byStatus);
  const byStatusSubtitle =
    byStatusEntries.map(([key, count]) => `${key}: ${count}`).join(" | ") || "";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricTile
        label="Đã đăng ký"
        value={totalRegistrations}
        icon={Users}
        trend={byStatusSubtitle ? { value: 0, isPositive: true } : undefined}
      />
      <MetricTile
        label="Đã check-in"
        value={`${checkedIn} / ${(checkedInRate * 100).toFixed(1)}%`}
        icon={CheckCheck}
      />
      <MetricTile
        label="Vắng mặt"
        value={`${noShowRate.toFixed(1)}%`}
        icon={UserX}
      />
      <MetricTile
        label="Doanh thu"
        value={revenueFormatted}
        icon={DollarSign}
      />
    </div>
  );
}
