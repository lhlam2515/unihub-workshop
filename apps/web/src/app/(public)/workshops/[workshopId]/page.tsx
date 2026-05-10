"use client";

import { useEffect, use, useState } from "react";

import { getWorkshopDetail } from "@/features/workshop-browsing/api/catalog.service";
import type { ApiError } from "@/lib/api/errors";
import type { WorkshopDetail } from "@/types/workshop";
import { WorkshopDetailWidget } from "@/widgets/WorkshopDetailWidget";

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

/**
 * Client page: unwraps params promise, fetches workshop detail, delegates to widget.
 */
export default function WorkshopDetailPage({ params }: PageProps) {
  const { workshopId } = use(params);

  const [workshop, setWorkshop] = useState<WorkshopDetail | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    getWorkshopDetail(workshopId).then((result) => {
      if (cancelled) return;
      if (result.isFailure) {
        setError((result.error as ApiError).message);
      } else {
        setWorkshop(result.data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [workshopId]);

  return (
    <WorkshopDetailWidget
      workshopId={workshopId}
      workshop={workshop}
      error={error}
    />
  );
}
