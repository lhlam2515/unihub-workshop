import { listRooms } from "@/lib/api/services/admin";
import { AdminRoomListWidget } from "@/widgets/AdminRoomListWidget";

export default async function AdminRoomListPage() {
  const result = await listRooms();

  if (result.isFailure) {
    return (
      <AdminRoomListWidget
        initialResult={null}
        initialError={(result.error as { message?: string })?.message}
      />
    );
  }

  return <AdminRoomListWidget initialResult={result.data} />;
}
