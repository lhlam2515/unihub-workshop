import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
  }>();
  const workshopId = getParam(params.id, "ws-demo");
  const source = getParam(params.source, "ONLINE");
  const studentName = decodeURIComponent(getParam(params.name, "—"));
  const studentCode = getParam(params.code, "—");

  const isOffline = source === "OFFLINE_QUEUED";
  const now = new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow p-5 gap-3.5">
        <View className="gap-2.5">
          <Text className="text-xs font-bold tracking-widest text-primary">
            M05 · KẾT QUẢ
          </Text>
          <Text className="text-2xl font-extrabold leading-8 text-foreground">
            Kết quả quét cho {workshopId}
          </Text>
        </View>

        <View className="gap-2.5 rounded-3xl border border-primary p-5">
          <Text className="text-xl font-extrabold text-primary">
            Check-in thành công
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {studentName} · {studentCode}
          </Text>
        </View>

        <View className="gap-2.5 rounded-3xl border border-border p-5">
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
          <Pressable
            onPress={() => router.back()}
            className="items-center justify-center rounded-2xl bg-primary px-5 py-3.5 active:opacity-85"
          >
            <Text className="text-base font-bold text-white">Quét tiếp</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(ROUTES.WORKSHOP(workshopId))}
            className="items-center rounded-2xl border border-border py-3.5 active:opacity-85"
          >
            <Text className="text-base font-bold text-foreground">
              Về dashboard
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
