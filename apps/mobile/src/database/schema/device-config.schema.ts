import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ============================================================
// BẢNG 6: device_config
// Mục đích: Cấu hình device — giữ device_id ổn định
//           qua các phiên login/logout.
//           Singleton: chỉ 1 row duy nhất (id = 1).
// ============================================================

export const deviceConfig = sqliteTable("device_config", {
  id: integer("id").primaryKey().notNull().default(1),

  // UUID v4 — sinh 1 lần, giữ nguyên suốt vòng đời app
  deviceId: text("device_id").notNull(),

  // Phiên bản app khi khởi tạo (dùng debug)
  appVersion: text("app_version").notNull(),

  // Thời điểm khởi tạo lần đầu
  initializedAt: integer("initialized_at", { mode: "number" }).notNull(),
});
