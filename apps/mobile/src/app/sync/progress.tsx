import { eq } from "drizzle-orm";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SyncProgressSteps } from "@/features/checkin/components/SyncProgressSteps";
import { useSync } from "@/features/checkin/hooks/use-sync";

import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { createDatabaseClient } from "@/database/client";
import { deviceConfig } from "@/database/schema/device-config.schema";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function SyncProgressScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const params = useLocalSearchParams<{ workshopId?: string }>();
  const workshopId = params.workshopId ?? "";
  const { stats, runStatus, errorMessage, sync } = useSync();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            M07 · ĐỒNG BỘ
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Tiến độ đồng bộ
          </Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Đẩy dữ liệu check-in offline lên server. Mỗi bản ghi được xử lý với
            ON CONFLICT DO NOTHING để đảm bảo idempotency.
          </Text>
        </View>

        <SyncProgressSteps
          stats={stats}
          runStatus={runStatus}
          errorMessage={errorMessage}
        />

        <View style={styles.actions}>
          {runStatus === "done" ? (
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.primaryButtonText}>Hoàn thành</Text>
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
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.tint,
                  opacity: pressed || runStatus === "syncing" ? 0.85 : 1,
                },
              ]}
            >
              {runStatus === "syncing" ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {runStatus === "error" ? "Thử lại" : "Bắt đầu đồng bộ"}
                </Text>
              )}
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push(ROUTES.TAB_QUEUE)}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.tabIconDefault,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Đi tới hàng đợi
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 20,
    gap: 14,
  },
  header: {
    gap: 10,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
    minHeight: 52,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
