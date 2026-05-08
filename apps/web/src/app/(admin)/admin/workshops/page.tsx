import { listAdminWorkshops } from "@/lib/api/services/admin";
import type { AdminWorkshopFilters, WorkshopStatus } from "@/types/workshop";
import { AdminWorkshopListWidget } from "@/widgets/AdminWorkshopListWidget";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminWorkshopListPage({
  searchParams,
}: PageProps) {
  const raw = await searchParams;

  const filters: AdminWorkshopFilters = {
    status: (raw.status as WorkshopStatus) || undefined,
    day: (raw.day as string) || undefined,
    q: (raw.q as string) || undefined,
    cursor: (raw.cursor as string) || undefined,
    limit: raw.limit ? Number(raw.limit) : undefined,
  };

  const result = await listAdminWorkshops(filters);

  if (result.isFailure) {
    return (
      <AdminWorkshopListWidget
        initialResult={null}
        initialError={(result.error as { message?: string })?.message}
        filters={filters}
      />
    );
  }

  return (
    <AdminWorkshopListWidget initialResult={result.data} filters={filters} />
  );
}
