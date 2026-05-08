import { eq, inArray } from "drizzle-orm";
import { useCallback, useEffect, useState } from "react";

import { createDatabaseClient } from "@/database/client";
import { checkinQueue } from "@/database/schema/checkin-queue.schema";
import type { CheckinQueueRecord } from "@/database/types";
import handleError from "@/lib/handlers/error";

import { checkinApi } from "./checkin.service";

export type SyncRunStatus = "idle" | "syncing" | "done" | "error";

export interface SyncStats {
  pending: number;
  synced: number;
  conflicts: number;
  failed: number;
}

export interface UseSyncResult {
  stats: SyncStats;
  runStatus: SyncRunStatus;
  errorMessage: string | null;
  sync: (workshopId: string, deviceId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSync(): UseSyncResult {
  const [stats, setStats] = useState<SyncStats>({
    pending: 0,
    synced: 0,
    conflicts: 0,
    failed: 0,
  });
  const [runStatus, setRunStatus] = useState<SyncRunStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    const db = createDatabaseClient();
    const all = await db.select().from(checkinQueue);
    setStats({
      pending: all.filter((r) => r.syncStatus === "PENDING").length,
      synced: all.filter((r) => r.syncStatus === "SYNCED").length,
      conflicts: all.filter((r) => r.syncStatus === "CONFLICT").length,
      failed: all.filter((r) => r.syncStatus === "FAILED").length,
    });
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const sync = useCallback(
    async (workshopId: string, deviceId: string) => {
      setRunStatus("syncing");
      setErrorMessage(null);

      const db = createDatabaseClient();

      // Fetch PENDING items for this workshop
      const pending: CheckinQueueRecord[] = await db
        .select()
        .from(checkinQueue)
        .where(eq(checkinQueue.syncStatus, "PENDING"));

      const workshopPending = pending.filter(
        (r) => r.workshopId === workshopId
      );

      if (workshopPending.length === 0) {
        setRunStatus("done");
        await loadStats();
        return;
      }

      // Mark as SYNCING to prevent double-submit
      const pendingIds = workshopPending.map((r) => r.localId);
      await db
        .update(checkinQueue)
        .set({ syncStatus: "SYNCING" })
        .where(inArray(checkinQueue.localId, pendingIds));

      // Map to server-expected shape
      const items = workshopPending.map((r) => ({
        localId: r.localId,
        qrCode: r.qrToken,
        workshopId: r.workshopId,
        checkedInAt: r.checkedInAt,
      }));

      const syncResult = await checkinApi.syncOffline(deviceId, items);

      if (syncResult.isFailure) {
        // Revert SYNCING → FAILED for retry on next attempt
        await db
          .update(checkinQueue)
          .set({ syncStatus: "FAILED", retryCount: 1 })
          .where(inArray(checkinQueue.localId, pendingIds));

        const appError = handleError(syncResult.error);
        setErrorMessage(appError.message);
        setRunStatus("error");
        await loadStats();
        return;
      }

      // Process per-item results from server
      const now = Date.now();
      for (const item of syncResult.data.results) {
        if (item.result === "OK" || item.result === "DUPLICATE") {
          await db
            .update(checkinQueue)
            .set({ syncStatus: "SYNCED", syncedAt: now })
            .where(eq(checkinQueue.localId, item.localId));
        } else {
          // REJECTED
          await db
            .update(checkinQueue)
            .set({
              syncStatus: "CONFLICT",
              errorDetail: item.reason ?? "REJECTED",
              syncedAt: now,
            })
            .where(eq(checkinQueue.localId, item.localId));
        }
      }

      setRunStatus("done");
      await loadStats();
    },
    [loadStats]
  );

  return { stats, runStatus, errorMessage, sync, refresh: loadStats };
}
