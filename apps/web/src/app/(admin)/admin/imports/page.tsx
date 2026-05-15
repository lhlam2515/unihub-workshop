import { redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { listImportsServer } from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminImportsListWidget } from "@/widgets/AdminImportsListWidget";

interface PageProps {
  searchParams: Promise<{ status?: string; cursor?: string; limit?: string }>;
}

export default async function AdminImportsPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const filters = {
    status: raw.status || undefined,
    cursor: raw.cursor || undefined,
    limit: raw.limit ? Number(raw.limit) : undefined,
  };

  const result = await listImportsServer(filters, session.accessToken);
  const initialResult = result.isSuccess
    ? { items: result.data.items, pagination: result.data.pagination }
    : null;
  const initialError = result.isFailure ? String(result.error) : undefined;

  return (
    <AdminImportsListWidget
      initialResult={initialResult}
      initialError={initialError}
    />
  );
}
