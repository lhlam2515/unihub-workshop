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

import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { useSync } from "@/features/checkin/api/use-sync";
import { useColorScheme } from "@/hooks/use-color-scheme";

const DEMO_WORKSHOP_ID = "ws-101";

export default function SyncProgressScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const params = useLocalSearchParams<{ workshopId?: string }>();
  const workshopId = params.workshopId ?? DEMO_WORKSHOP_ID;
  const { stats, runStatus, errorMessage, sync } = useSync();

  const steps = [
    {
      label: "Đọc hàng đợi local",
      state: runStatus === "idle" ? "Sẵn sàng" : "Hoàn thành",
    },
    {
      label: "Chuẩn bị batch",
      state:
        runStatus === "syncing"
          ? "Đang xử lý"
          : runStatus === "done"
            ? "Hoàn thành"
            : "Chờ",
    },
    {
      label: "Đẩy lên server",
      state:
        runStatus === "syncing"
          ? "Đang xử lý"
          : runStatus === "done"
            ? "Hoàn thành"
            : runStatus === "error"
              ? "Thất bại"
              : "Chờ",
    },
    {
      label: "Cập nhật trạng thái local",
      state: runStatus === "done" ? "Hoàn thành" : "Chờ",
    },
  ];

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

        <View style={[styles.card, { borderColor: colors.tabIconDefault }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Thống kê hàng đợi
          </Text>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {stats.pending}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.icon }]}>
                Chờ sync
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {stats.synced}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.icon }]}>
                Đã sync
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {stats.conflicts}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.icon }]}>
                Xung đột
              </Text>
            </View>
          </View>
          {errorMessage ? (
            <Text style={[styles.errorText, { color: "#F87171" }]}>
              {errorMessage}
            </Text>
          ) : null}
        </View>

        <View style={[styles.card, { borderColor: colors.tabIconDefault }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Các bước đồng bộ
          </Text>
          <View style={styles.stepList}>
            {steps.map((step, index) => (
              <View key={step.label} style={styles.stepRow}>
                <Text style={[styles.stepIndex, { color: colors.tint }]}>
                  {index + 1}
                </Text>
                <View style={styles.stepBody}>
                  <Text style={[styles.stepLabel, { color: colors.text }]}>
                    {step.label}
                  </Text>
                  <Text style={[styles.stepState, { color: colors.icon }]}>
                    {step.state}
                  </Text>
                </View>
                {runStatus === "syncing" && index === 2 ? (
                  <ActivityIndicator size="small" color={colors.tint} />
                ) : null}
              </View>
            ))}
          </View>
        </View>

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
              onPress={() => void sync(workshopId, "device-demo")}
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
  errorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  stepList: {
    gap: 12,
  },
  stepRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  stepIndex: {
    width: 30,
    height: 30,
    borderRadius: 15,
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 15,
    fontWeight: "800",
  },
  stepBody: {
    flex: 1,
    gap: 2,
  },
  stepLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  stepState: {
    fontSize: 13,
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
