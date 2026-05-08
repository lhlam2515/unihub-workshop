import { eq } from "drizzle-orm";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { createDatabaseClient } from "@/database/client";
import { checkinQueue } from "@/database/schema/checkin-queue.schema";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { logout } from "@/lib/api/client";
import { offlineAuth } from "@/lib/api/client/offline-auth";

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const payload = offlineAuth.getTokenPayload();

  async function handleLogout() {
    // Check for pending sync records before allowing logout
    try {
      const db = createDatabaseClient();
      const pendingCount = db
        .select()
        .from(checkinQueue)
        .where(eq(checkinQueue.syncStatus, "PENDING"))
        .all().length;

      if (pendingCount > 0) {
        return new Promise<void>((resolve) => {
          Alert.alert(
            "Cảnh báo",
            `Còn ${pendingCount} bản ghi chưa được đồng bộ. Vui lòng đồng bộ trước khi đăng xuất.`,
            [
              {
                text: "Đồng bộ ngay",
                onPress: () => {
                  router.push(ROUTES.SYNC_PROGRESS);
                  resolve();
                },
              },
              {
                text: "Vẫn đăng xuất",
                style: "destructive",
                onPress: () => {
                  setIsLoggingOut(true);
                  logout()
                    .then(() => router.replace(ROUTES.LOGIN))
                    .catch(() => router.replace(ROUTES.LOGIN));
                  resolve();
                },
              },
            ]
          );
        });
      }
    } catch {
      // Non-critical: proceed with logout
    }

    setIsLoggingOut(true);
    await logout();
    router.replace(ROUTES.LOGIN);
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            TAB HỒ SƠ
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Thông tin & cài đặt
          </Text>
        </View>

        <View style={[styles.card, { borderColor: colors.tabIconDefault }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Người dùng hiện tại
          </Text>
          {payload ? (
            <View style={styles.infoGroup}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.icon }]}>
                  User ID
                </Text>
                <Text
                  style={[styles.infoValue, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {payload.sub}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.icon }]}>
                  Vai trò
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {payload.role}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.icon }]}>
                  Workshop phân công
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {payload.allowedWorkshopIds?.length ?? 0}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.icon }]}>
                  Hết hạn lúc
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {new Date(payload.exp * 1000).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.cardBody, { color: colors.icon }]}>
              Không có thông tin phiên đăng nhập.
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push(ROUTES.SYNC_PROGRESS)}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.primaryButtonText}>Mở tiến trình đồng bộ</Text>
          </Pressable>
          <Pressable
            onPress={handleLogout}
            disabled={isLoggingOut}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: "#EF4444",
                opacity: pressed || isLoggingOut ? 0.7 : 1,
              },
            ]}
          >
            {isLoggingOut ? (
              <ActivityIndicator color="#EF4444" size="small" />
            ) : (
              <Text style={[styles.secondaryButtonText, { color: "#EF4444" }]}>
                Đăng xuất
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flexGrow: 1, padding: 20, gap: 14 },
  header: { gap: 8, paddingVertical: 8 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  title: { fontSize: 28, fontWeight: "800", lineHeight: 34 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  cardBody: { fontSize: 14, lineHeight: 20 },
  infoGroup: { gap: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: "700", flex: 2, textAlign: "right" },
  actions: { gap: 12, marginTop: 4 },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 14,
    minHeight: 50,
  },
  primaryButtonText: { color: "white", fontSize: 15, fontWeight: "700" },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    minHeight: 50,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: "700" },
});
