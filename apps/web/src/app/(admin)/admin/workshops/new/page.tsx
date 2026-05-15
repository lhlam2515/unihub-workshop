import { redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import {
  listSpeakersServer,
  listRoomsServer,
} from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminWorkshopFormWidget } from "@/widgets/AdminWorkshopFormWidget";

export default async function AdminCreateWorkshopPage() {
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const [speakersResult, roomsResult] = await Promise.all([
    listSpeakersServer(session.accessToken),
    listRoomsServer(session.accessToken),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Tạo workshop mới</h1>
        <p className="text-sm text-slate-500">
          Điền thông tin workshop mới. Có thể lưu nháp hoặc công bố ngay.
        </p>
      </div>
      <AdminWorkshopFormWidget
        mode="create"
        speakers={speakersResult.isSuccess ? speakersResult.data : []}
        rooms={roomsResult.isSuccess ? roomsResult.data : []}
      />
    </div>
  );
}
