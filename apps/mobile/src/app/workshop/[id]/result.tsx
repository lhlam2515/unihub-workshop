import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import ROUTES from "@/constants/routes";

function getParam(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default function ResultScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    source?: string | string[];
    name?: string | string[];
    code?: string | string[];
    duplicate?: string | string[];
    originalAt?: string | string[];
  }>();
  const workshopId = getParam(params.id, "ws-demo");
  const source = getParam(params.source, "ONLINE");
  const studentName = decodeURIComponent(getParam(params.name, "—"));
  const studentCode = getParam(params.code, "—");
  const isDuplicate = getParam(params.duplicate, "0") === "1";
  const originalAt = getParam(params.originalAt, "");

  const isOffline = source === "OFFLINE_QUEUED";
  const now = new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow p-5 gap-3.5">
        <View className="gap-2.5">
          <Text className="text-2xl font-extrabold leading-8 text-foreground">
            Kết quả điểm danh
          </Text>
        </View>

        {isDuplicate ? (
          <View className="gap-2.5 rounded-3xl border border-yellow-500 bg-yellow-500/10 p-5">
            <Text className="text-xl font-extrabold text-yellow-500">
              Đã điểm danh trước đó
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {studentName} · {studentCode}
            </Text>
            {originalAt ? (
              <Text className="text-xs text-muted-foreground">
                Lần đầu:{" "}
                {new Date(originalAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="gap-2.5 rounded-3xl border border-primary p-5">
            <Text className="text-xl font-extrabold text-primary">
              Check-in thành công
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {studentName} · {studentCode}
            </Text>
          </View>
        )}

        <View className="gap-2.5 rounded-3xl border border-border bg-card p-5">
          <Text className="text-lg font-bold text-foreground">
            Chi tiết nhanh
          </Text>
          <View className="flex-row justify-between gap-3">
            <Text className="text-sm text-muted-foreground">Time</Text>
            <Text className="text-sm font-bold text-foreground">{now}</Text>
          </View>
          <View className="flex-row justify-between gap-3">
            <Text className="text-sm text-muted-foreground">Ghi nhận</Text>
            <Text className="text-sm font-bold text-foreground">
              {isOffline ? "Lưu local (offline)" : "Ghi nhận trực tiếp"}
            </Text>
          </View>
          <View className="flex-row justify-between gap-3">
            <Text className="text-sm text-muted-foreground">Sync state</Text>
            <Text className="text-sm font-bold text-foreground">
              {isOffline ? "Chờ đồng bộ" : "Đã đồng bộ"}
            </Text>
          </View>
        </View>

        <View className="mt-1 gap-3">
          <Button
            onPress={() =>
              router.replace(
                `/workshop/${workshopId}/scan` as Parameters<typeof router.replace>[0]
              )
            }
            className="rounded-2xl"
          >
            <Text>Quét tiếp</Text>
          </Button>
          <Button
            variant="outline"
            onPress={() => router.back()}
            className="rounded-2xl"
          >
            <Text>Về dashboard</Text>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
