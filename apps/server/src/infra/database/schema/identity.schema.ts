import { index, pgTable, unique } from "drizzle-orm/pg-core";

import {
  platformEnum,
  staffRoleEnum,
  userRoleEnum,
  userStatusEnum,
} from "./enums.schema";

export const checkinStaffAssignments = pgTable(
  "checkin_staff_assignments",
  (t) => ({
    assignmentId: t.uuid("assignment_id").primaryKey().defaultRandom(),
    userId: t
      .uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    workshopIds: t
      .jsonb("workshop_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
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
    unique("uq_checkin_staff_assignments_user").on(table.userId),
    index("idx_checkin_staff_assignments_user").on(table.userId),
  ]
);

// Kept for backward compat with auth flow. New code should use `staff` table.
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

/**
 * Students — TEXT PK (student code from legacy system, e.g. "21127001").
 *
 * REF: ADR-02, ADR-12, `02_storage-strategy.md` L45-48.
 * TEXT PK enables CSV ON CONFLICT upsert without a separate code → UUID lookup.
 */
export const students = pgTable(
  "students",
  (t) => ({
    studentId: t.text("student_id").primaryKey(),
    email: t.text("email"),
    fullName: t.text("full_name").notNull(),
    passwordHash: t.text("password_hash"),
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [index("idx_students_email").on(table.email)]
);

/**
 * Staff — separate identity table for BTC organisers and check-in staff.
 *
 * REF: ADR-02 Section 4, `02_storage-strategy.md` L49-53.
 * Staff have a UUID PK (managed identity) and a dedicated lifecycle separate
 * from students. The `users` table is retained for auth backward compatibility.
 */
export const staff = pgTable(
  "staff",
  (t) => ({
    staffId: t.uuid("staff_id").primaryKey().defaultRandom(),
    email: t.text("email").notNull().unique(),
    fullName: t.text("full_name").notNull(),
    passwordHash: t.text("password_hash").notNull(),
    role: staffRoleEnum("role").notNull(),
    isActive: t.boolean("is_active").notNull().default(true),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    index("idx_staff_role").on(table.role).where(table.isActive),
    index("idx_staff_email").on(table.email),
  ]
);

/**
 * Device tokens for push notification delivery (FCM / APNs).
 *
 * REF: `02_storage-strategy.md` L55-72.
 * Each token belongs to a student and a platform. Tokens are soft-deactivated
 * rather than deleted so the notification system can detect stale tokens.
 */
export const deviceTokens = pgTable(
  "device_tokens",
  (t) => ({
    deviceTokenId: t.uuid("device_token_id").primaryKey().defaultRandom(),
    studentId: t
      .text("student_id")
      .notNull()
      .references(() => students.studentId, { onDelete: "cascade" }),
    token: t.text("token").notNull().unique(),
    platform: platformEnum("platform").notNull(),
    isActive: t.boolean("is_active").notNull().default(true),
    lastSeen: t
      .timestamp("last_seen", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    index("idx_device_tokens_student")
      .on(table.studentId)
      .where(table.isActive),
    index("idx_device_tokens_token").on(table.token),
  ]
);
