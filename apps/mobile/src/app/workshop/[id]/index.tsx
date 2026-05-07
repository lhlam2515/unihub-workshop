import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
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
import {
  checkinStatusService,
  type CheckinStatus,
} from "@/features/workshops/api/checkin-status.service";
import { useColorScheme } from "@/hooks/use-color-scheme";
import handleError from "@/lib/handlers/error";

function getWorkshopId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function WorkshopDashboardScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const workshopId = getWorkshopId(params.id);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!workshopId) return;
    void fetchStatus();
  }, [workshopId]);

  async function fetchStatus() {
    setIsLoading(true);
    setErrorMessage(null);

    const result = await checkinStatusService.getStatus(workshopId);
    setIsLoading(false);

    if (result.isFailure) {
      const appError = handleError(result.error);
      setErrorMessage(appError.message);
      return;
    }

    setStatus(result.data);
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            DASHBOARD
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Workshop {workshopId.slice(0, 8)}
          </Text>
        </View>

        <View style={[styles.card, { borderColor: colors.tabIconDefault }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Tổng quan ca trực
          </Text>

          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.tint} />
              <Text style={[styles.hint, { color: colors.icon }]}>
                Đang tải...
              </Text>
            </View>
          ) : errorMessage ? (
            <View>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Pressable onPress={fetchStatus}>
                <Text style={[styles.retryText, { color: colors.tint }]}>
                  Thử lại
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.metricRow}>
              <View style={styles.metric}>
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {status?.confirmed_count ?? "—"}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.icon }]}>
                  Đã đăng ký
                </Text>
              </View>
              <View style={styles.metric}>
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {status?.checked_in_count ?? "—"}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.icon }]}>
                  Đã điểm danh
                </Text>
              </View>
              <View style={styles.metric}>
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {status?.pending_count ?? "—"}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.icon }]}>
                  Chờ điểm danh
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push(ROUTES.WORKSHOP_SCAN(workshopId))}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.primaryButtonText}>Mở máy quét QR</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push(`/workshop/${workshopId}/history` as Parameters<typeof router.push>[0])
            }
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.tabIconDefault,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Xem lịch sử điểm danh
            </Text>
          </Pressable>
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
              Quay về hàng đợi
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flexGrow: 1, padding: 20, gap: 14 },
  header: { gap: 8 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  title: { fontSize: 28, fontWeight: "800", lineHeight: 34 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hint: { fontSize: 14 },
  errorText: { color: "#EF4444", fontSize: 14, lineHeight: 20 },
  retryText: { fontSize: 13, fontWeight: "700", marginTop: 8 },
  metricRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  metric: { flex: 1, gap: 4 },
  metricValue: { fontSize: 24, fontWeight: "800" },
  metricLabel: { fontSize: 12 },
  actions: { gap: 12, marginTop: 4 },
  primaryButton: {
    alignItems: "center",
    borderRadius: 18,
    paddingVertical: 14,
  },
  primaryButtonText: { color: "white", fontSize: 15, fontWeight: "700" },
  secondaryButton: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: "700" },
});
