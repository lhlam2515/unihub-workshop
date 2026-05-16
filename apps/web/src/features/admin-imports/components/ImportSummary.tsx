"use client";

import type { ImportLog } from "@/types/admin-operations";

interface ImportSummaryProps {
  importLog: ImportLog;
}

export function ImportSummary({ importLog }: ImportSummaryProps) {
  const totalRows = importLog.totalRows ?? 0;
  const successCount = importLog.successCount ?? 0;
  const failedCount = importLog.failedCount ?? 0;
  const successPercent =
    totalRows > 0
      ? Math.round((successCount / totalRows) * 100)
      : 0;

  function formatDateTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "--";

    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(date);
  }

  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 md:grid-cols-4">
      <div>
        <p className="text-xs text-slate-500">Thời gian chạy</p>
        <p className="text-sm font-medium">{formatDateTime(importLog.runAt)}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Người kích hoạt</p>
        <p className="text-sm font-medium capitalize">
          {importLog.triggeredBy === "CRON" ? "Tự động" : "Thủ công"}
        </p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Trạng thái</p>
        <p className="text-sm font-medium">{importLog.status}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Tổng dòng</p>
        <p className="text-lg font-bold">{totalRows}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Thành công</p>
        <p className="text-lg font-bold text-green-600">{successCount}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Lỗi</p>
        <p className="text-lg font-bold text-red-600">{failedCount}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Tỉ lệ thành công</p>
        <p className="text-lg font-bold">{successPercent}%</p>
      </div>
    </div>
  );
}
