"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkshopStats } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistrationTimelineChartProps {
  stats: WorkshopStats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  PAID: "Đã thanh toán",
  CONFIRMED: "Xác nhận",
  PENDING: "Chờ",
  CANCELLED: "Đã hủy",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RegistrationTimelineChart({
  stats,
}: RegistrationTimelineChartProps) {
  const chartData = Object.entries(stats.registrations.byStatus).map(
    ([status, count]) => ({
      status: STATUS_LABELS[status] ?? status,
      count,
    })
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đăng ký theo trạng thái</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <XAxis
              dataKey="status"
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12 }}
            />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
