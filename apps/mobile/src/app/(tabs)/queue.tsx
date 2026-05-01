import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const queueItems = [
  {
    id: "q-01",
    title: "Check-in batch #174",
    detail: "24 bản ghi chờ đẩy lên server",
  },
  {
    id: "q-02",
    title: "Ticket revalidation",
    detail: "3 vé cần thử lại sau lỗi kết nối",
  },
  {
    id: "q-03",
    title: "Attendance snapshot",
    detail: "Bản sao local đã sẵn sàng đồng bộ",
  },
];

export default function QueueScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

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
                12
              </Text>
              <Text style={[styles.metricLabel, { color: colors.icon }]}>
                Pending
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                4
              </Text>
              <Text style={[styles.metricLabel, { color: colors.icon }]}>
                Failed retry
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                98%
              </Text>
              <Text style={[styles.metricLabel, { color: colors.icon }]}>
                Ready
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.list}>
          {queueItems.map((item) => (
            <View
              key={item.id}
              style={[styles.card, { borderColor: colors.tabIconDefault }]}
            >
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {item.title}
              </Text>
              <Text style={[styles.cardBody, { color: colors.icon }]}>
                {item.detail}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push(ROUTES.SYNC_PROGRESS)}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.primaryButtonText}>Đồng bộ ngay</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(ROUTES.WORKSHOP("ws-101"))}
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
  list: {
    gap: 12,
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
