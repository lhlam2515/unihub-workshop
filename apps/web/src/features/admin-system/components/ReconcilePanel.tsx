"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { triggerReconciliation } from "@/lib/api/services/admin";
import type { ReconcileResponse } from "@/types/admin-operations";

interface ReconcilePanelProps {
  lastReconcile: ReconcileResponse | null;
  onReconciled: (result: ReconcileResponse) => void;
  onError: (message: string) => void;
}

export function ReconcilePanel({
  lastReconcile,
  onReconciled,
  onError,
}: ReconcilePanelProps) {
  const [loading, setLoading] = useState(false);

  async function handleTrigger() {
    setLoading(true);
    const result = await triggerReconciliation();
    setLoading(false);
    if (result.isFailure) {
      const err = result.error as { code?: string; message?: string };
      if (err.code === "reconciliation.already_running") {
        onError("Đã có một tiến trình đối soát đang chạy.");
      } else {
        onError(err.message ?? "Không thể kích hoạt đối soát.");
      }
      return;
    }
    onReconciled(result.data);
  }

  function formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đối soát thanh toán</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">Giao dịch chưa đối soát</p>
              <p className="text-2xl font-bold">
                {lastReconcile?.unresolvedCount ?? "--"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Lần chạy gần nhất</p>
              <p className="text-sm font-medium">
                {lastReconcile?.startedAt
                  ? formatDateTime(lastReconcile.startedAt)
                  : "Chưa có"}
              </p>
            </div>
          </div>
          <Button onClick={handleTrigger} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Kích hoạt đối soát
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
