import { inArray } from "drizzle-orm";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { WorkshopCard } from "@/components/WorkshopCard";
import ROUTES from "@/constants/routes";
import { createDatabaseClient } from "@/database/client";
import { cacheMetadata } from "@/database/schema/cache-metadata.schema";
import type { CacheMetadata } from "@/database/types";
import { usePreload } from "@/features/checkin/hooks/use-preload";
import {
  workshopsService,
  type WorkshopDetailDto,
} from "@/features/workshops/api/workshops.service";
import { offlineAuth } from "@/lib/api/client/offline-auth";
import { handleError } from "@/lib/handlers/error";

export default function HomeScreen() {
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
                successful.map((w) => w.id)
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
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow gap-3 p-5">
        <View className="gap-2 py-2">
          <Text className="text-2xl font-extrabold leading-8 text-foreground">
            Workshop được phân công
          </Text>
        </View>

        {isLoading ? (
          <View className="items-center gap-3 py-10">
            <ActivityIndicator size="large" />
            <Text className="text-sm text-muted-foreground">
              Đang tải danh sách...
            </Text>
          </View>
        ) : errorMessage ? (
          <View className="rounded-2xl border border-red-500 bg-red-500/10 p-4">
            <Text className="text-sm leading-5 text-red-500">
              {errorMessage}
            </Text>
          </View>
        ) : workshops.length === 0 ? (
          <EmptyState
            title="Chưa có workshop nào"
            description="Tài khoản của bạn chưa được phân công workshop nào. Liên hệ quản trị viên để được cấp quyền."
          />
        ) : (
          <View className="gap-3">
            {workshops.map((workshop) => (
              <WorkshopCard
                key={workshop.id}
                workshop={workshop}
                cacheInfo={cacheInfo.get(workshop.id)}
                onPress={handleWorkshopPress}
              />
            ))}
          </View>
        )}

        <View className="gap-3.5 rounded-3xl border border-border bg-card p-5">
          <Text className="text-lg font-bold text-foreground">
            Hành động nhanh
          </Text>
          <View className="gap-2.5">
            <Button
              onPress={() => router.push(ROUTES.SYNC_PROGRESS)}
              className="rounded-2xl"
            >
              <Text>Đồng bộ ngay</Text>
            </Button>
            <Button
              variant="outline"
              onPress={() => router.push(ROUTES.TAB_QUEUE)}
              className="rounded-2xl"
            >
              <Text>Mở hàng đợi</Text>
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
