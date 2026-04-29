import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, check } from "drizzle-orm/sqlite-core";

// ============================================================
// BẢNG 3: app_session
// Mục đích: Lưu JWT + session context để hoạt động offline.
//           Chỉ có đúng 1 row (single-user app).
//           Token nhạy cảm → chỉ lưu non-sensitive fields,
//           raw token string lưu trong Expo SecureStore.
// ============================================================

export const appSession = sqliteTable(
  "app_session",
  {
    // Singleton row
    id: integer("id").primaryKey().notNull().default(1),

    // Identity (decode từ JWT payload, không cần gọi server)
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: ["CHECKIN_STAFF"] })
      .notNull()
      .default("CHECKIN_STAFF"),

    // Scope — danh sách workshop được phân công (từ JWT payload)
    // Lưu dạng JSON string: ["wid-1", "wid-2"]
    // Parse ở application layer khi đọc
    allowedWorkshopIds: text("allowed_workshop_ids").notNull().default("[]"),

    // Token expiry — dùng để check offline nếu còn hạn không
    // Không lưu raw token ở đây — lưu trong Expo SecureStore
    accessTokenExp: integer("access_token_exp", { mode: "number" }).notNull(), // Unix timestamp (giây)
    refreshTokenExp: integer("refresh_token_exp", { mode: "number" }).notNull(), // Unix timestamp (giây)

    // SecureStore keys — reference đến nơi lưu raw token
    // App dùng key này để gọi SecureStore.getItemAsync(key)
    accessTokenKey: text("access_token_key")
      .notNull()
      .default("unihub_access_token"),
    refreshTokenKey: text("refresh_token_key")
      .notNull()
      .default("unihub_refresh_token"),

    // Thời điểm login và cập nhật session
    loggedInAt: integer("logged_in_at", { mode: "number" }).notNull(), // Unix timestamp (ms)
    updatedAt: integer("updated_at", { mode: "number" }).notNull(), // Unix timestamp (ms)
  },
  (table) => [
    // Chỉ cho phép đúng 1 row
    check("chk_singleton", sql`${table.id} = 1`),
  ]
);
