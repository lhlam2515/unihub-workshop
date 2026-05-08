import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import type { WorkshopStatus } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkshopScheduleEntry {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: WorkshopStatus;
}

export interface RoomScheduleCalendarProps {
  workshops: WorkshopScheduleEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  return `${formatDate(startsAt)}, ${formatTime(startsAt)} – ${formatTime(endsAt)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoomScheduleCalendar({ workshops }: RoomScheduleCalendarProps) {
  const sorted = [...workshops].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  if (sorted.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        Chưa có lịch sử dụng phòng
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="divide-y">
        {sorted.map((w) => (
          <div
            key={w.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                {w.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatTimeRange(w.startsAt, w.endsAt)}
              </p>
            </div>
            <StatusBadge status={w.status} variant="workshop" />
          </div>
        ))}
      </div>
    </Card>
  );
}
