import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import ROUTES from "@/constants/routes";
import { createDatabaseClient } from "@/database/client";
import { appSession } from "@/database/schema/app-session.schema";
import { useAuth } from "@/features/auth/hooks/use-auth";

export default function ProfileScreen() {
  const { session, getPendingQueueCount, logout, isLoggingOut } = useAuth();
  const [localLoggingOut, setLocalLoggingOut] = useState(false);

  const db = createDatabaseClient();
  const storedSession = db.select().from(appSession).get();
  const email = storedSession?.email ?? null;

  const loggingOut = isLoggingOut || localLoggingOut;

  async function handleLogout() {
    const pendingCount = getPendingQueueCount();

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
                setLocalLoggingOut(true);
                logout().finally(() => resolve());
              },
            },
          ]
        );
      });
    }

    setLocalLoggingOut(true);
    await logout();
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow p-5 gap-3.5">
        <View className="gap-2 py-2">
          <Text className="text-2xl font-extrabold leading-8 text-foreground">
            Thông tin & cài đặt
          </Text>
        </View>

        <View className="gap-3 rounded-3xl border border-border bg-card p-5">
          <Text className="text-lg font-bold text-foreground">
            Người dùng hiện tại
          </Text>
          {session ? (
            <View className="gap-2.5">
              <View className="flex-row justify-between gap-3">
                <Text className="flex-1 text-sm text-muted-foreground">
                  Email
                </Text>
                <Text className="shrink text-right text-sm font-bold text-foreground">
                  {email ?? "—"}
                </Text>
              </View>
              <View className="flex-row justify-between gap-3">
                <Text className="flex-1 text-sm text-muted-foreground">
                  Vai trò
                </Text>
                <Text className="shrink text-right text-sm font-bold text-foreground">
                  {session.role}
                </Text>
              </View>
              <View className="flex-row justify-between gap-3">
                <Text className="flex-1 text-sm text-muted-foreground">
                  Workshop phân công
                </Text>
                <Text className="shrink text-right text-sm font-bold text-foreground">
                  {session.allowed_workshop_ids?.length ?? 0}
                </Text>
              </View>
              <View className="flex-row justify-between gap-3">
                <Text className="flex-1 text-sm text-muted-foreground">
                  Hết hạn phiên làm việc lúc
                </Text>
                <Text className="shrink text-right text-sm font-bold text-foreground">
                  {new Date(session.exp * 1000).toLocaleString("vi-VN", {
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          ) : (
            <Text className="text-sm leading-5 text-muted-foreground">
              Không có thông tin phiên đăng nhập.
            </Text>
          )}
        </View>

        <View className="mt-1 gap-3">
          <Button
            onPress={() => router.push(ROUTES.SYNC_PROGRESS)}
            className="rounded-2xl"
          >
            <Text>Mở tiến trình đồng bộ</Text>
          </Button>
          <Button
            variant="destructive"
            onPress={handleLogout}
            disabled={loggingOut}
            className="rounded-2xl"
          >
            {loggingOut ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text>Đăng xuất</Text>
            )}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
