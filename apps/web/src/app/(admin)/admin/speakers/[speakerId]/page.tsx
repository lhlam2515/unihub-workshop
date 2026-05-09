"use client";

import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";

import { getSpeaker } from "@/lib/api/services/admin";
import type { SpeakerAdmin } from "@/types/workshop";
import { AdminSpeakerFormWidget } from "@/widgets/AdminSpeakerFormWidget";

export default function AdminEditSpeakerPage() {
  const params = useParams<{ speakerId: string }>();
  const [data, setData] = useState<SpeakerAdmin | undefined>(undefined);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    getSpeaker(params.speakerId).then((result) => {
      if (result.isFailure) {
        setNotFoundState(true);
      } else {
        setData(result.data);
      }
    });
  }, [params.speakerId]);

  if (notFoundState) notFound();

  return <AdminSpeakerFormWidget mode="edit" initialData={data} />;
}
