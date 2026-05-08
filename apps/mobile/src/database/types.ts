import type { appSession } from "./schema/app-session.schema";
import type { cacheMetadata } from "./schema/cache-metadata.schema";
import type { cachedRegistrations } from "./schema/cached-registrations.schema";
import type { checkinQueue } from "./schema/checkin-queue.schema";
import type { deviceConfig } from "./schema/device-config.schema";
import type { syncLog } from "./schema/sync-log.schema";

// ── cached_registrations ────────────────────────────────────
export type CachedRegistration = typeof cachedRegistrations.$inferSelect;
export type NewCachedRegistration = typeof cachedRegistrations.$inferInsert;

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

// ── device_config ───────────────────────────────────────────
export type DeviceConfig = typeof deviceConfig.$inferSelect;
export type NewDeviceConfig = typeof deviceConfig.$inferInsert;

// ── Enums (literal unions) ──────────────────────────────────
export type RegistrationStatus = CachedRegistration["registrationStatus"];
export type SyncStatus = CheckinQueueRecord["syncStatus"];
export type CacheStatus = CacheMetadata["cacheStatus"];
export type SyncLogStatus = SyncLogEntry["status"];
