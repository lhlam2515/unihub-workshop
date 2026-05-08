import { eq } from "drizzle-orm";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SyncProgressSteps } from "@/features/checkin/components/SyncProgressSteps";
import { useSync } from "@/features/checkin/hooks/use-sync";

import ROUTES from "@/constants/routes";
import { createDatabaseClient } from "@/database/client";
import { deviceConfig } from "@/database/schema/device-config.schema";

export default function SyncProgressScreen() {
  const params = useLocalSearchParams<{ workshopId?: string }>();
  const workshopId = params.workshopId ?? "";
  const { stats, runStatus, errorMessage, sync } = useSync();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow gap-3.5 p-5">
        <View className="gap-2.5">
          <Text className="text-xs font-bold tracking-widest text-primary">
            M07 · ĐỒNG BỘ
          </Text>
          <Text className="text-2xl font-extrabold leading-8 text-foreground">
            Tiến độ đồng bộ
          </Text>
          <Text className="text-base leading-6 text-muted-foreground">
            Đẩy dữ liệu check-in offline lên server. Mỗi bản ghi được xử lý với
            ON CONFLICT DO NOTHING để đảm bảo idempotency.
          </Text>
        </View>

        <SyncProgressSteps
          stats={stats}
          runStatus={runStatus}
          errorMessage={errorMessage}
        />

        <View className="mt-1 gap-3">
          {runStatus === "done" ? (
            <Pressable
              onPress={() => router.back()}
              className="min-h-[52px] items-center justify-center rounded-2xl bg-primary px-5 py-3.5 active:opacity-85"
            >
              <Text className="text-base font-bold text-white">Hoàn thành</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                const db = createDatabaseClient();
                const device = db
                  .select()
                  .from(deviceConfig)
                  .where(eq(deviceConfig.id, 1))
                  .get();
                void sync(workshopId, device?.deviceId ?? "unknown");
              }}
              disabled={runStatus === "syncing"}
              className="min-h-[52px] items-center justify-center rounded-2xl bg-primary px-5 py-3.5 active:opacity-85 disabled:opacity-85"
            >
              {runStatus === "syncing" ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-base font-bold text-white">
                  {runStatus === "error" ? "Thử lại" : "Bắt đầu đồng bộ"}
                </Text>
              )}
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push(ROUTES.TAB_QUEUE)}
            className="items-center rounded-2xl border border-border py-3.5 active:opacity-85"
          >
            <Text className="text-base font-bold text-foreground">
              Đi tới hàng đợi
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
