import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { borderColor: colors.tabIconDefault }]}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            CHECKIN_STAFF
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>Đăng nhập</Text>
          <Text style={[styles.description, { color: colors.icon }]}>
            Màn hình khởi động cho luồng offline-first của nhân sự điểm danh.
            Đây là scaffold mặc định để nối sang tab chính sau khi xác thực.
          </Text>
        </View>

        <View style={[styles.card, { borderColor: colors.tabIconDefault }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Điểm neo điều hướng
          </Text>
          <Text style={[styles.cardBody, { color: colors.icon }]}>
            /login là cổng vào, /(tabs) giữ luồng chính, workshop/[id] xử lý
            check-in sâu, còn sync/progress mở dạng modal.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.replace(ROUTES.TABS)}
            style={({ pressed }) => [
              styles.primaryButton,
              { opacity: pressed ? 0.8 : 1, backgroundColor: colors.tint },
            ]}
          >
            <Text style={styles.primaryButtonText}>Vào tab Sự kiện</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(ROUTES.SYNC_PROGRESS)}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                opacity: pressed ? 0.85 : 1,
                borderColor: colors.tabIconDefault,
              },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Xem đồng bộ
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
    gap: 16,
    justifyContent: "center",
  },
  hero: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 24,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 18,
    paddingVertical: 15,
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
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
