"use client";

import { AlertCircle, CheckCircle2, Clock, FileX, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AiSummary } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryStatusDisplayProps {
  summary: AiSummary | null;
  isPolling?: boolean;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

interface StatusConfig {
  icon: typeof FileX;
  label: string;
  colorClass: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  NONE: {
    icon: FileX,
    label: "Chưa tạo",
    colorClass: "text-gray-500",
  },
  QUEUED: {
    icon: Clock,
    label: "Đang chờ",
    colorClass: "text-blue-600",
  },
  PROCESSING: {
    icon: Loader2,
    label: "Đang xử lý...",
    colorClass: "text-blue-600",
  },
  DONE: {
    icon: CheckCircle2,
    label: "Hoàn thành",
    colorClass: "text-green-600",
  },
  FAILED: {
    icon: AlertCircle,
    label: "Thất bại",
    colorClass: "text-red-600",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SummaryStatusDisplay({
  summary,
  isPolling = false,
}: SummaryStatusDisplayProps) {
  if (!summary) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <FileX className="h-4 w-4" />
        <span>Chưa có dữ liệu</span>
      </div>
    );
  }

  const config = STATUS_CONFIG[summary.status] ?? STATUS_CONFIG.NONE;
  const Icon = config.icon;
  const isSpinning = summary.status === "PROCESSING" || isPolling;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "h-4 w-4",
            config.colorClass,
            isSpinning && "animate-spin"
          )}
        />
        <span className={cn("text-sm font-medium", config.colorClass)}>
          {config.label}
        </span>
        {summary.updatedAt && (
          <span className="text-xs text-slate-400">
            {new Date(summary.updatedAt).toLocaleString("vi-VN")}
          </span>
        )}
      </div>
      {summary.status === "FAILED" && summary.errorDetail && (
        <p className="text-xs text-red-500">{summary.errorDetail}</p>
      )}
    </div>
  );
}
