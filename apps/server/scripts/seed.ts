/**
 * Seed Script — comprehensive demo data for UniHub Workshop.
 * Usage: pnpm db:seed  (from repo root) or npx tsx scripts/seed.ts (from apps/server)
 * Re-runnable: clears all tables before inserting.
 */
import "dotenv/config";
import crypto from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../src/infra/database/schema/index";

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const db = drizzle({ client: neon(url), schema });

// Lazy bcrypt import so the script can be imported elsewhere without loading the native addon
let _bcrypt: typeof import("bcrypt");
async function hashPassword(plain: string): Promise<string> {
  if (!_bcrypt) _bcrypt = await import("bcrypt");
  return _bcrypt.hash(plain, 10);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a Date N days from today, set to the given hour:minute (local time). */
function dateAtSlot(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Random integer in [min, max] inclusive. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Returns a new Date offset by `secs` seconds. */
function addSeconds(date: Date, secs: number): Date {
  return new Date(date.getTime() + secs * 1000);
}

/** 64-char hex token suitable for QR codes. */
function qrToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ── Clear Phase ───────────────────────────────────────────────────────────────

async function clearAll() {
  // Order respects FK dependencies (children deleted before parents)
  await db.delete(schema.offlineCheckinQueue);
  await db.delete(schema.checkinRecords);
  await db.delete(schema.aiSummaries);
  await db.delete(schema.workshopDocuments);
  await db.delete(schema.notificationLogs);
  await db.delete(schema.notificationChannelConfigs);
  await db.delete(schema.studentSyncErrors);
  await db.delete(schema.studentSyncJobs);
  await db.delete(schema.payments);
  await db.delete(schema.tickets);
  await db.delete(schema.registrations);
  await db.delete(schema.workshopSlots);
  await db.delete(schema.workshops);
  await db.delete(schema.speakers);
  await db.delete(schema.rooms);
  await db.delete(schema.checkinStaffAssignments);
  await db.delete(schema.deviceTokens);
  await db.delete(schema.students);
  await db.delete(schema.users);
  await db.delete(schema.staff);
  console.log("✓ Cleared all tables");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding UniHub Workshop database...");
  const passwordHash = await hashPassword("123456789");
  await clearAll();
  // Phases will be added below
  console.log("✅ Seed complete");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
