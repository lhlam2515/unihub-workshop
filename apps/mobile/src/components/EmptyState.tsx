import { Text, View } from "react-native";

export interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <View className="items-center gap-3 rounded-3xl border border-border p-6">
      <Text className="text-lg font-bold text-foreground">{title}</Text>
      {description ? (
        <Text className="text-center text-sm leading-5 text-muted-foreground">
          {description}
        </Text>
      ) : null}
    </View>
  );
}
