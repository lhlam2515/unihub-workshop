"use client";

import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getAdminWorkshop,
  listSpeakers,
  listRooms,
} from "@/lib/api/services/admin";
import type {
  WorkshopAdmin,
  SpeakerSummary,
  RoomSummary,
} from "@/types/workshop";
import { AdminWorkshopEditWidget } from "@/widgets/AdminWorkshopEditWidget";
import { AdminWorkshopFormWidget } from "@/widgets/AdminWorkshopFormWidget";

export default function AdminWorkshopEditPage() {
  const params = useParams<{ workshopId: string }>();
  const [workshop, setWorkshop] = useState<WorkshopAdmin | null>(null);
  const [speakers, setSpeakers] = useState<SpeakerSummary[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    Promise.all([
      getAdminWorkshop(params.workshopId),
      listSpeakers(),
      listRooms(),
    ]).then(([workshopResult, speakersResult, roomsResult]) => {
      if (workshopResult.isFailure) {
        setNotFoundState(true);
        return;
      }
      setWorkshop(workshopResult.data);
      if (speakersResult.isSuccess) setSpeakers(speakersResult.data);
      if (roomsResult.isSuccess) setRooms(roomsResult.data);
    });
  }, [params.workshopId]);

  if (notFoundState) notFound();
  if (!workshop) return null;

  return (
    <div className="space-y-6">
      <AdminWorkshopEditWidget workshop={workshop} />
      <AdminWorkshopFormWidget
        mode="edit"
        initialData={workshop}
        speakers={speakers}
        rooms={rooms}
      />
    </div>
  );
}
