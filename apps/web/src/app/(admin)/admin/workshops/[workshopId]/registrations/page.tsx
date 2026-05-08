import { notFound } from "next/navigation";

import {
  getAdminWorkshop,
  getWorkshopRegistrations,
} from "@/lib/api/services/admin";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopRegistrationsWidget } from "@/widgets/AdminWorkshopRegistrationsWidget";

interface PageProps {
  params: Promise<{ workshopId: string }>;
  searchParams: Promise<{
    status?: string;
    checkedIn?: string;
    search?: string;
    cursor?: string;
  }>;
}

export default async function AdminWorkshopRegistrationsPage({
  params,
  searchParams,
}: PageProps) {
  const { workshopId } = await params;
  const filters = await searchParams;

  const [workshopResult, registrationsResult] = await Promise.all([
    getAdminWorkshop(workshopId),
    getWorkshopRegistrations(workshopId, {
      status: filters.status,
      checkedIn: filters.checkedIn === "true" ? true : undefined,
      search: filters.search,
      cursor: filters.cursor,
    }),
  ]);

  if (workshopResult.isFailure) {
    notFound();
  }

  const items = registrationsResult.isSuccess
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
        key={workshopId}
        workshop={workshopResult.data}
        initialRegistrations={items}
        initialPagination={pagination}
      />
    </div>
  );
}
