import {
  index,
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ============================================================
// BẢNG 1: cached_tickets
// Mục đích: Mirror danh sách Ticket ACTIVE từ server về local.
// Nguồn:    GET /checkin/workshops/{id}/tickets (khi online)
// Dùng để: Tra cứu qr_token khi offline — phải cực nhanh.
// ============================================================

export const cachedTickets = sqliteTable(
  "cached_tickets",
  {
    // PK từ server, không tự sinh
    ticketId: text("ticket_id").primaryKey().notNull(),

    // Data để validate khi quét QR
    qrToken: text("qr_token").notNull(),
    registrationId: text("registration_id").notNull(),
    workshopId: text("workshop_id").notNull(),

    // Hiển thị trên màn hình sau khi quét thành công
    studentName: text("student_name").notNull(),
    studentCode: text("student_code").notNull(),
    studentId: text("student_id").notNull(),

    // Trạng thái vé — chỉ cache ACTIVE, nhưng giữ field để
    // phát hiện nếu server trả về VOID trong lần sync sau
    ticketStatus: text("ticket_status", { enum: ["ACTIVE", "VOID"] })
      .notNull()
      .default("ACTIVE"),

    // Metadata cache
    cachedAt: integer("cached_at", { mode: "number" }).notNull(), // Unix timestamp (ms)
    workshopStartsAt: integer("workshop_starts_at", { mode: "number" }), // Unix timestamp (ms)
    workshopTitle: text("workshop_title"),
  },
  (table) => [
    // Index chính — đây là query hot nhất: lookup bằng qr_token khi quét QR
    // Phải là UNIQUE để tránh cache duplicate khi re-fetch
    uniqueIndex("idx_cached_tickets_qr_token").on(table.qrToken),

    // Index phụ — lọc theo workshop khi pre-load/invalidate cache
    index("idx_cached_tickets_workshop").on(table.workshopId),
  ]
);
