"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { ContentLoader } from "@/components/ContentLoader";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { MetricTile } from "@/components/MetricTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBreakdown } from "@/features/admin-dashboard/components/StatusBreakdown";
import { TopWorkshopsTable } from "@/features/admin-dashboard/components/TopWorkshopsTable";
import type { DashboardOverview } from "@/types/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminDashboardWidgetProps {
  initialResult: DashboardOverview | null;
  initialError?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminDashboardWidget({
  initialResult,
  initialError,
}: AdminDashboardWidgetProps) {
  const router = useRouter();

  // Loading
  if (!initialResult && !initialError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tổng quan" description="Đang tải dữ liệu..." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <MetricTile key={i} label="" value="" skeleton />
          ))}
        </div>
        <ContentLoader layout="grid" count={2} />
      </div>
    );
  }

  // Error
  if (initialError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tổng quan" />
        <ErrorDisplay error={initialError} variant="banner" />
        <button
          onClick={() => router.refresh()}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
        >
          <RefreshCw className="h-4 w-4" />
          Thử lại
        </button>
      </div>
    );
  }

  // Success
  const data = initialResult!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        description={`Tổng số workshop: ${data.totalWorkshops}`}
      />

      {/* Metric tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile
          label="Tổng đăng ký"
          value={data.totalRegistrations.toLocaleString("vi-VN")}
        />
        <MetricTile
          label="Tỷ lệ lấp đầy trung bình"
          value={`${(data.avgFillRate * 100).toFixed(1)}%`}
          trend={{ value: 0, isPositive: true }}
        />
        <MetricTile
          label="Tỷ lệ check-in"
          value={`${(data.checkinRate * 100).toFixed(1)}%`}
        />
        <MetricTile
          label="Doanh thu"
          value={formatCurrency(data.paidRevenue.amount)}
        />
        <MetricTile label="Workshop" value={data.totalWorkshops} />
        {data.circuitBreaker && (
          <div className="flex items-center gap-4 rounded-xl border bg-white p-5">
            <div className="flex-1">
              <p className="text-sm text-slate-500">Circuit Breaker</p>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  data.circuitBreaker.state === "CLOSED"
                    ? "bg-green-50 text-green-700"
                    : data.circuitBreaker.state === "HALF_OPEN"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-red-700"
                }`}
              >
                {data.circuitBreaker.state === "CLOSED"
                  ? "Bình thường"
                  : data.circuitBreaker.state === "HALF_OPEN"
                    ? "Đang phục hồi"
                    : "Đã ngắt"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Status breakdown */}
      <StatusBreakdown breakdown={data.workshopsByStatus} />

      {/* Top workshops */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopWorkshopsTable workshops={data.topHighestFillRate} type="highest" />
        <TopWorkshopsTable workshops={data.topLowestFillRate} type="lowest" />
      </div>

      {/* Timestamp */}
      <p className="text-center text-xs text-slate-400">
        Cập nhật lúc {formatTime(data.updatedAt)}
      </p>
    </div>
  );
}
