"use client";

import { useAsyncQuery } from "@/hooks/use-async-query";
import { listRooms } from "@/lib/api/services/admin";
import { AdminRoomListWidget } from "@/widgets/AdminRoomListWidget";

export default function AdminRoomListPage() {
  const { data, error } = useAsyncQuery(["admin-rooms"], () => listRooms());

  return (
    <AdminRoomListWidget
      initialResult={data ?? null}
      initialError={error?.message}
    />
  );
}
