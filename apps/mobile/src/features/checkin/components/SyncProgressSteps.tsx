import { ActivityIndicator, Text, View } from "react-native";

import type { SyncRunStatus } from "../lib/types";

export interface QueueStats {
  pending: number;
  synced: number;
  conflicts: number;
  failed: number;
}

export interface SyncProgressStepsProps {
  stats: QueueStats;
  runStatus: SyncRunStatus;
  errorMessage: string | null;
}

export function SyncProgressSteps({
  stats,
  runStatus,
  errorMessage,
}: SyncProgressStepsProps) {
  const steps = [
    {
      label: "Đọc hàng đợi local",
      state: runStatus === "idle" ? "Sẵn sàng" : "Hoàn thành",
    },
    {
      label: "Chuẩn bị batch",
      state:
        runStatus === "syncing"
          ? "Đang xử lý"
          : runStatus === "done"
            ? "Hoàn thành"
            : "Chờ",
    },
    {
      label: "Đẩy lên server",
      state:
        runStatus === "syncing"
          ? "Đang xử lý"
          : runStatus === "done"
            ? "Hoàn thành"
            : runStatus === "error"
              ? "Thất bại"
              : "Chờ",
    },
    {
      label: "Cập nhật trạng thái local",
      state: runStatus === "done" ? "Hoàn thành" : "Chờ",
    },
  ];

  return (
    <>
      <View className="gap-3 rounded-3xl border border-border p-5">
        <Text className="text-lg font-bold text-foreground">
          Thống kê hàng đợi
        </Text>
        <View className="flex-row justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-2xl font-extrabold text-foreground">
              {stats.pending}
            </Text>
            <Text className="text-xs text-muted-foreground">Chờ sync</Text>
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-2xl font-extrabold text-foreground">
              {stats.synced}
            </Text>
            <Text className="text-xs text-muted-foreground">Đã sync</Text>
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-2xl font-extrabold text-foreground">
              {stats.conflicts}
            </Text>
            <Text className="text-xs text-muted-foreground">Xung đột</Text>
          </View>
        </View>
        {errorMessage ? (
          <Text className="text-sm text-[#F87171]">{errorMessage}</Text>
        ) : null}
      </View>

      <View className="gap-3 rounded-3xl border border-border p-5">
        <Text className="text-lg font-bold text-foreground">
          Các bước đồng bộ
        </Text>
        <View className="gap-3">
          {steps.map((step, i) => (
            <View key={step.label} className="flex-row items-center gap-3">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-primary">
                <Text className="text-center text-sm font-extrabold text-primary-foreground">
                  {i + 1}
                </Text>
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-base font-bold text-foreground">
                  {step.label}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {step.state}
                </Text>
              </View>
              {runStatus === "syncing" && i === 2 ? (
                <ActivityIndicator size="small" />
              ) : null}
            </View>
          ))}
        </View>
      </View>
    </>
  );
}
