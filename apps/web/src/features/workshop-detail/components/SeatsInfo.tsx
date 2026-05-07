"use client";

import { Ticket } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { getWorkshopAvailability } from "@/lib/api/services/catalog";
import { cn } from "@/lib/utils";

interface SeatsInfoProps {
  workshopId: string;
  initialAvailable: number;
  initialTotal: number;
  pollInterval?: number; // ms, default 10000
  onlyWhenIdle?: boolean; // only poll when user is idle on page
}

export function SeatsInfo({
  workshopId,
  initialAvailable,
  initialTotal,
  pollInterval = 10000,
}: SeatsInfoProps) {
  const [seats, setSeats] = useState(initialAvailable);
  const [isPolling, setIsPolling] = useState(false);
  const mountedRef = useRef(true);

  const fetchAvailability = useCallback(async () => {
    const result = await getWorkshopAvailability(workshopId);
    if (result.isSuccess && mountedRef.current) {
      setSeats(result.data.seatsAvailable);
    }
  }, [workshopId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Polling
  useEffect(() => {
    if (pollInterval <= 0) return;

    const id = setInterval(async () => {
      setIsPolling(true);
      await fetchAvailability();
      setIsPolling(false);
    }, pollInterval);

    return () => clearInterval(id);
  }, [pollInterval, fetchAvailability]);

  const isFull = seats <= 0;
  const pct = initialTotal > 0 ? Math.round((seats / initialTotal) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Ticket className="size-4" />
          Chỗ ngồi
          {isPolling && (
            <span className="relative flex size-2">
              <span className="bg-primary absolute inline-flex size-full animate-ping rounded-full opacity-75" />
              <span className="bg-primary relative inline-flex size-2 rounded-full" />
            </span>
          )}
        </span>
        <Badge
          variant={isFull ? "destructive" : "secondary"}
          className={cn(
            "tabular-nums",
            !isFull &&
              "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
          )}
        >
          {seats}/{initialTotal}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isFull
              ? "bg-destructive"
              : pct < 30
                ? "bg-orange-500"
                : pct < 60
                  ? "bg-yellow-500"
                  : "bg-green-500"
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {isFull && (
        <p className="text-destructive text-xs">Workshop đã hết chỗ.</p>
      )}
    </div>
  );
}
