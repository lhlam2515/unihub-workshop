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
import type { WorkshopStatus } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const STATUS_CONFIG: Record<
  WorkshopStatus,
  {
    variant: "secondary" | "default" | "outline" | "destructive";
    label: string;
  }
> = {
  DRAFT: { variant: "secondary", label: "Bản nháp" },
  OPEN: { variant: "default", label: "Đang mở" },
  COMPLETED: { variant: "outline", label: "Hoàn thành" },
  CANCELLED: { variant: "destructive", label: "Đã hủy" },
};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

interface WorkshopCardRootProps {
  children: React.ReactNode;
  className?: string;
}

function WorkshopCardRoot({ children, className }: WorkshopCardRootProps) {
  return (
    <Card
      data-testid="workshop-card"
      size="sm"
      className={cn("transition-shadow hover:shadow-lg", className)}
    >
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface HeaderProps {
  title: string;
  status: WorkshopStatus;
  startsAt: string;
  endsAt: string;
}

function Header({ title, status, startsAt, endsAt }: HeaderProps) {
  const { variant, label } = STATUS_CONFIG[status];

  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <CardTitle data-testid="workshop-title" className="truncate">
            {title}
          </CardTitle>
          <CardDescription>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {formatDate(startsAt)} &middot; {formatTime(startsAt)} &ndash;{" "}
              {formatTime(endsAt)}
            </span>
          </CardDescription>
        </div>

        <div className="shrink-0">
          <Badge variant={variant}>{label}</Badge>
        </div>
      </div>
    </CardHeader>
  );
}

// ---------------------------------------------------------------------------
// Meta (speaker)
// ---------------------------------------------------------------------------

interface MetaProps {
  speakerName?: string | null;
  speakerTitle?: string | null;
  speakerAvatarUrl?: string | null;
}

function Meta({ speakerName, speakerTitle, speakerAvatarUrl }: MetaProps) {
  return (
    <CardContent>
      <div data-testid="workshop-speaker" className="flex items-center gap-2">
        <Avatar size="sm">
          {speakerAvatarUrl && speakerName ? (
            <AvatarImage src={speakerAvatarUrl} alt={speakerName} />
          ) : (
            <AvatarFallback>
              {speakerName ? (
                getInitials(speakerName)
              ) : (
                <User className="size-3" />
              )}
            </AvatarFallback>
          )}
        </Avatar>
        <span className="text-muted-foreground truncate text-xs">
          {speakerName ?? "Đang cập nhật"}
          {speakerTitle && (
            <span className="text-muted-foreground/60">
              {" "}
              &middot; {speakerTitle}
            </span>
          )}
        </span>
      </div>
    </CardContent>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

interface FooterProps {
  roomName?: string | null;
  roomBuilding?: string | null;
  seatsAvailable: number;
  seatsTotal: number;
  price: number;
  children?: React.ReactNode;
}

function Footer({
  roomName,
  roomBuilding,
  seatsAvailable,
  seatsTotal,
  price,
  children,
}: FooterProps) {
  const isFull = seatsAvailable <= 0;
  const isFree = price === 0;

  const roomLabel = roomName
    ? `${roomName}${roomBuilding ? ` - ${roomBuilding}` : ""}`
    : "Đang cập nhật";

  return (
    <CardContent>
      <div className="flex items-center justify-between gap-2">
        <span
          data-testid="workshop-room"
          className="text-muted-foreground flex items-center gap-1 text-xs"
        >
          <MapPin className="size-3" />
          {roomLabel}
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
            {seatsAvailable}/{seatsTotal}
          </span>

          {/* Price */}
          <span className="text-xs font-medium">
            {isFree ? "Miễn phí" : `${price.toLocaleString("vi-VN")} ₫`}
          </span>
        </div>
      </div>

      {children}
    </CardContent>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const WorkshopCard = Object.assign(WorkshopCardRoot, {
  Header,
  Meta,
  Footer,
});
