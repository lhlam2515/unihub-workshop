import { Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import type { CacheMetadata } from "@/database/types";

export interface CacheStatusBadgeProps {
  cacheInfo: CacheMetadata | null;
}

export function CacheStatusBadge({ cacheInfo }: CacheStatusBadgeProps) {
  if (!cacheInfo) {
    return (
      <Badge variant="destructive">
        <Text>Chưa tải</Text>
      </Badge>
    );
  }

  const { isFullyLoaded, registrationCount } = cacheInfo;

  return (
    <View className="flex-row items-center gap-2">
      <Badge variant={isFullyLoaded ? "default" : "secondary"}>
        <Text>{isFullyLoaded ? "Đã tải" : "Một phần"}</Text>
      </Badge>
      <Text className="text-sm text-muted-foreground">
        {registrationCount} bản ghi
      </Text>
    </View>
  );
}
