import { index, pgTable, unique } from "drizzle-orm/pg-core";

import { userRoleEnum, userStatusEnum } from "./enums.schema";

export const users = pgTable(
  "users",
  (t) => ({
    userId: t.uuid("user_id").primaryKey().defaultRandom(),
    email: t.varchar("email", { length: 255 }).notNull(),
    passwordHash: t.varchar("password_hash", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull(),
    status: userStatusEnum("status").notNull().default("PENDING_VERIFICATION"),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    unique("uq_users_email").on(table.email),
    index("idx_users_email").on(table.email),
    index("idx_users_role").on(table.role),
  ]
);

export const students = pgTable(
  "students",
  (t) => ({
    studentId: t.uuid("student_id").primaryKey().defaultRandom(),
    userId: t.uuid("user_id").references(() => users.userId, {
      onDelete: "set null",
    }),
    studentCode: t.varchar("student_code", { length: 20 }).notNull(),
    fullName: t.varchar("full_name", { length: 255 }).notNull(),
    faculty: t.varchar("faculty", { length: 100 }),
    classYear: t.smallint("class_year"),
    emailEdu: t.varchar("email_edu", { length: 255 }),
    lastSyncedAt: t.timestamp("last_synced_at", { withTimezone: true }),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    unique("uq_students_student_code").on(table.studentCode),
    unique("uq_students_user_id").on(table.userId),
    index("idx_students_user_id").on(table.userId),
    index("idx_students_student_code").on(table.studentCode),
    index("idx_students_email_edu").on(table.emailEdu),
  ]
);
