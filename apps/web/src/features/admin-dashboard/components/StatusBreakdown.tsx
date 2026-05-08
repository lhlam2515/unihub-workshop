import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import type { WorkshopStatus } from "@/types/workshop";

interface StatusBreakdownProps {
  breakdown: Record<WorkshopStatus, number>;
  skeleton?: boolean;
}

const STATUS_ORDER: WorkshopStatus[] = [
  "DRAFT",
  "OPEN",
  "COMPLETED",
  "CANCELLED",
];

const STATUS_COLORS: Record<WorkshopStatus, string> = {
  DRAFT: "bg-slate-400",
  OPEN: "bg-green-500",
  COMPLETED: "bg-blue-500",
  CANCELLED: "bg-red-400",
};

export function StatusBreakdown({ breakdown, skeleton }: StatusBreakdownProps) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;

  if (skeleton) {
    return (
      <Card className="p-5">
        <div className="mb-3 h-4 w-32 rounded bg-slate-200" />
        <div className="mb-4 flex gap-0.5 overflow-hidden rounded">
          {[40, 30, 20, 10].map((w, i) => (
            <div key={i} className="h-3 rounded" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 w-24 rounded bg-slate-200" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-medium text-slate-700">
        Trạng thái workshop
      </h3>

      <div className="mb-4 flex gap-0.5 overflow-hidden rounded-lg">
        {STATUS_ORDER.map((status) => {
          const count = breakdown[status] || 0;
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={status}
              className={`${STATUS_COLORS[status]} h-3 transition-all`}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {STATUS_ORDER.map((status) => (
          <div key={status} className="flex items-center gap-2 text-sm">
            <StatusBadge status={status} variant="workshop" />
            <span className="font-medium text-slate-700 tabular-nums">
              {breakdown[status] || 0}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
