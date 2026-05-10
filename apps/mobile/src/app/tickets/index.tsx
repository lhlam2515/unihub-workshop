import { router } from "expo-router";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TicketCard } from "@/components/TicketCard";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useMyTickets } from "@/features/checkin/hooks/use-my-tickets";

export default function MyTicketsScreen() {
  const { tickets, isLoading, errorMessage, reload } = useMyTickets();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow p-5 gap-3.5">
        <View className="gap-2.5">
          <Text className="text-2xl font-extrabold leading-8 text-foreground">
            Danh sách vé đang hoạt động
          </Text>
          <Text className="text-base leading-6 text-muted-foreground">
            Các vé ACTIVE gắn với tài khoản của bạn. Xuất trình mã QR tại cửa
            vào để check-in.
          </Text>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center py-10">
            <ActivityIndicator size="large" />
          </View>
        ) : errorMessage ? (
          <View className="gap-2.5 rounded-3xl border border-red-400 p-5">
            <Text className="text-lg font-bold text-red-400">
              Không thể tải vé
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {errorMessage}
            </Text>
            <Button onPress={() => void reload()} className="rounded-2xl">
              <Text>Thử lại</Text>
            </Button>
          </View>
        ) : tickets.length === 0 ? (
          <View className="gap-2.5 rounded-3xl border border-border p-5">
            <Text className="text-lg font-bold text-foreground">
              Chưa có vé
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Bạn chưa đăng ký workshop nào hoặc chưa có vé ACTIVE.
            </Text>
          </View>
        ) : (
          <View className="gap-3.5">
            {tickets.map((ticket) => (
              <TicketCard key={ticket.ticketId} ticket={ticket} />
            ))}
          </View>
        )}

        <View className="mt-1 gap-3">
          <Button
            variant="outline"
            onPress={() => void reload()}
            disabled={isLoading}
            className="rounded-2xl"
          >
            <Text>Tải lại</Text>
          </Button>
          <Button
            variant="outline"
            onPress={() => router.back()}
            className="rounded-2xl"
          >
            <Text>Quay lại</Text>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
