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
  sync: (workshopId: string) => Promise<void>;
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
    async (workshopId: string) => {
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

      const items = workshopPending.map((r) => ({
        qr_token: r.qrToken,
        workshop_id: r.workshopId,
        checked_in_at: new Date(r.checkedInAt).toISOString(),
        device_id: r.deviceId,
      }));

      const syncResult = await checkinApi.syncOffline(workshopId, items);

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

      // Server processes idempotently — mark all as SYNCED.
      // Conflicts are tracked server-side; we don't receive per-item feedback,
      // so we mark all as SYNCED and let the server's conflict count inform the UI.
      const now = Date.now();
      await db
        .update(checkinQueue)
        .set({ syncStatus: "SYNCED", syncedAt: now })
        .where(inArray(checkinQueue.localId, pendingIds));

      setRunStatus("done");
      await loadStats();
    },
    [loadStats]
  );

  return { stats, runStatus, errorMessage, sync, refresh: loadStats };
}
