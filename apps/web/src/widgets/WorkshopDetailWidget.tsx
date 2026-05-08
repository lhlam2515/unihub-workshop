import { ArrowLeft, CalendarDays, Clock } from "lucide-react";
import Link from "next/link";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ROUTES from "@/constants/routes";
import { AISummaryPanel } from "@/features/workshop-detail/components/AISummaryPanel";
import { RegisterButton } from "@/features/workshop-detail/components/RegisterButton";
import { RoomInfo } from "@/features/workshop-detail/components/RoomInfo";
import { SeatsInfo } from "@/features/workshop-detail/components/SeatsInfo";
import { SpeakerBio } from "@/features/workshop-detail/components/SpeakerBio";
import type { WorkshopDetail } from "@/types/workshop";

interface WorkshopDetailWidgetProps {
  workshopId: string;
  workshop: WorkshopDetail | null;
  error?: string;
}

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("vi-VN", {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

function getDuration(start: string, end: string): string {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const minutes = Math.round((e - s) / 60000);
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
}

/**
 * Workshop detail page orchestrator.
 *
 * Pure presentational widget — receives all data via props.
 * Composes SpeakerBio, RoomInfo, AISummaryPanel, SeatsInfo, RegisterButton.
 */
export function WorkshopDetailWidget({
  workshopId,
  workshop,
  error,
}: WorkshopDetailWidgetProps) {
  // Loading skeleton
  if (!workshop && !error) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        <div className="bg-muted h-8 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
        <div className="space-y-2">
          <div className="bg-muted h-3 w-full animate-pulse rounded" />
          <div className="bg-muted h-3 w-5/6 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !workshop) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <ErrorDisplay error={error} variant="banner" />
        <Link
          href={ROUTES.WORKSHOPS}
          className="text-muted-foreground hover:text-foreground mt-4 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  if (!workshop) return null;

  const start = formatDateTime(workshop.startsAt);
  const end = formatDateTime(workshop.endsAt);
  const duration = getDuration(workshop.startsAt, workshop.endsAt);
  const isFree = workshop.price === 0;
  const isCancelled = workshop.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={ROUTES.WORKSHOPS}
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Quay lại danh sách
      </Link>

      {isCancelled && (
        <div className="bg-destructive/10 border-destructive/20 mb-6 rounded-xl border p-4">
          <p className="text-destructive text-sm font-medium">
            Workshop này đã bị hủy.
          </p>
        </div>
      )}

      <article className={isCancelled ? "opacity-60" : ""}>
        {/* Hero */}
        <div className="mb-8 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{workshop.title}</h1>
            <Badge
              variant={
                workshop.status === "CANCELLED"
                  ? "destructive"
                  : workshop.status === "OPEN"
                    ? "default"
                    : "secondary"
              }
            >
              {workshop.status === "OPEN"
                ? "Đang mở"
                : workshop.status === "COMPLETED"
                  ? "Đã đóng"
                  : workshop.status === "CANCELLED"
                    ? "Đã hủy"
                    : "Nháp"}
            </Badge>
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              {start.date}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" />
              {start.time} &ndash; {end.time}
            </span>
            <span className="text-muted-foreground/60">({duration})</span>
          </div>

          <p className="text-lg font-semibold">
            {isFree
              ? "Miễn phí"
              : `${workshop.price.toLocaleString("vi-VN")} ₫`}
          </p>
        </div>

        {/* Description */}
        {workshop.description && (
          <section className="mb-8 space-y-3">
            <h2 className="text-lg font-semibold">Mô tả</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {workshop.description}
            </p>
          </section>
        )}

        <Separator className="mb-8" />

        <div className="mb-8 space-y-8">
          <SeatsInfo
            workshopId={workshopId}
            initialAvailable={workshop.seatsAvailable}
            initialTotal={workshop.seatsTotal}
          />
          <AISummaryPanel summary={workshop.summary} />
          <SpeakerBio speaker={workshop.speaker} />
          <RoomInfo room={workshop.room} />
        </div>

        <div className="bg-background sticky bottom-0 border-t py-4">
          <RegisterButton workshop={workshop} />
        </div>
      </article>
    </div>
  );
}
