import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

function getParam(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default function ResultScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    source?: string | string[];
    name?: string | string[];
    code?: string | string[];
  }>();
  const workshopId = getParam(params.id, "ws-demo");
  const source = getParam(params.source, "ONLINE");
  const studentName = decodeURIComponent(getParam(params.name, "—"));
  const studentCode = getParam(params.code, "—");
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const isOffline = source === "OFFLINE_QUEUED";
  const now = new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            M05 · KẾT QUẢ
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Kết quả quét cho {workshopId}
          </Text>
        </View>

        <View style={[styles.card, { borderColor: colors.tint }]}>
          <Text style={[styles.status, { color: colors.tint }]}>
            Check-in thành công
          </Text>
          <Text style={[styles.cardBody, { color: colors.icon }]}>
            {studentName} · {studentCode}
          </Text>
        </View>

        <View style={[styles.card, { borderColor: colors.tabIconDefault }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Chi tiết nhanh
          </Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.icon }]}>Time</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {now}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.icon }]}>
              Ghi nhận
            </Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {isOffline ? "Lưu local (offline)" : "Ghi nhận trực tiếp"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.icon }]}>
              Sync state
            </Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {isOffline ? "Chờ đồng bộ" : "Đã đồng bộ"}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.primaryButtonText}>Quét tiếp</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(ROUTES.WORKSHOP(workshopId))}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.tabIconDefault,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Về dashboard
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
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 10,
  },
  status: {
    fontSize: 20,
    fontWeight: "800",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "700",
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
