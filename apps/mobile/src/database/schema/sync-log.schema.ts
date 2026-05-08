import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ============================================================
// BẢNG 5: sync_log
// Mục đích: Audit trail của các lần sync — giúp debug
//           và hiển thị "Đồng bộ lần cuối: 5 phút trước"
// ============================================================

export const syncLog = sqliteTable("sync_log", {
  logId: integer("log_id").primaryKey({ autoIncrement: true }),

  // Thời điểm bắt đầu / kết thúc batch sync
  startedAt: integer("started_at", { mode: "number" }).notNull(), // Unix timestamp (ms)
  completedAt: integer("completed_at", { mode: "number" }),

  // Kết quả
  status: text("status", { enum: ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"] })
    .notNull()
    .default("RUNNING"),

  // Số liệu batch
  totalRecords: integer("total_records", { mode: "number" })
    .notNull()
    .default(0),
  syncedCount: integer("synced_count", { mode: "number" }).notNull().default(0),
  conflictCount: integer("conflict_count", { mode: "number" })
    .notNull()
    .default(0),
  failedCount: integer("failed_count", { mode: "number" }).notNull().default(0),

  // Lý do nếu FAILED (network error, 401, 5xx...)
  errorDetail: text("error_detail"),

  // Workshop scope — null = global sync (tất cả workshops)
  workshopId: text("workshop_id"),
});
