import { Text, View } from "react-native";

import type { TicketDto } from "@/features/checkin/api/tickets.service";

interface TicketCardProps {
  ticket: TicketDto;
}

/**
 * Entity card displaying a ticket with workshop info, student details, and QR code.
 *
 * Used by the My Tickets screen (SCR-M99) to render each active ticket.
 */
export function TicketCard({ ticket }: TicketCardProps) {
  return (
    <View className="gap-2.5 rounded-3xl border border-border p-5">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-lg font-bold text-foreground">
          {ticket.workshop.title}
        </Text>
        <View className="rounded-full border border-primary px-2.5 py-1">
          <Text className="text-xs font-bold text-primary">
            {ticket.status}
          </Text>
        </View>
      </View>

      <View className="flex-row justify-between gap-3">
        <Text className="text-sm text-muted-foreground">Sinh viên</Text>
        <Text className="shrink text-right text-sm font-bold text-foreground">
          {ticket.student.fullName} · {ticket.student.studentCode}
        </Text>
      </View>
      <View className="flex-row justify-between gap-3">
        <Text className="text-sm text-muted-foreground">Bắt đầu</Text>
        <Text className="shrink text-right text-sm font-bold text-foreground">
          {new Date(ticket.workshop.startsAt).toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </Text>
      </View>

      {/* QR code block */}
      <View className="mt-1 gap-1.5 rounded-2xl bg-border/15 p-3.5">
        <Text className="text-[10px] font-bold tracking-widest text-muted-foreground">
          MÃ QR
        </Text>
        <Text
          className="font-mono text-sm leading-5 tracking-wide text-foreground"
          numberOfLines={2}
          selectable
        >
          {ticket.qrCode}
        </Text>
      </View>
    </View>
  );
}
