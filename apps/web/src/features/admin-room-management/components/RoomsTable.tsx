"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import ROUTES from "@/constants/routes";
import type { RoomAdmin } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoomsTableProps {
  rooms: RoomAdmin[];
  skeleton?: boolean;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <div className="divide-y">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="h-4 flex-1 rounded bg-slate-200" />
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="h-4 w-16 rounded bg-slate-200" />
          <div className="h-4 w-16 rounded bg-slate-200" />
          <div className="h-4 w-16 rounded bg-slate-200" />
          <div className="h-4 w-20 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoomsTable({ rooms, skeleton }: RoomsTableProps) {
  if (skeleton) {
    return (
      <Card className="overflow-hidden">
        <SkeletonRows />
      </Card>
    );
  }

  if (rooms.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        Chưa có phòng nào
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
              <th className="px-4 py-3">Tên phòng</th>
              <th className="px-4 py-3">Tòa nhà</th>
              <th className="px-4 py-3">Tầng</th>
              <th className="px-4 py-3">Sức chứa</th>
              <th className="px-4 py-3">Sơ đồ</th>
              <th className="px-4 py-3">Workshop sắp tới</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rooms.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={ROUTES.ADMIN_ROOM(r.id)}
                    className="font-medium text-slate-800 hover:text-blue-600"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.building ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.floor != null ? `Tầng ${r.floor}` : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600 tabular-nums">
                  {r.capacity ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {r.floorPlanUrl ? (
                    <svg
                      className="h-4 w-4 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.upcomingWorkshopCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
