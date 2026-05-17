import { sql } from "drizzle-orm";
import { check, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { workshopStatusEnum } from "./enums.schema";
import { staff } from "./identity.schema";

export const speakers = pgTable("speakers", (t) => ({
  speakerId: t.uuid("speaker_id").primaryKey().defaultRandom(),
  fullName: t.varchar("full_name", { length: 255 }).notNull(),
  title: t.varchar("title", { length: 255 }),
  bio: t.text("bio"),
  avatarUrl: t.varchar("avatar_url", { length: 1000 }),
  createdAt: t
    .timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: t
    .timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}));

export const rooms = pgTable(
  "rooms",
  (t) => ({
    roomId: t.uuid("room_id").primaryKey().defaultRandom(),
    name: t.varchar("name", { length: 100 }).notNull(),
    building: t.varchar("building", { length: 100 }),
    floor: t.smallint("floor"),
    capacity: t.smallint("capacity").notNull(),
    floorPlanUrl: t.varchar("floor_plan_url", { length: 1000 }),
    facilities: t.jsonb("facilities").$type<Record<string, unknown>>(),
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
    check("chk_rooms_capacity", sql`${table.capacity} > 0`),
    index("idx_rooms_name").on(table.name),
  ]
);

export const workshops = pgTable(
  "workshops",
  (t) => ({
    workshopId: t.uuid("workshop_id").primaryKey().defaultRandom(),
    title: t.varchar("title", { length: 500 }).notNull(),
    description: t.text("description"),
    // NULLABLE — allowed in DRAFT state before speaker/room assigned
    speakerId: t.uuid("speaker_id").references(() => speakers.speakerId),
    roomId: t.uuid("room_id").references(() => rooms.roomId),
    startsAt: t.timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: t.timestamp("ends_at", { withTimezone: true }).notNull(),
    seatsTotal: t.integer("seats_total").notNull(),
    seatsAvailable: t.integer("seats_available").notNull(),
    price: t.numeric("price", { precision: 10, scale: 2 }).default("0"),
    status: workshopStatusEnum("status").notNull().default("DRAFT"),
    createdBy: t
      .uuid("created_by")
      .notNull()
      .references(() => staff.staffId),
    // ADR-03: Optimistic Locking version
    version: t.bigint("version", { mode: "number" }).notNull().default(0),
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
    check("chk_workshops_time", sql`${table.endsAt} > ${table.startsAt}`),
    check("chk_workshops_seats_total", sql`${table.seatsTotal} > 0`),
    check(
      "chk_workshops_seats_available",
      sql`${table.seatsAvailable} >= 0 AND ${table.seatsAvailable} <= ${table.seatsTotal}`
    ),
    check("chk_workshops_price", sql`${table.price} >= 0`),
    index("idx_workshops_status_starts")
      .on(table.status, table.startsAt)
      .where(sql`${table.status} = 'OPEN'`),
    index("idx_workshops_room").on(table.roomId, table.startsAt),
    index("idx_workshops_speaker_id").on(table.speakerId),
    uniqueIndex("uq_workshops_room_time_slot").on(
      table.roomId,
      table.startsAt,
      table.endsAt
    ),
  ]
);
