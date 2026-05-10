"use client";

import { useAsyncQuery } from "@/hooks/use-async-query";
import type { PaginatedResult } from "@/lib/api/client";
import {
  listNotificationChannels,
  listNotificationLogs,
} from "@/lib/api/services/admin";
import type { NotificationLog } from "@/types/admin-operations";
import { AdminNotificationsWidget } from "@/widgets/AdminNotificationsWidget";

export default function NotificationsPage() {
  const channelsQuery = useAsyncQuery(["admin-notif-channels"], () =>
    listNotificationChannels()
  );
  const logsQuery = useAsyncQuery(["admin-notif-logs"], () =>
    listNotificationLogs()
  );

  const error =
    channelsQuery.error?.message ?? logsQuery.error?.message ?? undefined;

  return (
    <AdminNotificationsWidget
      initialChannels={channelsQuery.data ?? null}
      initialLogs={(logsQuery.data as PaginatedResult<NotificationLog>) ?? null}
      initialError={error}
    />
  );
}
