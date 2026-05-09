import { Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";

import type { LucideIcon } from "lucide-react";

interface MetricTileProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  skeleton?: boolean;
}

export function MetricTile({
  label,
  value,
  icon: Icon,
  trend,
  skeleton,
}: MetricTileProps) {
  if (skeleton) {
    return (
      <Card className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-200">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 rounded bg-slate-200" />
          <div className="h-6 w-28 rounded bg-slate-200" />
        </div>
      </Card>
    );
  }

  return (
    <Card data-testid="stat-card" className="flex items-center gap-4 p-5">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="flex-1">
        <p className="text-sm text-slate-500">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {trend && (
            <span
              className={`text-sm font-medium ${
                trend.isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {trend.isPositive ? "+" : ""}
              {trend.value}%
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
