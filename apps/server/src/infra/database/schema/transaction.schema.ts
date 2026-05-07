import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  checkinSourceEnum,
  paymentGatewayEnum,
  paymentStatusEnum,
  registrationStatusEnum,
  ticketStatusEnum,
} from "./enums.schema";
import { workshops } from "./event-core.schema";
import { students, users } from "./identity.schema";

// ---------------------------------------------------------------------------
// Idempotency Keys (ADR-08)
// ---------------------------------------------------------------------------

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  (t) => ({
    key: t.text("key").primaryKey(),
    resourceType: t.text("resource_type", { enum: ["REGISTRATION", "PAYMENT"] })
      .notNull(),
    status: t
      .text("status", {
        enum: ["IN_PROGRESS", "COMPLETED", "UNRESOLVED"],
      })
      .notNull()
      .default("IN_PROGRESS"),
    responseBody: t.jsonb("response_body"),
    statusCode: t.integer("status_code"),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: t.timestamp("expires_at", { withTimezone: true }).notNull(),
    lockedUntil: t.timestamp("locked_until", { withTimezone: true }),
  }),
  (table) => [index("idx_idempotency_expires").on(table.expiresAt)]
);

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export const registrations = pgTable(
  "registrations",
  (t) => ({
    registrationId: t.uuid("registration_id").primaryKey().defaultRandom(),
    studentId: t
      .text("student_id")
      .notNull()
      .references(() => students.studentId),
    workshopId: t
      .uuid("workshop_id")
      .notNull()
      .references(() => workshops.workshopId),
    status: registrationStatusEnum("status")
      .notNull()
      .default("PENDING"),
    qrCode: t.text("qr_code").notNull().unique(),
    registeredAt: t
      .timestamp("registered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: t.timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: t.timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: t.text("cancellation_reason"),
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    uniqueIndex("uq_registrations_student_workshop_active")
      .on(table.studentId, table.workshopId)
      .where(sql`${table.status} <> 'CANCELLED'`),
    index("idx_registrations_student_id").on(table.studentId),
    index("idx_registrations_workshop_id").on(table.workshopId),
    index("idx_registrations_status").on(table.status),
    index("idx_registrations_qr_code").on(table.qrCode),
  ]
);

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export const tickets = pgTable(
  "tickets",
  (t) => ({
    ticketId: t.uuid("ticket_id").primaryKey().defaultRandom(),
    registrationId: t
      .uuid("registration_id")
      .notNull()
      .references(() => registrations.registrationId, { onDelete: "restrict" }),
    qrToken: t.varchar("qr_token", { length: 255 }).notNull(),
    status: ticketStatusEnum("status").notNull().default("ACTIVE"),
    issuedAt: t
      .timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    voidedAt: t.timestamp("voided_at", { withTimezone: true }),
  }),
  (table) => [
    unique("uq_tickets_registration").on(table.registrationId),
    unique("uq_tickets_qr_token").on(table.qrToken),
    check(
      "chk_tickets_void",
      sql`(${table.status} = 'ACTIVE' AND ${table.voidedAt} IS NULL) OR (${table.status} = 'VOID' AND ${table.voidedAt} IS NOT NULL)`
    ),
    index("idx_tickets_qr_token").on(table.qrToken),
    index("idx_tickets_status").on(table.status),
  ]
);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const payments = pgTable(
  "payments",
  (t) => ({
    paymentId: t.uuid("payment_id").primaryKey().defaultRandom(),
    registrationId: t
      .uuid("registration_id")
      .notNull()
      .references(() => registrations.registrationId),
    studentId: t
      .text("student_id")
      .notNull()
      .references(() => students.studentId),
    amount: t.numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: t.char("currency", { length: 3 }).notNull().default("VND"),
    gateway: paymentGatewayEnum("gateway").notNull(),
    status: paymentStatusEnum("status").notNull().default("INITIATED"),
    idempotencyKey: t
      .text("idempotency_key")
      .notNull()
      .references(() => idempotencyKeys.key),
    gatewayTxnId: t.varchar("gateway_txn_id", { length: 255 }),
    initiatedAt: t
      .timestamp("initiated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: t.timestamp("completed_at", { withTimezone: true }),
    timeoutAt: t.timestamp("timeout_at", { withTimezone: true }),
    rawGatewayResponse: t
      .jsonb("raw_gateway_response")
      .$type<Record<string, unknown>>(),
  }),
  (table) => [
    check("chk_payments_amount", sql`${table.amount} > 0`),
    index("idx_payments_registration_id").on(table.registrationId),
    index("idx_payments_student_id").on(table.studentId),
    index("idx_payments_status").on(table.status),
    index("idx_payments_gateway").on(table.gateway),
    index("idx_payments_pending")
      .on(table.initiatedAt)
      .where(sql`${table.status} = 'INITIATED'`),
  ]
);

// ---------------------------------------------------------------------------
// Check-in Records
// ---------------------------------------------------------------------------

export const checkinRecords = pgTable(
  "checkin_records",
  (t) => ({
    checkinId: t.uuid("checkin_id").primaryKey().defaultRandom(),
    registrationId: t
      .uuid("registration_id")
      .notNull()
      .references(() => registrations.registrationId),
    ticketId: t
      .uuid("ticket_id")
      .notNull()
      .references(() => tickets.ticketId),
    studentId: t
      .text("student_id")
      .notNull()
      .references(() => students.studentId),
    workshopId: t
      .uuid("workshop_id")
      .notNull()
      .references(() => workshops.workshopId),
    checkedInAt: t.timestamp("checked_in_at", { withTimezone: true }).notNull(),
    syncedAt: t.timestamp("synced_at", { withTimezone: true }),
    checkedInBy: t
      .uuid("checked_in_by")
      .notNull()
      .references(() => users.userId),
    source: checkinSourceEnum("source").notNull().default("ONLINE"),
    deviceId: t.varchar("device_id", { length: 100 }),
  }),
  (table) => [
    unique("uq_checkin_ticket_workshop").on(table.ticketId, table.workshopId),
    index("idx_checkin_workshop_id").on(table.workshopId),
    index("idx_checkin_student_id").on(table.studentId),
    index("idx_checkin_source")
      .on(table.source)
      .where(sql`${table.source} = 'OFFLINE_SYNC'`),
  ]
);

export const offlineCheckinQueue = pgTable(
  "offline_checkin_queue",
  (t) => ({
    localId: t.uuid("local_id").primaryKey(),
    qrToken: t.varchar("qr_token", { length: 255 }).notNull(),
    workshopId: t.uuid("workshop_id").notNull(),
    checkedInAt: t.timestamp("checked_in_at", { withTimezone: true }).notNull(),
    deviceId: t.varchar("device_id", { length: 100 }).notNull(),
    checkedInBy: t.uuid("checked_in_by").notNull(),
    syncStatus: t
      .varchar("sync_status", { length: 20 })
      .notNull()
      .default("PENDING"),
    syncedAt: t.timestamp("synced_at", { withTimezone: true }),
    conflictReason: t.text("conflict_reason"),
  }),
  (table) => [
    check(
      "offline_checkin_queue_sync_status_check",
      sql`${table.syncStatus} IN ('PENDING', 'SYNCED', 'CONFLICT')`
    ),
  ]
);
