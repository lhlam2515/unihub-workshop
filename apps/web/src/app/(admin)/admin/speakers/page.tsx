import { redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { listSpeakersServer } from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminSpeakerListWidget } from "@/widgets/AdminSpeakerListWidget";

export default async function AdminSpeakersPage() {
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const result = await listSpeakersServer(session.accessToken);
  const speakers = result.isSuccess ? result.data : [];
  const error = result.isFailure ? String(result.error) : undefined;

  return (
    <AdminSpeakerListWidget initialResult={speakers} initialError={error} />
  );
}
