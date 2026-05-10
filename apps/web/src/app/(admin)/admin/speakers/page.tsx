"use client";

import { useAsyncQuery } from "@/hooks/use-async-query";
import { listSpeakers } from "@/lib/api/services/admin";
import { AdminSpeakerListWidget } from "@/widgets/AdminSpeakerListWidget";

export default function AdminSpeakerListPage() {
  const { data, error } = useAsyncQuery(["admin-speakers"], () =>
    listSpeakers()
  );

  return (
    <AdminSpeakerListWidget
      initialResult={data ?? null}
      initialError={error?.message}
    />
  );
}
