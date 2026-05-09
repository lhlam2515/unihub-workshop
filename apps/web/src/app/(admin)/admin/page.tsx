"use client";

import { useEffect, useState } from "react";

import { getAdminDashboardOverview } from "@/lib/api/services/admin";
import type { DashboardOverview } from "@/types/admin";
import { AdminDashboardWidget } from "@/widgets/AdminDashboardWidget";

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    getAdminDashboardOverview().then((result) => {
      if (result.isFailure) {
        setError((result.error as { message?: string })?.message);
      } else {
        setData(result.data);
      }
    });
  }, []);

  return <AdminDashboardWidget initialResult={data} initialError={error} />;
}
