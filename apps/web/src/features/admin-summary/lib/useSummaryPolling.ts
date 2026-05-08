"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import { getAiSummary } from "@/lib/api/services/admin";
import type { AiSummary } from "@/types/workshop";

import { POLL_INTERVAL_MS } from "./constants";

export function useSummaryPolling(
  workshopId: string,
  initial: AiSummary | null
) {
  const [summary, setSummary] = useState<AiSummary | null>(initial);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    setIsPolling(true);
    intervalRef.current = setInterval(async () => {
      const result = await getAiSummary(workshopId);
      if (result.isSuccess) {
        setSummary(result.data);
        setError(null);
        if (result.data.status === "DONE" || result.data.status === "FAILED") {
          stopPolling();
        }
      } else {
        setError("Không thể lấy trạng thái AI Tóm tắt");
      }
    }, POLL_INTERVAL_MS);
  }, [workshopId, stopPolling]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Start polling if initial status is active
  useEffect(() => {
    if (summary?.status === "QUEUED" || summary?.status === "PROCESSING") {
      startPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { summary, setSummary, isPolling, error, startPolling, stopPolling };
}
