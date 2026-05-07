import { listWorkshops } from "@/features/workshop-browsing/api/catalog.service";
import type { ApiError } from "@/lib/api/errors";
import type { WorkshopFilters } from "@/types/workshop";
import { WorkshopListWidget } from "@/widgets/WorkshopListWidget";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseFilters(
  sp: Record<string, string | string[] | undefined>
): WorkshopFilters {
  const filters: WorkshopFilters = { limit: 20 };

  const day = sp.day;
  if (typeof day === "string" && day) filters.day = day;

  if (sp.hasSeats === "true") filters.hasSeats = true;

  const sort = sp.sort;
  if (typeof sort === "string" && sort) filters.sort = sort;

  const search = sp.search;
  if (typeof search === "string" && search) filters.search = search;

  return filters;
}

export default async function WorkshopsPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const filters = parseFilters(raw);

  const result = await listWorkshops(filters);

  if (result.isFailure) {
    const err = result.error as ApiError;
    return (
      <WorkshopListWidget
        initialResult={null}
        initialError={err.message}
        filters={filters}
      />
    );
  }

  return <WorkshopListWidget initialResult={result.data} filters={filters} />;
}
