"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PageHeader } from "@/components/PageHeader";
import { CBStateCard } from "@/features/admin-system/components/CBStateCard";
import { ReconcilePanel } from "@/features/admin-system/components/ReconcilePanel";
import { ResetCBConfirmDialog } from "@/features/admin-system/components/ResetCBConfirmDialog";
import type {
  CircuitBreakerState,
  ReconcileResponse,
} from "@/types/admin-operations";

export interface AdminSystemWidgetProps {
  initialCB: CircuitBreakerState[] | null;
  initialReconcileInfo: ReconcileResponse | null;
  initialError?: string;
}

export function AdminSystemWidget({
  initialCB,
  initialReconcileInfo,
  initialError,
}: AdminSystemWidgetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "breaker";

  const [cbList] = useState<CircuitBreakerState[]>(initialCB ?? []);
  const [reconcileInfo] = useState<ReconcileResponse | null>(
    initialReconcileInfo
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const isFirstLoad = !initialCB && !initialReconcileInfo && !initialError;

  const setTab = useCallback(
    (t: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", t);
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  // ---- Loading ----
  if (isFirstLoad) {
    return (
      <div className="space-y-4">
        <PageHeader title="Hệ thống" />
        <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }

  // ---- Error (no data) ----
  if (initialError && cbList.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Hệ thống" />
        <ErrorDisplay error={initialError} variant="banner" />
      </div>
    );
  }

  // ---- Success ----
  return (
    <div className="space-y-6">
      <PageHeader
        title="Hệ thống"
        description="Giám sát Circuit Breaker và vận hành đối soát thanh toán"
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("breaker")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === "breaker" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"} `}
        >
          Circuit Breaker
        </button>
        <button
          onClick={() => setTab("reconciliation")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === "reconciliation" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"} `}
        >
          Đối soát thanh toán
        </button>
      </div>

      {actionError && <ErrorDisplay error={actionError} variant="inline" />}

      {/* Breaker Tab */}
      {tab === "breaker" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cbList.map((cb) => (
            <CBStateCard
              key={cb.gateway}
              cb={cb}
              onReset={(gateway) => {
                setResetTarget(gateway);
                setResetDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Reconciliation Tab */}
      {tab === "reconciliation" && (
        <ReconcilePanel
          lastReconcile={reconcileInfo}
          onReconciled={() => {
            router.refresh();
            setActionError(null);
          }}
          onError={setActionError}
        />
      )}

      {/* Reset CB Dialog */}
      <ResetCBConfirmDialog
        gateway={resetTarget}
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        onReset={() => {
          router.refresh();
          setActionError(null);
        }}
        onError={setActionError}
      />
    </div>
  );
}
