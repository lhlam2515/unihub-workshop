import { eq } from "drizzle-orm";
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import ROUTES from "@/constants/routes";
import { createDatabaseClient } from "@/database/client";
import { deviceConfig } from "@/database/schema/device-config.schema";
import { useSync } from "@/features/checkin/hooks/use-sync";
import { offlineAuth } from "@/lib/api/client/offline-auth";

export default function QueueScreen() {
  const { stats, sync, runStatus } = useSync();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow p-5 gap-3.5">
        <View className="gap-2.5">
          <Text className="text-xs font-bold tracking-widest text-primary">
            TAB HÀNG ĐỢI
          </Text>
          <Text className="text-2xl font-extrabold leading-8 text-foreground">
            Quản lý offline queue
          </Text>
          <Text className="text-base leading-6 text-muted-foreground">
            Các thao tác được lưu cục bộ trước, sau đó đồng bộ theo batch khi
            mạng ổn định.
          </Text>
        </View>

        <View className="gap-2.5 rounded-3xl border border-border p-5">
          <Text className="text-lg font-bold text-foreground">
            Trạng thái hiện tại
          </Text>
          <View className="flex-row justify-between gap-3">
            <View className="flex-1 gap-0.5">
              <Text className="text-2xl font-extrabold text-foreground">
                {stats.pending}
              </Text>
              <Text className="text-xs text-muted-foreground">Pending</Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-2xl font-extrabold text-foreground">
                {stats.failed}
              </Text>
              <Text className="text-xs text-muted-foreground">Failed</Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-2xl font-extrabold text-foreground">
                {stats.synced}
              </Text>
              <Text className="text-xs text-muted-foreground">Synced</Text>
            </View>
          </View>
        </View>

        {stats.conflicts > 0 ? (
          <View className="gap-2.5 rounded-3xl border border-red-400 p-5">
            <Text className="text-lg font-bold text-red-400">
              {stats.conflicts} xung đột cần xem xét
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Các vé này đã được check-in bởi thiết bị khác hoặc đã bị hủy. Xem
              chi tiết trên web portal.
            </Text>
          </View>
        ) : null}

        <View className="mt-1 gap-3">
          <Button
            onPress={() => {
              const db = createDatabaseClient();
              const device = db
                .select()
                .from(deviceConfig)
                .where(eq(deviceConfig.id, 1))
                .get();
              void sync("", device?.deviceId ?? "unknown");
            }}
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
          <Button
            variant="outline"
            onPress={() => {
              const workshops = offlineAuth.getAllowedWorkshops();
              const firstId = workshops[0] ?? "";
              router.push(ROUTES.WORKSHOP(firstId));
            }}
            className="rounded-2xl"
          >
            <Text>Quay lại workshop</Text>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
