import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const steps = [
  { label: "Queue scan", state: "Done" },
  { label: "Prepare batch", state: "In progress" },
  { label: "Upload payload", state: "Pending" },
  { label: "Refresh dashboard", state: "Pending" },
];

export default function SyncProgressScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            M07 · MODAL
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Tiến độ đồng bộ
          </Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Màn hình blocking cho tiến trình sync, mở từ tab Sự kiện hoặc Hàng
            đợi khi cần xác nhận trạng thái đẩy dữ liệu.
          </Text>
        </View>

        <View style={[styles.card, { borderColor: colors.tabIconDefault }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Batch hiện tại
          </Text>
          <Text style={[styles.cardBody, { color: colors.icon }]}>
            54 bản ghi local đang chờ, 39 bản ghi đã hoàn thành, còn 15 bản ghi
            ở hàng đợi retry.
          </Text>
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
              </View>
            ))}
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
            <Text style={styles.primaryButtonText}>Đóng modal</Text>
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
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  stepList: {
    gap: 12,
  },
  stepRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
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
