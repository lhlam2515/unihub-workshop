"use client";

import { useEffect, useState } from "react";

import { listSpeakers, listRooms } from "@/lib/api/services/admin";
import type { SpeakerSummary, RoomSummary } from "@/types/workshop";
import { AdminWorkshopFormWidget } from "@/widgets/AdminWorkshopFormWidget";

export default function AdminCreateWorkshopPage() {
  const [speakers, setSpeakers] = useState<SpeakerSummary[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);

  useEffect(() => {
    Promise.all([listSpeakers(), listRooms()]).then(
      ([speakersResult, roomsResult]) => {
        if (speakersResult.isSuccess) setSpeakers(speakersResult.data);
        if (roomsResult.isSuccess) setRooms(roomsResult.data);
      }
    );
  }, []);

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
        speakers={speakers}
        rooms={rooms}
      />
    </div>
  );
}
