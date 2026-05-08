"use client";

import { useState } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadErrorCSVButton } from "@/features/admin-imports/components/DownloadErrorCSVButton";
import { ErrorBreakdown } from "@/features/admin-imports/components/ErrorBreakdown";
import { ImportSummary } from "@/features/admin-imports/components/ImportSummary";
import type { ImportLog } from "@/types/admin-operations";

export interface AdminImportDetailWidgetProps {
  initialResult: ImportLog | null;
  initialError?: string;
}

export function AdminImportDetailWidget({
  initialResult,
  initialError,
}: AdminImportDetailWidgetProps) {
  const [importLog] = useState<ImportLog | null>(initialResult);
  const [error] = useState<string | undefined>(initialError);

  const isFirstLoad = !initialResult && !initialError;

  // ---- Loading ----
  if (isFirstLoad) {
    return (
      <div className="space-y-4">
        <PageHeader title="Chi tiết Import" />
        <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }

  // ---- Error ----
  if (error || !importLog) {
    return (
      <div className="space-y-4">
        <PageHeader title="Chi tiết Import" />
        <ErrorDisplay
          error={error ?? "Không tìm thấy import log."}
          variant="banner"
        />
      </div>
    );
  }

  // ---- Success ----
  const errorBreakdown = (
    importLog as ImportLog & { errorBreakdown?: Record<string, number> }
  ).errorBreakdown;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chi tiết Import"
        action={
          <DownloadErrorCSVButton
            importId={importLog.id}
            hasErrors={importLog.failedCount > 0}
          />
        }
      />

      <ImportSummary importLog={importLog} />

      {errorBreakdown && importLog.failedCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Phân tích lỗi</CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorBreakdown
              breakdown={errorBreakdown}
              totalErrors={importLog.failedCount}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
