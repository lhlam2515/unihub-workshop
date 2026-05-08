import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useMyTickets } from "@/features/checkin/hooks/use-my-tickets";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function MyTicketsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { tickets, isLoading, errorMessage, reload } = useMyTickets();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            VÉ CỦA TÔI
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Danh sách vé đang hoạt động
          </Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Các vé ACTIVE gắn với tài khoản của bạn. Xuất trình mã QR tại cửa
            vào để check-in.
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : errorMessage ? (
          <View style={[styles.card, { borderColor: "#F87171" }]}>
            <Text style={[styles.cardTitle, { color: "#F87171" }]}>
              Không thể tải vé
            </Text>
            <Text style={[styles.cardBody, { color: colors.icon }]}>
              {errorMessage}
            </Text>
            <Pressable
              onPress={() => void reload()}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.primaryButtonText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : tickets.length === 0 ? (
          <View style={[styles.card, { borderColor: colors.tabIconDefault }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Chưa có vé
            </Text>
            <Text style={[styles.cardBody, { color: colors.icon }]}>
              Bạn chưa đăng ký workshop nào hoặc chưa có vé ACTIVE.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {tickets.map((ticket) => (
              <View
                key={ticket.ticketId}
                style={[styles.card, { borderColor: colors.tabIconDefault }]}
              >
                <View style={styles.ticketHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {ticket.workshop.title}
                  </Text>
                  <Text
                    style={[
                      styles.badge,
                      { color: colors.tint, borderColor: colors.tint },
                    ]}
                  >
                    {ticket.status}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.icon }]}>
                    Sinh viên
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {ticket.student.fullName} · {ticket.student.studentCode}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.icon }]}>
                    Bắt đầu
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {new Date(ticket.workshop.startsAt).toLocaleDateString(
                      "vi-VN",
                      { day: "2-digit", month: "2-digit", year: "numeric" }
                    )}
                  </Text>
                </View>

                {/* QR token display — shown as a scannable-text code block */}
                <View
                  style={[
                    styles.qrBox,
                    { backgroundColor: colors.tabIconDefault + "22" },
                  ]}
                >
                  <Text style={[styles.qrLabel, { color: colors.icon }]}>
                    MÃ QR
                  </Text>
                  <Text
                    style={[styles.qrToken, { color: colors.text }]}
                    numberOfLines={2}
                    selectable
                  >
                    {ticket.qrCode}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            onPress={() => void reload()}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.tabIconDefault,
                opacity: pressed || isLoading ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Tải lại
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.tabIconDefault,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Quay lại
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
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
  list: {
    gap: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 10,
  },
  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "700",
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
    flexShrink: 1,
    textAlign: "right",
  },
  qrBox: {
    borderRadius: 16,
    padding: 14,
    gap: 6,
    marginTop: 4,
  },
  qrLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  qrToken: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.5,
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
