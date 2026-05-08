import { inArray } from "drizzle-orm";
import { router } from "expo-router";
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

import { EmptyState } from "@/components/EmptyState";
import { WorkshopCard } from "@/components/WorkshopCard";
import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { createDatabaseClient } from "@/database/client";
import { cacheMetadata } from "@/database/schema/cache-metadata.schema";
import type { CacheMetadata } from "@/database/types";
import { usePreload } from "@/features/checkin/hooks/use-preload";
import {
  workshopsService,
  type WorkshopDetailDto,
} from "@/features/workshops/api/workshops.service";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { offlineAuth } from "@/lib/api/client/offline-auth";
import handleError from "@/lib/handlers/error";

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { preload } = usePreload();

  const [workshops, setWorkshops] = useState<WorkshopDetailDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<Map<string, CacheMetadata>>(
    new Map()
  );

  useEffect(() => {
    async function loadWorkshops() {
      setIsLoading(true);
      setErrorMessage(null);

      const workshopIds = offlineAuth.getAllowedWorkshops();

      if (workshopIds.length === 0) {
        setIsLoading(false);
        return;
      }

      const results = await workshopsService.getWorkshopsByIds(workshopIds);
      const successful = results.filter((r) => r.isSuccess).map((r) => r.data);

      const failed = results.filter((r) => r.isFailure);
      if (failed.length > 0 && successful.length === 0) {
        const appError = handleError(failed[0]!.error);
        setErrorMessage(appError.message);
      }

      setWorkshops(successful);

      // Query local cache metadata for badge display
      if (successful.length > 0) {
        try {
          const db = createDatabaseClient();
          const cacheRows = db
            .select()
            .from(cacheMetadata)
            .where(
              inArray(
                cacheMetadata.workshopId,
                successful.map((w) => w.workshopId)
              )
            )
            .all();
          const map = new Map<string, CacheMetadata>();
          for (const row of cacheRows) {
            map.set(row.workshopId, row);
          }
          setCacheInfo(map);
        } catch {
          // Non-critical: badges won't show but app works
        }
      }

      setIsLoading(false);
    }

    void loadWorkshops();
  }, []);

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
            Workshop được phân công
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.tint} size="large" />
            <Text style={[styles.hint, { color: colors.icon }]}>
              Đang tải danh sách...
            </Text>
          </View>
        ) : errorMessage ? (
          <View
            style={[
              styles.errorBox,
              {
                borderColor: "#EF4444",
                backgroundColor: "rgba(239,68,68,0.08)",
              },
            ]}
          >
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : workshops.length === 0 ? (
          <EmptyState
            title="Chưa có workshop nào"
            description="Tài khoản của bạn chưa được phân công workshop nào. Liên hệ quản trị viên để được cấp quyền."
          />
        ) : (
          <View style={styles.section}>
            {workshops.map((workshop) => (
              <WorkshopCard
                key={workshop.workshopId}
                workshop={workshop}
                cacheInfo={cacheInfo.get(workshop.workshopId)}
                onPress={handleWorkshopPress}
              />
            ))}
          </View>
        )}

        <View
          style={[styles.quickCard, { borderColor: colors.tabIconDefault }]}
        >
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>
            Hành động nhanh
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
  safeArea: { flex: 1 },
  content: { flexGrow: 1, padding: 20, gap: 12 },
  header: { gap: 8, paddingVertical: 8 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  title: { fontSize: 28, fontWeight: "800", lineHeight: 34 },
  center: { alignItems: "center", gap: 12, paddingVertical: 40 },
  hint: { fontSize: 14 },
  errorBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  errorText: { color: "#EF4444", fontSize: 14, lineHeight: 20 },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    gap: 10,
    alignItems: "center",
  },
  section: { gap: 12 },
  quickCard: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 14 },
  quickActions: { gap: 10 },
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
