import { eq } from "drizzle-orm";
import { useCallback, useState } from "react";

import { createDatabaseClient } from "@/database/client";
import { cachedTickets } from "@/database/schema/cached-tickets.schema";
import type { NewCachedTicket } from "@/database/types";
import handleError from "@/lib/handlers/error";

import { ticketsApi } from "./tickets.service";

export type PreloadStatus = "idle" | "loading" | "done" | "error";

export interface UsePreloadResult {
  status: PreloadStatus;
  errorMessage: string | null;
  preload: (workshopId: string) => Promise<void>;
}

export function usePreload(): UsePreloadResult {
  const [status, setStatus] = useState<PreloadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const preload = useCallback(async (workshopId: string) => {
    setStatus("loading");
    setErrorMessage(null);

    const result = await ticketsApi.preload(workshopId);

    if (result.isFailure) {
      const appError = handleError(result.error);
      setErrorMessage(appError.message);
      setStatus("error");
      return;
    }

    const db = createDatabaseClient();
    const tickets = result.data;

    // Replace the workshop's cached tickets atomically:
    // delete stale rows for this workshop, then insert fresh ones.
    await db
      .delete(cachedTickets)
      .where(eq(cachedTickets.workshopId, workshopId));

    if (tickets.length > 0) {
      const rows: NewCachedTicket[] = tickets.map((t) => ({
        ticketId: t.ticket_id,
        qrToken: t.qr_token,
        registrationId: t.registration_id,
        workshopId: t.workshop.workshop_id,
        studentId: t.student.student_id,
        studentName: t.student.full_name,
        studentCode: t.student.student_code,
        ticketStatus: "ACTIVE" as const,
        cachedAt: Date.now(),
        workshopStartsAt: new Date(t.workshop.starts_at).getTime(),
        workshopTitle: t.workshop.title,
      }));

      await db.insert(cachedTickets).values(rows).onConflictDoNothing();
    }

    setStatus("done");
  }, []);

  return { status, errorMessage, preload };
}
