import { eq } from "drizzle-orm";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CacheStatusBadge } from "@/components/CacheStatusBadge";
import ROUTES from "@/constants/routes";
import { createDatabaseClient } from "@/database/client";
import { cacheMetadata } from "@/database/schema/cache-metadata.schema";
import type { CacheMetadata } from "@/database/types";
import {
  checkinStatusService,
  type CheckinStatus,
} from "@/features/workshops/api/checkin-status.service";
import handleError from "@/lib/handlers/error";

function getWorkshopId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function WorkshopDashboardScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const workshopId = getWorkshopId(params.id);

  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localCache, setLocalCache] = useState<CacheMetadata | null>(null);

  useEffect(() => {
    if (!workshopId) return;
    void fetchStatus();

    // Read local cache metadata
    try {
      const db = createDatabaseClient();
      const cached = db
        .select()
        .from(cacheMetadata)
        .where(eq(cacheMetadata.workshopId, workshopId))
        .get();
      setLocalCache(cached ?? null);
    } catch {
      // Non-critical
    }
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
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow gap-3.5 p-5">
        <View className="gap-2">
          <Text className="text-xs font-bold tracking-widest text-primary">
            DASHBOARD
          </Text>
          <Text className="text-2xl font-extrabold leading-8 text-foreground">
            Workshop {workshopId.slice(0, 8)}
          </Text>
        </View>

        {/* Stale cache banner */}
        {localCache && localCache.cacheStatus === "STALE" ? (
          <View className="rounded-2xl border border-amber-400 bg-amber-400/10 p-3.5">
            <Text className="text-sm leading-5 text-amber-700">
              Dữ liệu cache đã cũ (&gt;30 phút). Đồng bộ lại để đảm bảo dữ liệu
              điểm danh chính xác.
            </Text>
          </View>
        ) : null}

        {/* Local cache summary */}
        {localCache ? (
          <View className="gap-3 rounded-3xl border border-border p-5">
            <Text className="text-lg font-bold text-foreground">
              Dữ liệu local
            </Text>
            <CacheStatusBadge cacheInfo={localCache} />
          </View>
        ) : null}

        <View className="gap-3 rounded-3xl border border-border p-5">
          <Text className="text-lg font-bold text-foreground">
            Tổng quan ca trực
          </Text>

          {isLoading ? (
            <View className="flex-row items-center gap-2.5">
              <ActivityIndicator />
              <Text className="text-sm text-muted-foreground">Đang tải...</Text>
            </View>
          ) : errorMessage ? (
            <View>
              <Text className="text-sm leading-5 text-red-500">
                {errorMessage}
              </Text>
              <Pressable onPress={fetchStatus}>
                <Text className="mt-2 text-sm font-bold text-primary">
                  Thử lại
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-row justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="text-2xl font-extrabold text-foreground">
                  {status?.confirmedCount ?? "—"}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Đã đăng ký
                </Text>
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-2xl font-extrabold text-foreground">
                  {status?.checkedInCount ?? "—"}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Đã điểm danh
                </Text>
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-2xl font-extrabold text-foreground">
                  {status?.pendingCount ?? "—"}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Chờ điểm danh
                </Text>
              </View>
            </View>
          )}
        </View>

        <View className="mt-1 gap-3">
          <Pressable
            onPress={() => router.push(ROUTES.WORKSHOP_SCAN(workshopId))}
            className="items-center justify-center rounded-2xl bg-primary py-3.5 active:opacity-85"
          >
            <Text className="text-base font-bold text-white">
              Mở máy quét QR
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push(
                `/workshop/${workshopId}/history` as Parameters<
                  typeof router.push
                >[0]
              )
            }
            className="items-center rounded-2xl border border-border py-3.5 active:opacity-85"
          >
            <Text className="text-base font-bold text-foreground">
              Xem lịch sử điểm danh
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(ROUTES.TAB_QUEUE)}
            className="items-center rounded-2xl border border-border py-3.5 active:opacity-85"
          >
            <Text className="text-base font-bold text-foreground">
              Quay về hàng đợi
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
