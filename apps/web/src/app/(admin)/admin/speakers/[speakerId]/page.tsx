import { notFound } from "next/navigation";

import { getSpeaker } from "@/lib/api/services/admin";
import { AdminSpeakerFormWidget } from "@/widgets/AdminSpeakerFormWidget";

interface PageProps {
  params: Promise<{ speakerId: string }>;
}

export default async function AdminEditSpeakerPage({ params }: PageProps) {
  const { speakerId } = await params;
  const result = await getSpeaker(speakerId);

  if (result.isFailure) notFound();

  return <AdminSpeakerFormWidget mode="edit" initialData={result.data} />;
}
