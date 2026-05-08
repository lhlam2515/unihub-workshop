export const dynamic = "force-dynamic";

import { getAdminDashboardOverview } from "@/lib/api/services/admin";
import { AdminDashboardWidget } from "@/widgets/AdminDashboardWidget";

export default async function AdminDashboardPage() {
  const result = await getAdminDashboardOverview();

  if (result.isFailure) {
    return (
      <AdminDashboardWidget
        initialResult={null}
        initialError={(result.error as { message?: string })?.message}
      />
    );
  }

  return <AdminDashboardWidget initialResult={result.data} />;
}
