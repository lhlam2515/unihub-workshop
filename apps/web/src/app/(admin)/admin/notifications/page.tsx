import { redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import {
  listNotificationChannelsServer,
  listNotificationLogsServer,
} from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminNotificationsWidget } from "@/widgets/AdminNotificationsWidget";

export default async function AdminNotificationsPage() {
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const [channelsResult, logsResult] = await Promise.all([
    listNotificationChannelsServer(session.accessToken),
    listNotificationLogsServer({}, session.accessToken),
  ]);

  const initialChannels = channelsResult.isSuccess ? channelsResult.data : null;
  const initialLogs = logsResult.isSuccess
    ? { items: logsResult.data.items, pagination: logsResult.data.pagination }
    : null;
  const initialError =
    channelsResult.isFailure || logsResult.isFailure
      ? String(
          channelsResult.isFailure ? channelsResult.error : logsResult.error
        )
      : undefined;

  return (
    <AdminNotificationsWidget
      initialChannels={initialChannels}
      initialLogs={initialLogs}
      initialError={initialError}
    />
  );
}
