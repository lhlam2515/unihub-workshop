import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ============================================================
// BẢNG 4: cache_metadata
// Mục đích: Track trạng thái cache của từng workshop.
//           Biết khi nào cache stale → cần re-fetch.
//           Biết workshop nào đã load xong → cho phép offline.
// ============================================================

export const cacheMetadata = sqliteTable("cache_metadata", {
  workshopId: text("workshop_id").primaryKey().notNull(),

  // Thời điểm fetch gần nhất từ server
  lastFetchedAt: integer("last_fetched_at", { mode: "number" }).notNull(), // Unix timestamp (ms)

  // Tổng số registration đã cache (để hiển thị progress)
  registrationCount: integer("registration_count", { mode: "number" })
    .notNull()
    .default(0),

  // Tổng số trên server (từ pagination.total — có thể null nếu server không trả)
  serverTotal: integer("server_total", { mode: "number" }),

  // Đã fetch hết tất cả pages chưa?
  isFullyLoaded: integer("is_fully_loaded", { mode: "boolean" })
    .notNull()
    .default(false),

  // Trạng thái cache
  // FRESH      → mới fetch, tin cậy
  // STALE      → quá 30 phút, nên re-fetch nếu có mạng
  // INVALID    → server báo stale (workshop bị update), cần re-fetch bắt buộc
  cacheStatus: text("cache_status", { enum: ["FRESH", "STALE", "INVALID"] })
    .notNull()
    .default("FRESH"),

  // ETag hoặc last_modified từ server (HTTP cache headers)
  // Dùng cho conditional request: If-None-Match để tiết kiệm bandwidth
  etag: text("etag"),
});
