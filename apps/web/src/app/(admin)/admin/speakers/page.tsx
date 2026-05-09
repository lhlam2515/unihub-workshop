"use client";

import { useEffect, useState } from "react";

import { listSpeakers } from "@/lib/api/services/admin";
import type { SpeakerAdmin } from "@/types/workshop";
import { AdminSpeakerListWidget } from "@/widgets/AdminSpeakerListWidget";

export default function AdminSpeakerListPage() {
  const [data, setData] = useState<SpeakerAdmin[] | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    listSpeakers().then((result) => {
      if (result.isFailure) {
        setError((result.error as { message?: string })?.message);
      } else {
        setData(result.data);
      }
    });
  }, []);

  return <AdminSpeakerListWidget initialResult={data} initialError={error} />;
}
