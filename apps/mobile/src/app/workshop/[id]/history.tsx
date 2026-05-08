import { desc, eq } from "drizzle-orm";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { createDatabaseClient } from "@/database/client";
import { checkinQueue } from "@/database/schema/checkin-queue.schema";
import type { CheckinQueueRecord, SyncStatus } from "@/database/types";
import { useColorScheme } from "@/hooks/use-color-scheme";

function getWorkshopId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface BadgeProps {
  status: SyncStatus;
}

function SyncBadge({ status }: BadgeProps) {
  const config: Record<SyncStatus, { label: string; color: string; bg: string }> = {
    PENDING:  { label: "Chưa đồng bộ", color: "#D97706", bg: "rgba(217,119,6,0.12)" },
    SYNCING:  { label: "Đang đồng bộ", color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
    SYNCED:   { label: "Đã đồng bộ",   color: "#16A34A", bg: "rgba(22,163,74,0.12)" },
    CONFLICT: { label: "Xung đột",      color: "#DC2626", bg: "rgba(220,38,38,0.12)" },
    FAILED:   { label: "Thất bại",      color: "#DC2626", bg: "rgba(220,38,38,0.12)" },
  };
  const c = config[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

export default function CheckinHistoryScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const workshopId = getWorkshopId(params.id);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const [records, setRecords] = useState<CheckinQueueRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workshopId) return;

    async function fetchRecords() {
      const db = createDatabaseClient();
      const rows = await db
        .select()
        .from(checkinQueue)
        .where(eq(checkinQueue.workshopId, workshopId))
        .orderBy(desc(checkinQueue.checkedInAt));
      setRecords(rows);
      setIsLoading(false);
    }

    void fetchRecords();
  }, [workshopId]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.tint }]}>
          LỊCH SỬ
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          Điểm danh local
        </Text>
        <Text style={[styles.subtitle, { color: colors.icon }]}>
          {records.length} bản ghi
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <Text style={[styles.hint, { color: colors.icon }]}>Đang tải...</Text>
        </View>
      ) : records.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Chưa có bản ghi nào
          </Text>
          <Text style={[styles.hint, { color: colors.icon }]}>
            Các lượt điểm danh sẽ xuất hiện ở đây sau khi quét QR.
          </Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.localId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View
              style={[styles.row, { borderColor: colors.tabIconDefault }]}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.studentName, { color: colors.text }]}>
                  {item.studentName}
                </Text>
                <Text style={[styles.studentCode, { color: colors.icon }]}>
                  {item.studentCode}
                </Text>
                <Text style={[styles.time, { color: colors.icon }]}>
                  {formatTime(item.checkedInAt)}
                </Text>
              </View>
              <SyncBadge status={item.syncStatus} />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 4 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  title: { fontSize: 26, fontWeight: "800" },
  subtitle: { fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "700" },
  hint: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  row: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  rowLeft: { flex: 1, gap: 2 },
  studentName: { fontSize: 15, fontWeight: "700" },
  studentCode: { fontSize: 12 },
  time: { fontSize: 11, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
