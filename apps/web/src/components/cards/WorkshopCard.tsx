"use client";

import { Clock, MapPin, Ticket, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WorkshopListItem } from "@/types/workshop";

interface WorkshopCardProps {
  workshop: WorkshopListItem;
  onClick?: () => void;
  className?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function WorkshopCard({
  workshop,
  onClick,
  className,
}: WorkshopCardProps) {
  const isFull = workshop.seatsAvailable <= 0;
  const isFree = workshop.price === 0;
  const isCancelled = workshop.status === "CANCELLED";

  return (
    <Card
      size="sm"
      className={cn(
        "cursor-pointer transition-shadow hover:shadow-lg",
        isCancelled && "opacity-60",
        className
      )}
      onClick={isCancelled ? undefined : onClick}
      role="button"
      tabIndex={isCancelled ? -1 : 0}
      onKeyDown={(e) => {
        if (!isCancelled && (e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-disabled={isCancelled}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{workshop.title}</CardTitle>
            <CardDescription>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatDate(workshop.startsAt)} &middot;{" "}
                {formatTime(workshop.startsAt)} &ndash;{" "}
                {formatTime(workshop.endsAt)}
              </span>
            </CardDescription>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {workshop.isRegistered && (
              <Badge variant="default" className="bg-green-600 text-white">
                Đã đăng ký
              </Badge>
            )}
            {isCancelled && <Badge variant="destructive">Đã hủy</Badge>}
            {isFull && !workshop.isRegistered && (
              <Badge variant="secondary">Hết chỗ</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-3">
          {/* Speaker */}
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              {workshop.speaker?.avatarUrl ? (
                <AvatarImage
                  src={workshop.speaker.avatarUrl}
                  alt={workshop.speaker.fullName}
                />
              ) : (
                <AvatarFallback>
                  {workshop.speaker ? (
                    getInitials(workshop.speaker.fullName)
                  ) : (
                    <User className="size-3" />
                  )}
                </AvatarFallback>
              )}
            </Avatar>
            <span className="text-muted-foreground truncate text-xs">
              {workshop.speaker?.fullName ?? "Đang cập nhật"}
              {workshop.speaker?.title && (
                <span className="text-muted-foreground/60">
                  {" "}
                  &middot; {workshop.speaker.title}
                </span>
              )}
            </span>
          </div>

          {/* Room + Seats + Price */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <MapPin className="size-3" />
              {workshop.room
                ? `${workshop.room.name}${workshop.room.building ? ` - ${workshop.room.building}` : ""}`
                : "Đang cập nhật"}
            </span>

            <div className="flex items-center gap-3">
              {/* Seats */}
              <span
                className={cn(
                  "flex items-center gap-1 text-xs",
                  isFull ? "text-destructive" : "text-muted-foreground"
                )}
              >
                <Ticket className="size-3" />
                {workshop.seatsAvailable}/{workshop.seatsTotal}
              </span>

              {/* Price */}
              <span className="text-xs font-medium">
                {isFree
                  ? "Miễn phí"
                  : `${workshop.price.toLocaleString("vi-VN")} ₫`}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
