"use client";

import { Edit2, Mail, Bell, Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { updateNotificationChannel } from "@/lib/api/services/admin";
import type {
  ChannelType,
  NotificationChannel,
} from "@/types/admin-operations";

const CHANNEL_ICONS: Record<ChannelType, typeof Mail> = {
  EMAIL: Mail,
  IN_APP: Bell,
  TELEGRAM: Send,
};

const CHANNEL_LABELS: Record<ChannelType, string> = {
  EMAIL: "Email",
  IN_APP: "Trong ứng dụng",
  TELEGRAM: "Telegram",
};

interface ChannelConfigCardProps {
  channel: NotificationChannel;
  onEdit: (channel: NotificationChannel) => void;
  onUpdated: () => void;
  onError: (message: string) => void;
}

export function ChannelConfigCard({
  channel,
  onEdit,
  onUpdated,
  onError,
}: ChannelConfigCardProps) {
  const [toggling, setToggling] = useState(false);
  const Icon = CHANNEL_ICONS[channel.channelType];

  async function handleToggle() {
    setToggling(true);
    const result = await updateNotificationChannel(channel.id, {
      isActive: !channel.isActive,
    });
    setToggling(false);
    if (result.isFailure) {
      const msg =
        (result.error as { message?: string })?.message ??
        "Không thể cập nhật kênh.";
      onError(msg);
      return;
    }
    onUpdated();
  }

  return (
    <Card className={channel.isActive ? "" : "opacity-60"}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-slate-500" />
          <CardTitle className="text-base">
            {CHANNEL_LABELS[channel.channelType]}
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(channel)}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Switch
            checked={channel.isActive}
            onCheckedChange={handleToggle}
            disabled={toggling}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-xs text-slate-500">
          <p>
            Cấu hình:{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
              {JSON.stringify(channel.configJson).slice(0, 80)}
              {JSON.stringify(channel.configJson).length > 80 ? "..." : ""}
            </code>
          </p>
          <p>
            Cập nhật lần cuối:{" "}
            {new Intl.DateTimeFormat("vi-VN", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(channel.lastUpdatedAt))}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
