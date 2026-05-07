import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { workshopStatusEnum } from "./enums.schema";
import { users } from "./identity.schema";

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
    speakerId: t
      .uuid("speaker_id")
      .notNull()
      .references(() => speakers.speakerId),
    roomId: t
      .uuid("room_id")
      .notNull()
      .references(() => rooms.roomId),
    startsAt: t.timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: t.timestamp("ends_at", { withTimezone: true }).notNull(),
    capacity: t.smallint("capacity").notNull(),
    isPaid: t.boolean("is_paid").notNull().default(false),
    price: t.numeric("price", { precision: 12, scale: 2 }),
    status: workshopStatusEnum("status").notNull().default("DRAFT"),
    createdBy: t
      .uuid("created_by")
      .notNull()
      .references(() => users.userId),
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
    check("chk_workshops_capacity", sql`${table.capacity} > 0`),
    check(
      "chk_workshops_price",
      sql`(${table.isPaid} = false AND ${table.price} IS NULL) OR (${table.isPaid} = true AND ${table.price} > 0)`
    ),
    index("idx_workshops_status").on(table.status),
    index("idx_workshops_starts_at").on(table.startsAt),
    index("idx_workshops_speaker_id").on(table.speakerId),
    index("idx_workshops_room_id").on(table.roomId),
    uniqueIndex("uq_workshops_room_time_slot")
      .on(table.roomId, table.startsAt, table.endsAt)
      .where(sql`${table.status} = 'OPEN'`),
  ]
);

export const workshopSlots = pgTable(
  "workshop_slots",
  (t) => ({
    slotId: t.uuid("slot_id").primaryKey().defaultRandom(),
    workshopId: t
      .uuid("workshop_id")
      .notNull()
      .references(() => workshops.workshopId, { onDelete: "cascade" }),
    totalCapacity: t.smallint("total_capacity").notNull(),
    lockedCount: t.smallint("locked_count").notNull().default(0),
    confirmedCount: t.smallint("confirmed_count").notNull().default(0),
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    unique("uq_workshop_slots_workshop").on(table.workshopId),
    check("chk_slot_capacity", sql`${table.totalCapacity} > 0`),
    check(
      "chk_slot_counts",
      sql`${table.lockedCount} >= 0 AND ${table.confirmedCount} >= 0 AND (${table.lockedCount} + ${table.confirmedCount}) <= ${table.totalCapacity}`
    ),
  ]
);
