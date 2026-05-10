import { CheckCircle2, Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { AiSummary } from "@/types/workshop";

interface AISummaryPanelProps {
  summary: AiSummary;
}

export function AISummaryPanel({ summary }: AISummaryPanelProps) {
  // Hidden states
  if (summary.status === "NONE" || summary.status === "FAILED") {
    return null;
  }

  // Loading states
  if (summary.status === "QUEUED" || summary.status === "PROCESSING") {
    return (
      <section data-testid="ai-summary-tab" className="space-y-3">
        <h2 className="text-lg font-semibold">Tóm tắt AI</h2>
        <div className="rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
            <span className="text-muted-foreground text-sm">
              {summary.status === "QUEUED"
                ? "Đang chờ xử lý..."
                : "Đang tạo tóm tắt..."}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
          </div>
        </div>
      </section>
    );
  }

  // Done state
  return (
    <section data-testid="ai-summary-tab" className="space-y-3">
      <h2 className="text-lg font-semibold">Tóm tắt AI</h2>
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
          <div className="space-y-1">
            <p className="text-sm leading-relaxed text-green-800 dark:text-green-200">
              {summary.text}
            </p>
            {summary.updatedAt && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Cập nhật:{" "}
                {new Date(summary.updatedAt).toLocaleDateString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "numeric",
                  month: "numeric",
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
