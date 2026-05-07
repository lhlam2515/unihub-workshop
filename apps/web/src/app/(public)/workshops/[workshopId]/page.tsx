"use client";

import { use, useState } from "react";

import { getWorkshopDetail } from "@/features/workshop-browsing/api/catalog.service";
import type { ApiError } from "@/lib/api/errors";
import type { WorkshopDetail } from "@/types/workshop";
import { WorkshopDetailWidget } from "@/widgets/WorkshopDetailWidget";

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

/**
 * Client page: unwraps params promise, fetches workshop detail, delegates to widget.
 *
 * Workshop detail data is not critical for SEO — client fetch is acceptable
 * and simplifies the SSR/cache story for this dynamic content.
 */
export default function WorkshopDetailPage({ params }: PageProps) {
  const { workshopId } = use(params);

  const [workshop, setWorkshop] = useState<WorkshopDetail | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    setLoaded(true);
    getWorkshopDetail(workshopId).then((result) => {
      if (result.isFailure) {
        setError((result.error as ApiError).message);
      } else {
        setWorkshop(result.data);
      }
    });
  }

  return (
    <WorkshopDetailWidget
      workshopId={workshopId}
      workshop={workshop}
      error={error}
    />
  );
}
