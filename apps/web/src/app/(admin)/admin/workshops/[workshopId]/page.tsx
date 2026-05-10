"use client";

import { useParams, notFound } from "next/navigation";

import { ContentLoader } from "@/components/ContentLoader";
import { useAsyncQuery } from "@/hooks/use-async-query";
import {
  getAdminWorkshop,
  listSpeakers,
  listRooms,
} from "@/lib/api/services/admin";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopFormWidget } from "@/widgets/AdminWorkshopFormWidget";

export default function AdminWorkshopEditPage() {
  const { workshopId } = useParams<{ workshopId: string }>();

  const workshopQuery = useAsyncQuery(["admin-workshop", workshopId], () =>
    getAdminWorkshop(workshopId)
  );
  const speakersQuery = useAsyncQuery(["admin-speakers-edit"], () =>
    listSpeakers()
  );
  const roomsQuery = useAsyncQuery(["admin-rooms-edit"], () => listRooms());

  if (workshopQuery.error) notFound();
  if (workshopQuery.isLoading) return <ContentLoader count={2} />;

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget workshop={workshopQuery.data!} />
      <AdminWorkshopFormWidget
        mode="edit"
        initialData={workshopQuery.data!}
        speakers={speakersQuery.data ?? []}
        rooms={roomsQuery.data ?? []}
      />
    </div>
  );
}
