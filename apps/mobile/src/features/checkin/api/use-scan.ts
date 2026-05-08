import { eq } from "drizzle-orm";
import { useCallback, useState } from "react";

import { createDatabaseClient } from "@/database/client";
import { cachedRegistrations } from "@/database/schema/cached-registrations.schema";
import { checkinQueue } from "@/database/schema/checkin-queue.schema";
import type { NewCheckinQueueRecord } from "@/database/types";
import { isApiError } from "@/lib/api/errors";
import handleError from "@/lib/handlers/error";

import { checkinApi } from "./checkin.service";

import type { ScanResult, ScanStatus, UseScanResult } from "../lib/types";

export function useScan(): UseScanResult {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scan = useCallback(
    async (
      qrToken: string,
      workshopId: string,
      deviceId: string,
      staffId: string
    ) => {
      setStatus("scanning");
      setErrorMessage(null);
      setResult(null);

      // Optimistic online attempt: try server first. Fall back to SQLite queue
      // if the request fails due to a network error (not a business error).
      const clientLocalId = crypto.randomUUID();
      const scanResult = await checkinApi.scanOnline(
        qrToken,
        workshopId,
        clientLocalId
      );

      if (scanResult.isSuccess) {
        const data = scanResult.data;
        setResult({
          checkinId: data.id,
          studentName: data.student?.name ?? "—",
          studentCode: data.student?.code ?? "—",
          checkedInAt: new Date(data.checkedInAt),
          source: "ONLINE",
        });
        setStatus("success");
        return;
      }

      // If the failure is a known business error (ticket VOID, already checked in,
      // scope denied), surface it to staff immediately — don't fall back to offline.
      const err = scanResult.error;
      if (
        isApiError(err) &&
        err.status !== 0 &&
        !err.message.includes("Network request failed")
      ) {
        const appError = handleError(err);
        setErrorMessage(appError.message);
        setStatus("error");
        return;
      }

      // Network-level failure → fall through to offline path below.

      // Offline path: validate against SQLite cache, then queue
      const db = createDatabaseClient();
      const [registration] = await db
        .select()
        .from(cachedRegistrations)
        .where(eq(cachedRegistrations.qrCode, qrToken))
        .limit(1);

      if (!registration) {
        setErrorMessage(
          "Không tìm thấy vé trong bộ nhớ cache. Vui lòng tải lại khi có mạng."
        );
        setStatus("error");
        return;
      }

      if (registration.registrationStatus === "CANCELLED") {
        setErrorMessage("Vé này đã bị hủy và không hợp lệ.");
        setStatus("error");
        return;
      }

      const now = Date.now();
      const record: NewCheckinQueueRecord = {
        localId: crypto.randomUUID(),
        qrCode: registration.qrCode,
        registrationId: registration.registrationId,
        workshopId: registration.workshopId,
        studentId: registration.studentId,
        studentName: registration.studentName,
        studentCode: registration.studentCode,
        checkedInAt: now,
        deviceId,
        checkedInBy: staffId,
        syncStatus: "PENDING",
        syncedAt: null,
        errorDetail: null,
        retryCount: 0,
        createdAt: now,
      };

      try {
        // ON CONFLICT DO NOTHING mirrors the server-side deduplication.
        // If the same ticket was already queued for this workshop, ignore.
        await db.insert(checkinQueue).values(record).onConflictDoNothing();
      } catch {
        setErrorMessage("Không thể ghi vào hàng đợi. Vui lòng thử lại.");
        setStatus("error");
        return;
      }

      setResult({
        studentName: registration.studentName,
        studentCode: registration.studentCode,
        checkedInAt: new Date(now),
        source: "OFFLINE_QUEUED",
      });
      setStatus("success");
    },
    []
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setErrorMessage(null);
  }, []);

  return { status, result, errorMessage, scan, reset };
}
