"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import ROUTES from "@/constants/routes";
import type { SpeakerAdmin } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpeakersTableProps {
  speakers: SpeakerAdmin[];
  onDelete: (speaker: SpeakerAdmin) => void;
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
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="h-4 flex-1 rounded bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-4 w-16 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpeakersTable({
  speakers,
  onDelete,
  skeleton,
}: SpeakersTableProps) {
  if (skeleton) {
    return (
      <Card className="overflow-hidden">
        <SkeletonRows />
      </Card>
    );
  }

  if (speakers.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        Chưa có diễn giả nào
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
              <th className="w-14 px-4 py-3">Ảnh</th>
              <th className="px-4 py-3">Họ tên</th>
              <th className="px-4 py-3">Chức danh</th>
              <th className="px-4 py-3">Workshop sắp tới</th>
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {speakers.map((s) => (
              <tr key={s.id} className="transition-colors hover:bg-slate-50">
                <td className="px-4 py-3">
                  {s.avatarUrl ? (
                    <img
                      src={s.avatarUrl}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                        />
                      </svg>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={ROUTES.ADMIN_SPEAKER(s.id)}
                    className="font-medium text-slate-800 hover:text-blue-600"
                  >
                    {s.fullName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{s.title ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {s.upcomingWorkshopCount}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:text-red-700"
                    onClick={() => onDelete(s)}
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
