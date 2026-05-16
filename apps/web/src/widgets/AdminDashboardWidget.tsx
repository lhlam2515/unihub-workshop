"use client";

import { LayoutDashboard } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";

// ---------------------------------------------------------------------------
// Coming Soon Placeholder
// ---------------------------------------------------------------------------

function ComingSoonPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white py-20">
      <LayoutDashboard className="mb-4 h-12 w-12 text-slate-300" />
      <h3 className="text-lg font-semibold text-slate-700">
        Trang tổng quan đang được phát triển
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Các tính năng thống kê và chỉ số sẽ được cập nhật trong phiên bản tiếp
        theo.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminDashboardWidgetProps {
  overview?: never;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminDashboardWidget({}: AdminDashboardWidgetProps) {
  return (
    <div className="space-y-6">
      <PageHeader title="Tổng quan" />
      <ComingSoonPlaceholder />
    </div>
  );
}
