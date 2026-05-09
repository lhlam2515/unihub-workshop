"use client";

import { useParams, useSearchParams, notFound } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";

import {
  getAdminWorkshop,
  getWorkshopRegistrations,
} from "@/lib/api/services/admin";
import type { PaginationMeta } from "@/lib/api/types";
import type { RegistrationAdmin } from "@/types/registration";
import type { WorkshopAdmin } from "@/types/workshop";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopRegistrationsWidget } from "@/widgets/AdminWorkshopRegistrationsWidget";

function RegistrationsContent() {
  const params = useParams<{ workshopId: string }>();
  const searchParams = useSearchParams();

  const [workshop, setWorkshop] = useState<WorkshopAdmin | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationAdmin[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    limit: 20,
    nextCursor: null,
    hasMore: false,
    total: null,
  });
  const [notFoundState, setNotFoundState] = useState(false);

  const filters = useMemo(
    () => ({
      status: searchParams.get("status") || undefined,
      checkedIn: searchParams.get("checkedIn") === "true" ? true : undefined,
      search: searchParams.get("search") || undefined,
      cursor: searchParams.get("cursor") || undefined,
    }),
    [searchParams]
  );

  useEffect(() => {
    const workshopId = params.workshopId;
    Promise.all([
      getAdminWorkshop(workshopId),
      getWorkshopRegistrations(workshopId, filters),
    ]).then(([workshopResult, registrationsResult]) => {
      if (workshopResult.isFailure) {
        setNotFoundState(true);
        return;
      }
      setWorkshop(workshopResult.data);

      if (registrationsResult.isSuccess) {
        setRegistrations(registrationsResult.data.items);
        setPagination(registrationsResult.data.pagination);
      }
    });
  }, [params.workshopId, filters]);

  if (notFoundState) notFound();
  if (!workshop) return null;

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget workshop={workshop} activeTab="registrations" />
      <AdminWorkshopRegistrationsWidget
        key={workshop.id}
        workshop={workshop}
        initialRegistrations={registrations}
        initialPagination={pagination}
      />
    </div>
  );
}

export default function AdminWorkshopRegistrationsPage() {
  return (
    <Suspense fallback={<div className="p-4">Đang tải...</div>}>
      <RegistrationsContent />
    </Suspense>
  );
}
