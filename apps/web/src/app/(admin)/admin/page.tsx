import { redirect } from "next/navigation";

import { getAdminDashboardOverviewServer } from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminDashboardWidget } from "@/widgets/AdminDashboardWidget";
import ROUTES from "@/constants/routes";

export default async function AdminDashboardPage() {
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const result = await getAdminDashboardOverviewServer(session.accessToken);
  const overview = result.isFailure ? null : result.data;

  return <AdminDashboardWidget overview={overview} />;
}
