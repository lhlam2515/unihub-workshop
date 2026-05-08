import { Pressable, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { CacheMetadata } from "@/database/types";
import type { WorkshopDetailDto } from "@/features/workshops/api/workshops.service";

export interface WorkshopCardProps {
  workshop: WorkshopDetailDto;
  cacheInfo?: CacheMetadata;
  onPress: (workshopId: string) => void;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("vi-VN", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkshopCard({
  workshop,
  cacheInfo,
  onPress,
}: WorkshopCardProps) {
  const cacheLabel = !cacheInfo
    ? "Chưa tải"
    : cacheInfo.isFullyLoaded
      ? "Đã tải"
      : "Một phần";
  const cacheVariant = !cacheInfo
    ? "destructive"
    : cacheInfo.isFullyLoaded
      ? "default"
      : "secondary";

  return (
    <Pressable onPress={() => onPress(workshop.workshopId)}>
      <Card>
        <CardHeader>
          <Text className="text-lg font-bold text-card-foreground">
            {workshop.title}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {workshop.speakerName}
          </Text>
        </CardHeader>
        <CardContent className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-muted-foreground">
              {formatDate(workshop.startsAt)}
            </Text>
            <Badge variant={cacheVariant}>
              <Text>{cacheLabel}</Text>
            </Badge>
          </View>
          <Badge variant="outline">
            <Text>{workshop.availableSeats} chỗ</Text>
          </Badge>
        </CardContent>
      </Card>
    </Pressable>
  );
}
