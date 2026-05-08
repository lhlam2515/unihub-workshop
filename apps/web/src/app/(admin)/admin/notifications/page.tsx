export const dynamic = "force-dynamic";

import {
  listNotificationChannels,
  listNotificationLogs,
} from "@/lib/api/services/admin";
import { AdminNotificationsWidget } from "@/widgets/AdminNotificationsWidget";

export default async function NotificationsPage() {
  const [channelsResult, logsResult] = await Promise.all([
    listNotificationChannels(),
    listNotificationLogs(),
  ]);

  if (channelsResult.isFailure) {
    return (
      <AdminNotificationsWidget
        initialChannels={null}
        initialLogs={null}
        initialError={(channelsResult.error as { message?: string })?.message}
      />
    );
  }

  return (
    <AdminNotificationsWidget
      initialChannels={channelsResult.data}
      initialLogs={logsResult.isSuccess ? logsResult.data : null}
    />
  );
}
