import { index, pgTable, unique } from "drizzle-orm/pg-core";

import { students } from "./identity.schema";

export const deviceTokens = pgTable(
  "device_tokens",
  (t) => ({
    deviceTokenId: t.uuid("device_token_id").primaryKey().defaultRandom(),
    studentId: t
      .uuid("student_id")
      .notNull()
      .references(() => students.studentId, { onDelete: "cascade" }),
    token: t.varchar("token", { length: 500 }).notNull(),
    platform: t.varchar("platform", { length: 10 }).notNull(),
    isActive: t.boolean("is_active").notNull().default(true),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: t
      .timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    unique("uq_device_tokens_token").on(table.token),
    index("idx_device_tokens_student").on(table.studentId),
  ]
);
