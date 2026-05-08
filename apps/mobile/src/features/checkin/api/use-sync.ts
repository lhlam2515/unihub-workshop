import { eq, inArray } from "drizzle-orm";
import { useCallback, useEffect, useState } from "react";

import { createDatabaseClient } from "@/database/client";
import { checkinQueue } from "@/database/schema/checkin-queue.schema";
import { syncLog } from "@/database/schema/sync-log.schema";
import type { CheckinQueueRecord } from "@/database/types";
import handleError from "@/lib/handlers/error";

import { checkinApi } from "./checkin.service";

import type { SyncRunStatus, SyncStats, UseSyncResult } from "../lib/types";

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

      const syncStartedAt = Date.now();

      // Mark as SYNCING to prevent double-submit
      const pendingIds = workshopPending.map((r) => r.localId);
      await db
        .update(checkinQueue)
        .set({ syncStatus: "SYNCING" })
        .where(inArray(checkinQueue.localId, pendingIds));

      // Map to server-expected shape (qrCode is now the column name)
      const items = workshopPending.map((r) => ({
        localId: r.localId,
        qrCode: r.qrCode,
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

        // Record failure in sync_log
        const appError = handleError(syncResult.error);
        db.insert(syncLog).values({
          startedAt: syncStartedAt,
          completedAt: Date.now(),
          status: "FAILED",
          totalRecords: workshopPending.length,
          errorDetail: appError.message,
          workshopId,
        });

        setErrorMessage(appError.message);
        setRunStatus("error");
        await loadStats();
        return;
      }

      // Process per-item results from server
      let syncedCount = 0;
      let conflictCount = 0;
      let failedCount = 0;
      const now = Date.now();
      for (const item of syncResult.data.results) {
        if (item.result === "OK" || item.result === "DUPLICATE") {
          syncedCount++;
          await db
            .update(checkinQueue)
            .set({ syncStatus: "SYNCED", syncedAt: now })
            .where(eq(checkinQueue.localId, item.localId));
        } else {
          // REJECTED
          conflictCount++;
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

      // Finalize sync_log entry
      const finalStatus = conflictCount > 0 ? "PARTIAL" : "SUCCESS";
      db.insert(syncLog).values({
        startedAt: syncStartedAt,
        completedAt: now,
        status: finalStatus,
        totalRecords: workshopPending.length,
        syncedCount,
        conflictCount,
        failedCount,
        workshopId,
      });

      setRunStatus("done");
      await loadStats();
    },
    [loadStats]
  );

  return { stats, runStatus, errorMessage, sync, refresh: loadStats };
}
