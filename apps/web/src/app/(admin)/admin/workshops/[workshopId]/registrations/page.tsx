"use client";

import { useParams, useSearchParams, notFound } from "next/navigation";
import { Suspense } from "react";

import { ContentLoader } from "@/components/ContentLoader";
import { useAsyncQuery } from "@/hooks/use-async-query";
import {
  getAdminWorkshop,
  getWorkshopRegistrations,
} from "@/lib/api/services/admin";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopRegistrationsWidget } from "@/widgets/AdminWorkshopRegistrationsWidget";

function RegistrationsContent() {
  const { workshopId } = useParams<{ workshopId: string }>();
  const searchParams = useSearchParams();

  const filters = {
    status: searchParams.get("status") || undefined,
    checkedIn: searchParams.get("checkedIn") === "true" ? true : undefined,
    search: searchParams.get("search") || undefined,
    cursor: searchParams.get("cursor") || undefined,
  };

  const searchKey = searchParams.toString();
  const workshopQuery = useAsyncQuery(["admin-workshop-regs", workshopId], () =>
    getAdminWorkshop(workshopId)
  );
  const registrationsQuery = useAsyncQuery(
    ["admin-workshop-regs-list", workshopId, searchKey],
    () => getWorkshopRegistrations(workshopId, filters)
  );

  if (workshopQuery.error) notFound();
  if (workshopQuery.isLoading) return <ContentLoader count={2} />;

  const workshop = workshopQuery.data!;

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget workshop={workshop} activeTab="registrations" />
      <AdminWorkshopRegistrationsWidget
        key={workshop.id}
        workshop={workshop}
        initialRegistrations={registrationsQuery.data?.items ?? []}
        initialPagination={
          registrationsQuery.data?.pagination ?? {
            limit: 20,
            nextCursor: null,
            hasMore: false,
            total: null,
          }
        }
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
