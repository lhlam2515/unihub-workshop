import { useFocusEffect } from "expo-router";
import { desc, eq } from "drizzle-orm";
import { useCallback, useState } from "react";

import { createDatabaseClient } from "@/database/client";
import { checkinQueue } from "@/database/schema/checkin-queue.schema";
import type { CheckinQueueRecord } from "@/database/types";

export interface UseCheckinHistoryResult {
  records: CheckinQueueRecord[];
  isLoading: boolean;
}

/**
 * Query the local checkin_queue table for records belonging to a workshop.
 * Re-queries every time the screen comes into focus.
 *
 * @param workshopId — UUID of the workshop to filter by
 */
export function useCheckinHistory(workshopId: string): UseCheckinHistoryResult {
  const [records, setRecords] = useState<CheckinQueueRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!workshopId) {
        setIsLoading(false);
        return;
      }

      const db = createDatabaseClient();
      const rows = db
        .select()
        .from(checkinQueue)
        .where(eq(checkinQueue.workshopId, workshopId))
        .orderBy(desc(checkinQueue.checkedInAt))
        .all();
      setRecords(rows);
      setIsLoading(false);
    }, [workshopId])
  );

  return { records, isLoading };
}
