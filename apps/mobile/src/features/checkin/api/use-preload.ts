import { eq } from "drizzle-orm";
import { useCallback, useState } from "react";

import { createDatabaseClient } from "@/database/client";
import { cacheMetadata } from "@/database/schema/cache-metadata.schema";
import { cachedRegistrations } from "@/database/schema/cached-registrations.schema";
import type { NewCachedRegistration } from "@/database/types";
import handleError from "@/lib/handlers/error";

import { ticketsApi } from "./tickets.service";

import type { CachedRegistrationDto } from "./tickets.service";
import type { PreloadStatus, UsePreloadResult } from "../lib/types";

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
      .delete(cachedRegistrations)
      .where(eq(cachedRegistrations.workshopId, workshopId));

    if (registrations.length > 0) {
      const rows: NewCachedRegistration[] = registrations.map((r) => ({
        registrationId: r.registrationId,
        qrCode: r.qrCode,
        workshopId: r.workshopId,
        studentId: r.studentId,
        studentName: r.studentName,
        studentCode: r.studentCode,
        registrationStatus: "PAID",
        cachedAt: Date.now(),
        workshopStartsAt: new Date(r.workshopStartsAt).getTime(),
        workshopTitle: r.workshopTitle,
      }));

      await db.insert(cachedRegistrations).values(rows).onConflictDoNothing();
    }

    // Update cache_metadata — track what we just loaded
    const lastPage =
      registrations.length > 0
        ? await ticketsApi.preload(workshopId, undefined, 1)
        : null;
    const serverTotal = lastPage?.isSuccess
      ? lastPage.data.pagination.total
      : null;

    await db
      .insert(cacheMetadata)
      .values({
        workshopId,
        registrationCount: registrations.length,
        serverTotal,
        isFullyLoaded: registrations.length < 5000, // assume fully loaded unless paginated
        cacheStatus: "FRESH",
        lastFetchedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: cacheMetadata.workshopId,
        set: {
          registrationCount: registrations.length,
          serverTotal,
          cacheStatus: "FRESH",
          lastFetchedAt: Date.now(),
        },
      });

    setStatus("done");
  }, []);

  return { status, errorMessage, preload };
}
