import { listSpeakers, listRooms } from "@/lib/api/services/admin";
import { AdminWorkshopFormWidget } from "@/widgets/AdminWorkshopFormWidget";

export default async function AdminCreateWorkshopPage() {
  const [speakersResult, roomsResult] = await Promise.all([
    listSpeakers(),
    listRooms(),
  ]);

  const speakers = speakersResult.isSuccess ? speakersResult.data.items : [];
  const rooms = roomsResult.isSuccess ? roomsResult.data.items : [];

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
        speakers={speakers}
        rooms={rooms}
      />
    </div>
  );
}
