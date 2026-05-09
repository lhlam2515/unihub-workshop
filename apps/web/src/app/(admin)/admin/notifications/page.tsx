"use client";

import { useEffect, useState } from "react";

import type { PaginatedResult } from "@/lib/api/client";
import {
  listNotificationChannels,
  listNotificationLogs,
} from "@/lib/api/services/admin";
import type {
  NotificationChannel,
  NotificationLog,
} from "@/types/admin-operations";
import { AdminNotificationsWidget } from "@/widgets/AdminNotificationsWidget";

export default function NotificationsPage() {
  const [channels, setChannels] = useState<NotificationChannel[] | null>(null);
  const [logs, setLogs] = useState<PaginatedResult<NotificationLog> | null>(
    null
  );
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    Promise.all([listNotificationChannels(), listNotificationLogs()]).then(
      ([channelsResult, logsResult]) => {
        if (channelsResult.isFailure) {
          setError((channelsResult.error as { message?: string })?.message);
        } else {
          setChannels(channelsResult.data);
        }
        if (logsResult.isSuccess) {
          setLogs(logsResult.data);
        }
      }
    );
  }, []);

  return (
    <AdminNotificationsWidget
      initialChannels={channels}
      initialLogs={logs}
      initialError={error}
    />
  );
}
