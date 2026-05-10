import Link from "next/link";

import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import ROUTES from "@/constants/routes";
import type { WorkshopAdmin } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkshopAdminTableProps {
  workshops: WorkshopAdmin[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  skeleton?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <div className="divide-y">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="h-4 w-4 rounded bg-slate-200" />
          <div className="h-4 flex-1 rounded bg-slate-200" />
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-4 w-20 rounded bg-slate-200" />
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-4 w-16 rounded bg-slate-200" />
          <div className="h-4 w-20 rounded bg-slate-200" />
          <div className="h-4 w-24 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkshopAdminTable({
  workshops,
  selectedIds,
  onSelectionChange,
  skeleton,
}: WorkshopAdminTableProps) {
  if (skeleton) {
    return (
      <Card className="overflow-hidden">
        <SkeletonRows />
      </Card>
    );
  }

  const allSelected =
    workshops.length > 0 && selectedIds.size === workshops.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(workshops.map((w) => w.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  };

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className="rounded border-slate-300"
                />
              </th>
              <th className="px-4 py-3">Tiêu đề</th>
              <th className="px-4 py-3">Diễn giả</th>
              <th className="px-4 py-3">Phòng</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3">Số ghế</th>
              <th className="px-4 py-3">Giá</th>
              <th className="px-4 py-3">Cập nhật</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {workshops.map((w) => (
              <tr
                key={w.id}
                data-testid="workshop-row"
                className={`transition-colors hover:bg-slate-50 ${
                  selectedIds.has(w.id) ? "bg-blue-50" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(w.id)}
                    onChange={() => toggleOne(w.id)}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={ROUTES.ADMIN_WORKSHOP(w.id)}
                    className="font-medium text-slate-800 hover:text-blue-600"
                  >
                    {w.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {w.speaker?.fullName ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {w.room?.name ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={w.status} variant="workshop" />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  {formatDateTime(w.startsAt)}
                </td>
                <td className="px-4 py-3 text-slate-600 tabular-nums">
                  {w.seatsTotal - w.seatsAvailable}/{w.seatsTotal}
                </td>
                <td className="px-4 py-3 text-slate-600 tabular-nums">
                  {w.price > 0 ? formatCurrency(w.price) : "Miễn phí"}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-400">
                  {formatDateTime(w.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
