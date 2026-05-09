import { MapPin } from "lucide-react";

import type { Room } from "@/types/workshop";

interface RoomInfoProps {
  room: Room | null;
}

export function RoomInfo({ room }: RoomInfoProps) {
  if (!room) return null;

  const facilityLabels: Record<string, string> = {
    projector: "Máy chiếu",
    ac: "Điều hòa",
    mic: "Mic",
    speakers: "Loa",
    wifi: "WiFi",
    whiteboard: "Bảng trắng",
  };

  const facilities = Object.entries(room.facilities ?? {})
    .filter(([, v]) => v)
    .map(([k]) => facilityLabels[k] ?? k);

  return (
    <section data-testid="workshop-room" className="space-y-3">
      <h2 className="text-lg font-semibold">Phòng học</h2>

      <div className="flex items-start gap-2">
        <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{room.name}</p>
          {room.building && (
            <p className="text-muted-foreground text-sm">
              {room.building}
              {room.floor ? ` · Tầng ${room.floor}` : ""}
            </p>
          )}
          {room.capacity > 0 && (
            <p className="text-muted-foreground text-sm">
              Sức chứa: {room.capacity} người
            </p>
          )}
        </div>
      </div>

      {room.floorPlanUrl && (
        <div className="overflow-hidden rounded-xl border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={room.floorPlanUrl}
            alt={`Sơ đồ phòng ${room.name}`}
            className="h-auto w-full object-cover"
          />
        </div>
      )}

      {facilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {facilities.map((f) => (
            <span
              key={f}
              className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs font-medium"
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
