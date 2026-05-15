import { notFound, redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import {
  getAdminWorkshopServer,
  listAdminWorkshopRegistrationsServer,
} from "@/lib/api/server-services/admin";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopRegistrationsWidget } from "@/widgets/AdminWorkshopRegistrationsWidget";
import ROUTES from "@/constants/routes";

interface PageProps {
  params: Promise<{ workshopId: string }>;
  searchParams: Promise<{
    status?: string;
    cursor?: string;
    checkedIn?: string;
    search?: string;
  }>;
}

export default async function AdminWorkshopRegistrationsPage({
  params,
  searchParams,
}: PageProps) {
  const { workshopId } = await params;
  const raw = await searchParams;
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const filters = {
    status: raw.status || undefined,
    checkedIn: raw.checkedIn === "true" ? true : undefined,
    search: raw.search || undefined,
    cursor: raw.cursor || undefined,
  };

  const [workshopResult, registrationsResult] = await Promise.all([
    getAdminWorkshopServer(workshopId, session.accessToken),
    listAdminWorkshopRegistrationsServer(
      workshopId,
      filters,
      session.accessToken
    ),
  ]);

  if (workshopResult.isFailure) notFound();

  const registrations = registrationsResult.isSuccess
    ? registrationsResult.data.items
    : [];
  const pagination = registrationsResult.isSuccess
    ? registrationsResult.data.pagination
    : { limit: 20, nextCursor: null, hasMore: false, total: null };

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget
        workshop={workshopResult.data}
        activeTab="registrations"
      />
      <AdminWorkshopRegistrationsWidget
        key={workshopResult.data.id}
        workshop={workshopResult.data}
        initialRegistrations={registrations}
        initialPagination={pagination}
      />
    </div>
  );
}
