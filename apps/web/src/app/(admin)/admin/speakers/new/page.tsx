import { redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminSpeakerFormWidget } from "@/widgets/AdminSpeakerFormWidget";

export default async function AdminSpeakerNewPage() {
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  return <AdminSpeakerFormWidget mode="create" />;
}
