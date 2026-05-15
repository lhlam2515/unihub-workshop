import { redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { listRoomsServer } from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminRoomListWidget } from "@/widgets/AdminRoomListWidget";

export default async function AdminRoomsPage() {
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const result = await listRoomsServer(session.accessToken);
  const rooms = result.isSuccess ? result.data : [];
  const error = result.isFailure ? String(result.error) : undefined;

  return <AdminRoomListWidget initialResult={rooms} initialError={error} />;
}
