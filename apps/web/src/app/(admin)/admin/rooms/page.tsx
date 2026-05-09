"use client";

import { useEffect, useState } from "react";

import { listRooms } from "@/lib/api/services/admin";
import type { RoomAdmin } from "@/types/workshop";
import { AdminRoomListWidget } from "@/widgets/AdminRoomListWidget";

export default function AdminRoomListPage() {
  const [data, setData] = useState<RoomAdmin[] | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    listRooms().then((result) => {
      if (result.isFailure) {
        setError((result.error as { message?: string })?.message);
      } else {
        setData(result.data);
      }
    });
  }, []);

  return <AdminRoomListWidget initialResult={data} initialError={error} />;
}
