import type { appSession } from "./schema/app-session.schema";
import type { cacheMetadata } from "./schema/cache-metadata.schema";
import type { cachedTickets } from "./schema/cached-tickets.schema";
import type { checkinQueue } from "./schema/checkin-queue.schema";
import type { syncLog } from "./schema/sync-log.schema";

// ── cached_tickets ──────────────────────────────────────────
export type CachedTicket = typeof cachedTickets.$inferSelect;
export type NewCachedTicket = typeof cachedTickets.$inferInsert;

// ── checkin_queue ───────────────────────────────────────────
export type CheckinQueueRecord = typeof checkinQueue.$inferSelect;
export type NewCheckinQueueRecord = typeof checkinQueue.$inferInsert;

// ── app_session ─────────────────────────────────────────────
export type AppSession = typeof appSession.$inferSelect;
export type NewAppSession = typeof appSession.$inferInsert;

// ── cache_metadata ──────────────────────────────────────────
export type CacheMetadata = typeof cacheMetadata.$inferSelect;
export type NewCacheMetadata = typeof cacheMetadata.$inferInsert;

// ── sync_log ────────────────────────────────────────────────
export type SyncLogEntry = typeof syncLog.$inferSelect;
export type NewSyncLogEntry = typeof syncLog.$inferInsert;

// ── Enums (literal unions) ──────────────────────────────────
export type TicketStatus = CachedTicket["ticketStatus"];
export type SyncStatus = CheckinQueueRecord["syncStatus"];
export type CacheStatus = CacheMetadata["cacheStatus"];
export type SyncLogStatus = SyncLogEntry["status"];
