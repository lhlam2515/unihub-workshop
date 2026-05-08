"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CircuitBreakerState } from "@/types/admin-operations";

const STATE_COLORS: Record<string, string> = {
  CLOSED: "border-l-green-500",
  OPEN: "border-l-red-500",
  HALF_OPEN: "border-l-amber-500",
};

const STATE_LABELS: Record<string, string> = {
  CLOSED: "Đóng",
  OPEN: "Mở",
  HALF_OPEN: "Nửa mở",
};

interface CBStateCardProps {
  cb: CircuitBreakerState;
  onReset: (gateway: string) => void;
}

export function CBStateCard({ cb, onReset }: CBStateCardProps) {
  return (
    <Card
      className={`border-l-4 ${STATE_COLORS[cb.state] ?? "border-l-slate-300"}`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base capitalize">{cb.gateway}</CardTitle>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cb.state === "OPEN" ? "bg-red-100 text-red-700" : ""} ${cb.state === "CLOSED" ? "bg-green-100 text-green-700" : ""} ${cb.state === "HALF_OPEN" ? "bg-amber-100 text-amber-700" : ""} `}
        >
          {STATE_LABELS[cb.state] ?? cb.state}
        </span>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-xs text-slate-500">
          <p>
            Số lần thất bại:{" "}
            <span className="font-mono font-medium">{cb.failureCount}</span>
          </p>
          {cb.openedAt && (
            <p>
              Mở lúc:{" "}
              {new Intl.DateTimeFormat("vi-VN", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(cb.openedAt))}
            </p>
          )}
          {cb.lastAttempt && (
            <p>
              Lần cuối:{" "}
              {new Intl.DateTimeFormat("vi-VN", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(cb.lastAttempt))}
            </p>
          )}
          <button
            onClick={() => onReset(cb.gateway)}
            className="mt-2 text-xs font-medium text-blue-600 underline hover:text-blue-800"
          >
            Đặt lại Circuit Breaker
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
