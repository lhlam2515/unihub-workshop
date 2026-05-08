import Link from "next/link";

import { Card } from "@/components/ui/card";
import ROUTES from "@/constants/routes";
import type { TopWorkshopItem } from "@/types/admin";

interface TopWorkshopsTableProps {
  workshops: TopWorkshopItem[];
  type: "highest" | "lowest";
  skeleton?: boolean;
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 w-4 flex-shrink-0 rounded bg-slate-200" />
          <div className="h-4 flex-1 rounded bg-slate-200" />
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-4 w-16 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function TopWorkshopsTable({
  workshops,
  type,
  skeleton,
}: TopWorkshopsTableProps) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-medium text-slate-700">
        {type === "highest"
          ? "Workshop có tỷ lệ đăng ký cao nhất"
          : "Workshop có tỷ lệ đăng ký thấp nhất"}
      </h3>

      {skeleton ? (
        <SkeletonRows />
      ) : workshops.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Chưa có dữ liệu
        </p>
      ) : (
        <div className="space-y-3">
          {workshops.map((w, i) => (
            <div key={w.id} className="flex items-center gap-3 text-sm">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-medium text-slate-500">
                {i + 1}
              </span>

              <Link
                href={ROUTES.ADMIN_WORKSHOP(w.id)}
                className="flex-1 truncate font-medium text-slate-800 hover:text-blue-600"
              >
                {w.title}
              </Link>

              <div className="flex w-32 items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      type === "highest" ? "bg-green-400" : "bg-amber-400"
                    }`}
                    style={{ width: `${Math.min(w.fillRate * 100, 100)}%` }}
                  />
                </div>
                <span className="w-10 text-right text-slate-600 tabular-nums">
                  {(w.fillRate * 100).toFixed(0)}%
                </span>
              </div>

              <span className="w-18 text-right text-slate-500 tabular-nums">
                {w.registrations}/{w.seatsTotal}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
