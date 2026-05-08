"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PageHeader } from "@/components/PageHeader";
import { ChannelConfigCard } from "@/features/admin-notifications/components/ChannelConfigCard";
import { JSONEditorDialog } from "@/features/admin-notifications/components/JSONEditorDialog";
import { NotificationLogsTable } from "@/features/admin-notifications/components/NotificationLogsTable";
import type { PaginatedResult } from "@/lib/api/client";
import type {
  NotificationChannel,
  NotificationLog,
} from "@/types/admin-operations";

export interface AdminNotificationsWidgetProps {
  initialChannels: NotificationChannel[] | null;
  initialLogs: PaginatedResult<NotificationLog> | null;
  initialError?: string;
}

export function AdminNotificationsWidget({
  initialChannels,
  initialLogs,
  initialError,
}: AdminNotificationsWidgetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "channels";

  const [channels] = useState<NotificationChannel[]>(initialChannels ?? []);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] =
    useState<NotificationChannel | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const isFirstLoad = !initialChannels && !initialLogs && !initialError;

  const setTab = useCallback(
    (t: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", t);
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  // ---- Loading ----
  if (isFirstLoad) {
    return (
      <div className="space-y-4">
        <PageHeader title="Thông báo" />
        <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }

  // ---- Error (no data at all) ----
  if (
    initialError &&
    channels.length === 0 &&
    (!initialLogs || initialLogs.items.length === 0)
  ) {
    return (
      <div className="space-y-4">
        <PageHeader title="Thông báo" />
        <ErrorDisplay error={initialError} variant="banner" />
      </div>
    );
  }

  // ---- Success ----
  return (
    <div className="space-y-6">
      <PageHeader
        title="Thông báo"
        description="Cấu hình kênh thông báo và xem lịch sử gửi"
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("channels")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === "channels" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"} `}
        >
          Kênh thông báo
        </button>
        <button
          onClick={() => setTab("logs")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === "logs" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"} `}
        >
          Lịch sử gửi
        </button>
      </div>

      {channelError && <ErrorDisplay error={channelError} variant="inline" />}

      {/* Channels Tab */}
      {tab === "channels" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch) => (
            <ChannelConfigCard
              key={ch.id}
              channel={ch}
              onEdit={(c) => {
                setEditingChannel(c);
                setEditorOpen(true);
              }}
              onUpdated={() => router.refresh()}
              onError={setChannelError}
            />
          ))}
        </div>
      )}

      {/* Logs Tab */}
      {tab === "logs" && (
        <NotificationLogsTable
          logs={initialLogs?.items ?? []}
          isLoading={!initialLogs}
        />
      )}

      {/* JSON Editor Dialog */}
      <JSONEditorDialog
        channel={editingChannel}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={() => router.refresh()}
        onError={setChannelError}
      />
    </div>
  );
}
