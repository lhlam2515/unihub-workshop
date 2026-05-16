import { redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminDashboardWidget } from "@/widgets/AdminDashboardWidget";

export default async function AdminDashboardPage() {
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  return <AdminDashboardWidget />;
}
