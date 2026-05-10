"use client";

import { useParams, notFound } from "next/navigation";

import { ContentLoader } from "@/components/ContentLoader";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { getSpeaker } from "@/lib/api/services/admin";
import { AdminSpeakerFormWidget } from "@/widgets/AdminSpeakerFormWidget";

export default function AdminEditSpeakerPage() {
  const { speakerId } = useParams<{ speakerId: string }>();
  const { data, error, isLoading } = useAsyncQuery(
    ["admin-speaker", speakerId],
    () => getSpeaker(speakerId)
  );

  if (error) notFound();
  if (isLoading || !data) return <ContentLoader count={1} />;

  return <AdminSpeakerFormWidget mode="edit" initialData={data} />;
}
