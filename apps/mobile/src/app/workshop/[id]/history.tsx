import { router, useLocalSearchParams } from "expo-router";
import { FlatList, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import type { SyncStatus } from "@/database/types";
import { useCheckinHistory } from "@/features/checkin/hooks/use-checkin-history";

function getWorkshopId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const statusLabels: Record<SyncStatus, string> = {
  PENDING: "Chưa đồng bộ",
  SYNCING: "Đang đồng bộ",
  SYNCED: "Đã đồng bộ",
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

export default function CheckinHistoryScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const workshopId = getWorkshopId(params.id);
  const { records, isLoading } = useCheckinHistory(workshopId);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="gap-1 px-5 pb-3 pt-5">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-sm text-muted-foreground">← Quay lại</Text>
        </TouchableOpacity>
        <Text className="text-[26px] font-extrabold text-foreground">
          Điểm danh local
        </Text>
        <Text className="text-sm text-muted-foreground">
          {records.length} bản ghi
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center gap-2.5 p-6">
          <Text className="text-sm text-muted-foreground">Đang tải...</Text>
        </View>
      ) : records.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-2.5 p-6">
          <Text className="text-lg font-bold text-foreground">
            Chưa có bản ghi nào
          </Text>
          <Text className="text-center text-sm leading-5 text-muted-foreground">
            Các lượt điểm danh sẽ xuất hiện ở đây sau khi quét QR.
          </Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.localId}
          contentContainerClassName="px-5 pb-6 gap-2.5"
          renderItem={({ item }) => (
            <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5">
              <View className="flex-1 gap-0.5">
                <Text className="text-base font-bold text-foreground">
                  {item.studentName}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {item.studentCode}
                </Text>
                <Text className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatTime(item.checkedInAt)}
                </Text>
              </View>
              <Badge variant={statusVariants[item.syncStatus]}>
                <Text>{statusLabels[item.syncStatus]}</Text>
              </Badge>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
