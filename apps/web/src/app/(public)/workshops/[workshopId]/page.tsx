import { notFound } from "next/navigation";

import { getWorkshopDetailServer } from "@/lib/api/server-services/catalog";
import { WorkshopDetailWidget } from "@/widgets/WorkshopDetailWidget";

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

/**
 * Fetches workshop detail on the server and delegates rendering to WorkshopDetailWidget.
 *
 * Calls notFound() when the workshop does not exist or is not accessible,
 * delegating the 404 response to Next.js.
 *
 * @param params - Route params promise containing workshopId (UUID).
 */
export default async function WorkshopDetailPage({ params }: PageProps) {
  const { workshopId } = await params;
  const result = await getWorkshopDetailServer(workshopId);

  if (result.isFailure) notFound();

  return (
    <WorkshopDetailWidget workshop={result.data} workshopId={workshopId} />
  );
}
