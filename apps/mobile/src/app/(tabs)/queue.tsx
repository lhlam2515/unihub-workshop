import { eq } from "drizzle-orm";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { createDatabaseClient } from "@/database/client";
import { deviceConfig } from "@/database/schema/device-config.schema";
import { useSync } from "@/features/checkin/api/use-sync";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { offlineAuth } from "@/lib/api/client/offline-auth";

export default function QueueScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { stats, sync, runStatus } = useSync();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            TAB HÀNG ĐỢI
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Quản lý offline queue
          </Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Các thao tác được lưu cục bộ trước, sau đó đồng bộ theo batch khi
            mạng ổn định.
          </Text>
        </View>

        <View style={[styles.card, { borderColor: colors.tabIconDefault }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Trạng thái hiện tại
          </Text>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {stats.pending}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.icon }]}>
                Pending
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {stats.failed}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.icon }]}>
                Failed
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {stats.synced}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.icon }]}>
                Synced
              </Text>
            </View>
          </View>
        </View>

        {stats.conflicts > 0 ? (
          <View style={[styles.card, { borderColor: "#F87171" }]}>
            <Text style={[styles.cardTitle, { color: "#F87171" }]}>
              {stats.conflicts} xung đột cần xem xét
            </Text>
            <Text style={[styles.cardBody, { color: colors.icon }]}>
              Các vé này đã được check-in bởi thiết bị khác hoặc đã bị hủy. Xem
              chi tiết trên web portal.
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
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
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.tint,
                opacity:
                  pressed || runStatus === "syncing" || stats.pending === 0
                    ? 0.6
                    : 1,
              },
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {runStatus === "syncing"
                ? "Đang đồng bộ..."
                : stats.pending === 0
                  ? "Không có gì để sync"
                  : `Đồng bộ ${stats.pending} bản ghi`}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(ROUTES.SYNC_PROGRESS)}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.tabIconDefault,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Xem chi tiết tiến độ
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const workshops = offlineAuth.getAllowedWorkshops();
              const firstId = workshops[0] ?? "";
              router.push(ROUTES.WORKSHOP(firstId));
            }}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.tabIconDefault,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Quay lại workshop
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
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  metric: {
    flex: 1,
    gap: 2,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  metricLabel: {
    fontSize: 12,
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
