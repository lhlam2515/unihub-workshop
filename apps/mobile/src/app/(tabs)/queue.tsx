import { eq } from "drizzle-orm";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import ROUTES from "@/constants/routes";
import { createDatabaseClient } from "@/database/client";
import { deviceConfig } from "@/database/schema/device-config.schema";
import { QueueItemRow } from "@/features/checkin/components/QueueItemRow";
import { useSync } from "@/features/checkin/hooks/use-sync";

export default function QueueScreen() {
  const { stats, queueItems, sync, runStatus } = useSync();
  const [deviceId, setDeviceId] = useState<string>("unknown");

  useEffect(() => {
    const db = createDatabaseClient();
    const device = db
      .select()
      .from(deviceConfig)
      .where(eq(deviceConfig.id, 1))
      .get();
    if (device) {
      setDeviceId(device.deviceId);
    }
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow p-5 gap-3.5">
        <View className="gap-2.5">
          <Text className="text-2xl font-extrabold leading-8 text-foreground">
            Quản lý offline queue
          </Text>
          <Text className="text-base leading-6 text-muted-foreground">
            Các thao tác được lưu cục bộ trước, sau đó đồng bộ theo batch khi
            mạng ổn định.
          </Text>
        </View>

        <View className="gap-2.5 rounded-3xl border border-border bg-card p-5">
          <Text className="text-lg font-bold text-foreground">
            Trạng thái hiện tại
          </Text>
          <View className="flex-row justify-between gap-3">
            <View className="flex-1 gap-0.5">
              <Text className="text-2xl font-extrabold text-foreground">
                {stats.pending}
              </Text>
              <Text className="text-xs text-muted-foreground">Chờ sync</Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-2xl font-extrabold text-foreground">
                {stats.conflicts}
              </Text>
              <Text className="text-xs text-muted-foreground">Xung đột</Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-2xl font-extrabold text-foreground">
                {stats.synced}
              </Text>
              <Text className="text-xs text-muted-foreground">Đã sync</Text>
            </View>
          </View>
        </View>

        {stats.conflicts > 0 ? (
          <View style={{ gap: 10, borderRadius: 24, borderWidth: 1, borderColor: "#b91c1c", backgroundColor: "rgba(127,29,29,0.2)", padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#ef4444" }}>
              {stats.conflicts} xung đột cần xem xét
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Các vé này đã được check-in bởi thiết bị khác hoặc đã bị hủy. Xem
              chi tiết trên web portal.
            </Text>
          </View>
        ) : null}

        <View className="rounded-3xl border border-border bg-card">
          {queueItems.length === 0 ? (
            <View className="items-center justify-center p-8">
              <Text className="text-sm text-muted-foreground">
                Không có bản ghi nào trong hàng đợi
              </Text>
            </View>
          ) : (
            <View className="px-5">
              {queueItems.map((item, index) => (
                <View
                  key={item.localId}
                  className={
                    index < queueItems.length - 1
                      ? "border-b border-border"
                      : undefined
                  }
                >
                  <QueueItemRow
                    studentName={item.studentName}
                    studentCode={item.studentCode}
                    qrCode={item.qrCode}
                    syncStatus={item.syncStatus}
                    checkedInAt={item.checkedInAt}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        <View className="mt-1 gap-3">
          <Button
            onPress={() => void sync("", deviceId)}
            disabled={runStatus === "syncing" || stats.pending === 0}
            className="rounded-2xl px-5"
          >
            <Text>
              {runStatus === "syncing"
                ? "Đang đồng bộ..."
                : stats.pending === 0
                  ? "Không có gì để sync"
                  : `Đồng bộ ${stats.pending} bản ghi`}
            </Text>
          </Button>
          <Button
            variant="outline"
            onPress={() => router.push(ROUTES.SYNC_PROGRESS)}
            className="rounded-2xl"
          >
            <Text>Xem chi tiết tiến độ</Text>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
