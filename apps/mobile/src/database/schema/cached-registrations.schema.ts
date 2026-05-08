import {
  index,
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ============================================================
// BẢNG 1: cached_registrations
// Mục đích: Mirror danh sách Registration PAID/CONFIRMED từ server về local.
// Nguồn:    GET /checkin/workshops/{id}/registrations (khi online)
// Dùng để: Tra cứu qr_code khi offline — phải cực nhanh.
// ============================================================

export const RegistrationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;
export type RegistrationStatus =
  (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

export const cachedRegistrations = sqliteTable(
  "cached_registrations",
  {
    // PK từ server, không tự sinh
    registrationId: text("registration_id").primaryKey().notNull(),

    // Data để validate khi quét QR
    qrCode: text("qr_code").notNull(),
    workshopId: text("workshop_id").notNull(),

    // Hiển thị trên màn hình sau khi quét thành công
    studentName: text("student_name").notNull(),
    studentCode: text("student_code").notNull(),
    studentId: text("student_id").notNull(),

    // Trạng thái registration — chỉ cache PAID/CONFIRMED, nhưng giữ field để
    // phát hiện nếu server trả về CANCELLED trong lần sync sau
    registrationStatus: text("registration_status", {
      enum: ["PENDING", "CONFIRMED", "PAID", "CANCELLED"],
    })
      .notNull()
      .default("PAID"),

    // Metadata cache
    cachedAt: integer("cached_at", { mode: "number" }).notNull(), // Unix timestamp (ms)
    workshopStartsAt: integer("workshop_starts_at", { mode: "number" }), // Unix timestamp (ms)
    workshopTitle: text("workshop_title"),
  },
  (table) => [
    // Index chính — đây là query hot nhất: lookup bằng qr_code khi quét QR
    // Phải là UNIQUE để tránh cache duplicate khi re-fetch
    uniqueIndex("idx_cached_registrations_qr_code").on(table.qrCode),

    // Index phụ — lọc theo workshop khi pre-load/invalidate cache
    index("idx_cached_registrations_workshop").on(table.workshopId),
  ]
);
