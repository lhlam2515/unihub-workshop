import { redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { getCircuitBreakerStateServer } from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminSystemWidget } from "@/widgets/AdminSystemWidget";

export default async function AdminSystemPage() {
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const result = await getCircuitBreakerStateServer(session.accessToken);
  const initialCB = result.isSuccess ? result.data : null;
  const initialError = result.isFailure ? String(result.error) : undefined;

  return (
    <AdminSystemWidget
      initialCB={initialCB}
      initialReconcileInfo={null}
      initialError={initialError}
    />
  );
}
