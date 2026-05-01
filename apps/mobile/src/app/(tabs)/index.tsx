import { router } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { usePreload } from "@/features/checkin/api/use-preload";
import { useColorScheme } from "@/hooks/use-color-scheme";

const workshops = [
  {
    id: "ws-101",
    name: "Workshop Check-in Basics",
    status: "Sẵn sàng quét",
    summary: "Đã đồng bộ dữ liệu ca trực gần nhất.",
  },
  {
    id: "ws-202",
    name: "Offline Queue Drill",
    status: "Chờ xác nhận",
    summary: "Có 12 bản ghi local đang đợi đẩy lên server.",
  },
  {
    id: "ws-303",
    name: "Safety and Evacuation",
    status: "Đang diễn ra",
    summary: "Mở dashboard để quét vé ngay tại cửa vào.",
  },
];

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { preload } = usePreload();

  function handleWorkshopPress(workshopId: string) {
    router.push(ROUTES.WORKSHOP(workshopId));
    void preload(workshopId);
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            TAB SỰ KIỆN
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Danh sách workshop được phân công
          </Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Điểm vào chính của CHECKIN_STAFF, nơi điều phối hành trình từ danh
            sách sự kiện sang luồng quét QR chi tiết.
          </Text>
        </View>

        <View style={styles.section}>
          {workshops.map((workshop) => (
            <Pressable
              key={workshop.id}
              onPress={() => handleWorkshopPress(workshop.id)}
              style={({ pressed }) => [
                styles.card,
                {
                  borderColor: colors.tabIconDefault,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {workshop.name}
              </Text>
              <Text style={[styles.cardBody, { color: colors.icon }]}>
                {workshop.summary}
              </Text>
              <View style={styles.cardFooter}>
                <Text
                  style={[
                    styles.badge,
                    { color: colors.tint, borderColor: colors.tint },
                  ]}
                >
                  {workshop.status}
                </Text>
                <Text style={[styles.link, { color: colors.tint }]}>
                  Mở dashboard
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={[styles.card, { borderColor: colors.tabIconDefault }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Hành động nhanh
          </Text>
          <Text style={[styles.cardBody, { color: colors.icon }]}>
            Từ đây có thể đi sang dashboard workshop, mở màn hình đồng bộ hoặc
            kiểm tra lại hàng đợi offline.
          </Text>
          <View style={styles.quickActions}>
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
              onPress={() => router.push(ROUTES.TAB_QUEUE)}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: colors.tabIconDefault,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={[styles.secondaryButtonText, { color: colors.text }]}
              >
                Mở hàng đợi
              </Text>
            </Pressable>
          </View>
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
    gap: 8,
  },
  header: {
    gap: 10,
    paddingVertical: 8,
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
  section: {
    gap: 12,
    marginTop: 8,
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
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: "700",
  },
  link: {
    fontSize: 13,
    fontWeight: "700",
  },
  quickActions: {
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
