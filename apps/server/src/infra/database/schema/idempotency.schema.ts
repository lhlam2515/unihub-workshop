import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, smallint, timestamp, varchar } from "drizzle-orm/pg-core";

export const idempotencyStatusEnum = pgEnum("idempotency_status", [
  "IN_PROGRESS",
  "COMPLETED",
  "UNRESOLVED",
]);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  (t) => ({
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    status: idempotencyStatusEnum("status").notNull().default("IN_PROGRESS"),
    resourceType: varchar("resource_type", { length: 20 }).notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    statusCode: smallint("status_code"),
    lockedUntil: timestamp("locked_until", { withTimezone: true })
      .notNull()
      .default(sql`NOW() + INTERVAL '30 seconds'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  }),
  (table) => [
    index("idx_idempotency_stale").on(table.status, table.lockedUntil),
  ]
);
