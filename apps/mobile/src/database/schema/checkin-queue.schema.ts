import {
  index,
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ============================================================
// BẢNG 2: checkin_queue
// Mục đích: Buffer lưu lượt check-in khi offline.
//           Khi online → batch POST lên /checkin/sync
//           Backend INSERT ON CONFLICT DO NOTHING.
// ============================================================

export const checkinQueue = sqliteTable(
  "checkin_queue",
  {
    // UUID sinh trên device — dùng làm local idempotency key
    localId: text("local_id").primaryKey().notNull(),

    // Data đủ để server reconstruct checkin_record
    qrToken: text("qr_token").notNull(),
    ticketId: text("ticket_id").notNull(),
    workshopId: text("workshop_id").notNull(),
    studentId: text("student_id").notNull(),
    studentName: text("student_name").notNull(),
    studentCode: text("student_code").notNull(),

    // Thời điểm quét thực tế trên device (offline time)
    checkedInAt: integer("checked_in_at", { mode: "number" }).notNull(), // Unix timestamp (ms)

    // Device context
    deviceId: text("device_id").notNull(),
    checkedInBy: text("checked_in_by").notNull(), // user_id của CHECKIN_STAFF (từ JWT)

    // Sync lifecycle
    // PENDING   → chưa sync lên server
    // SYNCING   → đang trong batch request (tránh double-submit)
    // SYNCED    → server đã nhận, ON CONFLICT DO NOTHING thành công
    // CONFLICT  → server báo vé đã VOID hoặc đã check-in bởi device khác
    // FAILED    → network/server error, sẽ retry
    syncStatus: text("sync_status", {
      enum: ["PENDING", "SYNCING", "SYNCED", "CONFLICT", "FAILED"],
    })
      .notNull()
      .default("PENDING"),

    // Thời điểm sync thành công / thất bại
    syncedAt: integer("synced_at", { mode: "number" }), // Unix timestamp (ms)

    // Lý do nếu CONFLICT hoặc FAILED
    errorDetail: text("error_detail"),

    // Số lần retry (dùng cho exponential backoff)
    retryCount: integer("retry_count", { mode: "number" }).notNull().default(0),

    // Timestamp ghi nhận trên device
    createdAt: integer("created_at", { mode: "number" }).notNull(), // Unix timestamp (ms)
  },
  (table) => [
    // Index chính — worker quét hàng đợi để sync
    index("idx_checkin_queue_sync_status").on(table.syncStatus),

    // Index để hiển thị lịch sử quét theo thứ tự thời gian (dashboard tại cửa)
    index("idx_checkin_queue_checked_in_at").on(table.checkedInAt),

    // Index để đếm nhanh số lượt đã quét theo workshop (stats màn hình)
    index("idx_checkin_queue_workshop").on(table.workshopId, table.syncStatus),

    // Ràng buộc local idempotency: cùng vé không thể quét 2 lần
    // Mirror UNIQUE(ticket_id, workshop_id) của server
    uniqueIndex("idx_checkin_queue_ticket_workshop").on(
      table.ticketId,
      table.workshopId
    ),
  ]
);
