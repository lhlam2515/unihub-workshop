import { Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";

export type SyncStatus =
  | "PENDING"
  | "SYNCING"
  | "SYNCED"
  | "CONFLICT"
  | "FAILED";

export interface QueueItemRowProps {
  studentName: string;
  studentCode: string;
  qrCode: string;
  syncStatus: SyncStatus;
  checkedInAt: number;
}

const statusLabels: Record<SyncStatus, string> = {
  PENDING: "Chờ sync",
  SYNCING: "Đang sync",
  SYNCED: "Đã sync",
  CONFLICT: "Xung đột",
  FAILED: "Thất bại",
};

const statusVariants: Record<
  SyncStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDING: "secondary",
  SYNCING: "default",
  SYNCED: "default",
  CONFLICT: "destructive",
  FAILED: "destructive",
};

export function QueueItemRow({
  studentName,
  studentCode,
  qrCode,
  syncStatus,
  checkedInAt,
}: QueueItemRowProps) {
  const time = new Date(checkedInAt).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View className="flex-row items-center justify-between py-3">
      <View className="flex-1 gap-1">
        <Text className="text-base font-bold text-foreground">
          {studentName}
        </Text>
        <Text className="text-sm text-muted-foreground">{studentCode}</Text>
        <Text className="text-xs text-muted-foreground">
          {qrCode} · {time}
        </Text>
      </View>
      <Badge variant={statusVariants[syncStatus]}>
        <Text>{statusLabels[syncStatus]}</Text>
      </Badge>
    </View>
  );
}
