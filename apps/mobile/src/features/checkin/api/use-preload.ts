import { eq } from "drizzle-orm";
import { useCallback, useState } from "react";

import { createDatabaseClient } from "@/database/client";
import { cachedTickets } from "@/database/schema/cached-tickets.schema";
import type { NewCachedTicket } from "@/database/types";
import handleError from "@/lib/handlers/error";

import { ticketsApi } from "./tickets.service";
import type { CachedRegistrationDto } from "./tickets.service";

export type PreloadStatus = "idle" | "loading" | "done" | "error";

export interface UsePreloadResult {
  status: PreloadStatus;
  errorMessage: string | null;
  preload: (workshopId: string) => Promise<void>;
}

/** Fetch all pages of registrations by following cursors. */
async function fetchAllRegistrations(
  workshopId: string
): Promise<CachedRegistrationDto[]> {
  const all: CachedRegistrationDto[] = [];
  let cursor: string | undefined;

  for (let i = 0; i < 10; i++) {
    const result = await ticketsApi.preload(workshopId, cursor, 500);
    if (result.isFailure) throw result.error;

    all.push(...result.data.data);
    if (!result.data.pagination.hasMore) break;
    cursor = result.data.pagination.nextCursor ?? undefined;
  }

  return all;
}

export function usePreload(): UsePreloadResult {
  const [status, setStatus] = useState<PreloadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const preload = useCallback(async (workshopId: string) => {
    setStatus("loading");
    setErrorMessage(null);

    let registrations: CachedRegistrationDto[];
    try {
      registrations = await fetchAllRegistrations(workshopId);
    } catch (err) {
      const appError = handleError(err);
      setErrorMessage(appError.message);
      setStatus("error");
      return;
    }

    const db = createDatabaseClient();

    // Replace the workshop's cached registrations atomically
    await db
      .delete(cachedTickets)
      .where(eq(cachedTickets.workshopId, workshopId));

    if (registrations.length > 0) {
      const rows: NewCachedTicket[] = registrations.map((r) => ({
        ticketId: r.registrationId,
        qrToken: r.qrCode,
        registrationId: r.registrationId,
        workshopId: r.workshopId,
        studentId: r.studentId,
        studentName: r.studentName,
        studentCode: r.studentCode,
        ticketStatus: "ACTIVE" as const,
        cachedAt: Date.now(),
        workshopStartsAt: new Date(r.workshopStartsAt).getTime(),
        workshopTitle: r.workshopTitle,
      }));

      await db.insert(cachedTickets).values(rows).onConflictDoNothing();
    }

    setStatus("done");
  }, []);

  return { status, errorMessage, preload };
}
