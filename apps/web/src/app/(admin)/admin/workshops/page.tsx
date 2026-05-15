import { redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { getServerSession } from "@/lib/auth/server-session";
import { listAdminWorkshopsServer } from "@/lib/api/server-services/admin";
import { AdminWorkshopListWidget } from "@/widgets/AdminWorkshopListWidget";
import type { AdminWorkshopFilters, WorkshopStatus } from "@/types/workshop";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    day?: string;
    q?: string;
    cursor?: string;
    limit?: string;
  }>;
}

export default async function AdminWorkshopListPage({
  searchParams,
}: PageProps) {
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const raw = await searchParams;
  const filters: AdminWorkshopFilters = {
    status: (raw.status as WorkshopStatus) || undefined,
    day: raw.day || undefined,
    q: raw.q || undefined,
    cursor: raw.cursor || undefined,
    limit: raw.limit ? Number(raw.limit) : undefined,
  };

  const result = await listAdminWorkshopsServer(filters, session.accessToken);
  const initialWorkshops = result.isFailure ? [] : result.data.items;
  const initialPagination = result.isFailure ? null : result.data.pagination;

  return (
    <AdminWorkshopListWidget
      filters={filters}
      initialWorkshops={initialWorkshops}
      initialPagination={initialPagination}
    />
  );
}
