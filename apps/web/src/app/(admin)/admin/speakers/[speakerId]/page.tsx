import { notFound, redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { getSpeakerServer } from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminSpeakerFormWidget } from "@/widgets/AdminSpeakerFormWidget";

interface PageProps {
  params: Promise<{ speakerId: string }>;
}

export default async function AdminSpeakerEditPage({ params }: PageProps) {
  const { speakerId } = await params;
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const result = await getSpeakerServer(speakerId, session.accessToken);
  if (result.isFailure) notFound();

  return <AdminSpeakerFormWidget mode="edit" initialData={result.data} />;
}
