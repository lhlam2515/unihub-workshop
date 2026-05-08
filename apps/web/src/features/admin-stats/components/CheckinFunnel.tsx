"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkshopStats } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckinFunnelProps {
  stats: WorkshopStats;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CheckinFunnel({ stats }: CheckinFunnelProps) {
  const total = stats.registrations.total;
  const checkedIn = stats.checkins.total;
  const noShow = total - checkedIn;
  const noShowPct = total > 0 ? ((noShow / total) * 100).toFixed(1) : "0.0";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kênh check-in</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* CSS-based funnel */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Đã đăng ký</span>
              <span className="text-slate-500">{total}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-blue-100">
              <div
                className="h-3 rounded-full bg-blue-500"
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Đã check-in</span>
              <span className="text-green-600">
                {checkedIn} ({(stats.checkins.rate * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-green-100">
              <div
                className="h-3 rounded-full bg-green-500"
                style={{
                  width: `${Math.min(
                    total > 0 ? (checkedIn / total) * 100 : 0,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Vắng mặt</span>
              <span className="text-red-600">
                {noShow} ({noShowPct}%)
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-red-100">
              <div
                className="h-3 rounded-full bg-red-400"
                style={{
                  width: `${Math.min(
                    total > 0 ? (noShow / total) * 100 : 0,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
