"use client";

import { ContentLoader } from "@/components/ContentLoader";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { listSpeakers, listRooms } from "@/lib/api/services/admin";
import { AdminWorkshopFormWidget } from "@/widgets/AdminWorkshopFormWidget";

export default function AdminCreateWorkshopPage() {
  const speakersQuery = useAsyncQuery(["admin-speakers-form"], () =>
    listSpeakers()
  );
  const roomsQuery = useAsyncQuery(["admin-rooms-form"], () => listRooms());

  if (speakersQuery.isLoading || roomsQuery.isLoading) {
    return <ContentLoader count={2} />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Tạo workshop mới</h1>
        <p className="text-sm text-slate-500">
          Điền thông tin workshop mới. Có thể lưu nháp hoặc công bố ngay.
        </p>
      </div>

      <AdminWorkshopFormWidget
        mode="create"
        speakers={speakersQuery.data ?? []}
        rooms={roomsQuery.data ?? []}
      />
    </div>
  );
}
