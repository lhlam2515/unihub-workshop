"use client";

import { toast } from "sonner";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PdfUploader } from "@/features/admin-summary/components/PdfUploader";
import { SummaryStatusDisplay } from "@/features/admin-summary/components/SummaryStatusDisplay";
import { SummaryTextEditor } from "@/features/admin-summary/components/SummaryTextEditor";
import { useSummaryPolling } from "@/features/admin-summary/lib/useSummaryPolling";
import { retrySummary } from "@/lib/api/services/admin";
import type { AiSummary, WorkshopAdmin } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminWorkshopSummaryWidgetProps {
  workshop: WorkshopAdmin;
  initialSummary: AiSummary | null;
  initialError?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminWorkshopSummaryWidget({
  workshop,
  initialSummary,
  initialError,
}: AdminWorkshopSummaryWidgetProps) {
  const { summary, setSummary, isPolling, error, startPolling } =
    useSummaryPolling(workshop.id, initialSummary);

  if (initialError && !summary) {
    return <ErrorDisplay error={initialError} variant="banner" />;
  }

  const displayError = error || null;

  return (
    <div className="space-y-6">
      {displayError && <ErrorDisplay error={displayError} variant="inline" />}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: status + text */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Trạng thái AI Tóm tắt</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryStatusDisplay summary={summary} isPolling={isPolling} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nội dung tóm tắt</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryTextEditor
                workshopId={workshop.id}
                initialText={summary?.text}
                onSaved={(text) => {
                  setSummary((prev) =>
                    prev ? { ...prev, text, status: "DONE" } : prev
                  );
                  toast.success("Đã lưu nội dung tóm tắt");
                }}
                disabled={isPolling}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column: upload + retry */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tải lên PDF</CardTitle>
              <CardDescription>Tối đa 10MB, định dạng .pdf</CardDescription>
            </CardHeader>
            <CardContent>
              <PdfUploader
                workshopId={workshop.id}
                currentStatus={summary?.status}
                onUploaded={(s) => {
                  setSummary(s);
                  startPolling();
                }}
                disabled={isPolling}
              />
            </CardContent>
          </Card>

          {summary?.status === "FAILED" && (
            <Button
              variant="outline"
              onClick={async () => {
                const r = await retrySummary(workshop.id);
                if (r.isSuccess) {
                  setSummary(r.data);
                  startPolling();
                } else {
                  toast.error("Không thể thử lại");
                }
              }}
            >
              Thử lại AI Tóm tắt
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
