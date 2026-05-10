"use client";

import dynamic from "next/dynamic";

import { ContentLoader } from "@/components/ContentLoader";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { getAdminDashboardOverview } from "@/lib/api/services/admin";

const AdminDashboardWidget = dynamic(
  () =>
    import("@/widgets/AdminDashboardWidget").then((mod) => ({
      default: mod.AdminDashboardWidget,
    })),
  {
    loading: () => <ContentLoader layout="grid" count={3} />,
    ssr: false,
  }
);

export default function AdminDashboardPage() {
  const { data, error } = useAsyncQuery(["admin-dashboard"], () =>
    getAdminDashboardOverview()
  );

  return (
    <AdminDashboardWidget
      initialResult={data ?? null}
      initialError={error?.message}
    />
  );
}
