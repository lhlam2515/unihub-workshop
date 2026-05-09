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

// ── Phase 1: Identity ─────────────────────────────────────────────────────────

const LAST_NAMES = [
  "Nguyễn",
  "Trần",
  "Lê",
  "Phạm",
  "Hoàng",
  "Huỳnh",
  "Phan",
  "Vũ",
  "Đặng",
  "Bùi",
];
const FIRST_NAMES = [
  "An",
  "Bình",
  "Chi",
  "Dũng",
  "Em",
  "Phương",
  "Giang",
  "Hoa",
  "Ích",
  "Khoa",
  "Lan",
  "Minh",
  "Nam",
  "Oanh",
  "Phú",
  "Quân",
  "Rạng",
  "Sơn",
  "Thảo",
  "Uyên",
  "Văn",
  "Xuân",
  "Yến",
  "Ánh",
  "Đức",
  "Hải",
  "Khánh",
  "Long",
  "Mai",
  "Ngân",
  "Phúc",
  "Quỳnh",
  "Sang",
  "Thắng",
  "Bảo",
  "Vinh",
  "Yên",
  "Ân",
  "Cường",
  "Diễm",
  "Giao",
  "Hiền",
  "Khải",
  "Lâm",
  "Mỹ",
  "Nhi",
  "Tùng",
  "Hào",
  "Kiên",
  "Lộc",
];

async function seedIdentity(passwordHash: string) {
  // ── Staff ─────────────────────────────────────────────────────────────────
  const btcStaffId = crypto.randomUUID();
  const checkin1StaffId = crypto.randomUUID();
  const checkin2StaffId = crypto.randomUUID();

  await db.insert(schema.staff).values([
    {
      staffId: btcStaffId,
      email: "btc.admin@unihub.edu.vn",
      fullName: "Admin BTC",
      passwordHash,
      role: "BTC",
      isActive: true,
    },
    {
      staffId: checkin1StaffId,
      email: "checkin1@unihub.edu.vn",
      fullName: "Nhân sự Check-in 1",
      passwordHash,
      role: "CHECKIN_STAFF",
      isActive: true,
    },
    {
      staffId: checkin2StaffId,
      email: "checkin2@unihub.edu.vn",
      fullName: "Nhân sự Check-in 2",
      passwordHash,
      role: "CHECKIN_STAFF",
      isActive: true,
    },
  ]);

  // ── Users for staff (backward-compat auth) ────────────────────────────────
  const btcUserId = crypto.randomUUID();
  const checkin1UserId = crypto.randomUUID();
  const checkin2UserId = crypto.randomUUID();

  await db.insert(schema.users).values([
    {
      userId: btcUserId,
      email: "btc.admin@unihub.edu.vn",
      passwordHash,
      role: "BTC",
      status: "ACTIVE",
    },
    {
      userId: checkin1UserId,
      email: "checkin1@unihub.edu.vn",
      passwordHash,
      role: "CHECKIN_STAFF",
      status: "ACTIVE",
    },
    {
      userId: checkin2UserId,
      email: "checkin2@unihub.edu.vn",
      passwordHash,
      role: "CHECKIN_STAFF",
      status: "ACTIVE",
    },
  ]);

  // ── 500 Students ──────────────────────────────────────────────────────────
  const studentIds: string[] = [];
  const studentUserIds: string[] = [];
  const userRows: (typeof schema.users.$inferInsert)[] = [];
  const studentRows: (typeof schema.students.$inferInsert)[] = [];

  for (let i = 0; i < 500; i++) {
    const mssv = `23127${String(i + 1).padStart(3, "0")}`;
    const userId = crypto.randomUUID();
    const lastName = LAST_NAMES[i % LAST_NAMES.length];
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const email = `sv${mssv}@student.edu.vn`;

    studentIds.push(mssv);
    studentUserIds.push(userId);
    userRows.push({
      userId,
      email,
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
    });
    studentRows.push({
      studentId: mssv,
      email,
      fullName: `${lastName} ${firstName}`,
      passwordHash,
      userId,
    });
  }

  // Bulk insert in batches of 100 to stay under query size limits
  for (let b = 0; b < 5; b++) {
    await db
      .insert(schema.users)
      .values(userRows.slice(b * 100, (b + 1) * 100));
  }
  for (let b = 0; b < 5; b++) {
    await db
      .insert(schema.students)
      .values(studentRows.slice(b * 100, (b + 1) * 100));
  }

  // ── Device tokens (first 20 students) ────────────────────────────────────
  const deviceTokenRows = studentIds.slice(0, 20).map((studentId, i) => ({
    deviceTokenId: crypto.randomUUID(),
    studentId,
    token: `device_token_sv_${studentId}`,
    platform: (i % 2 === 0 ? "ANDROID" : "IOS") as "ANDROID" | "IOS",
    isActive: true,
  }));
  await db.insert(schema.deviceTokens).values(deviceTokenRows);

  console.log(`✓ Identity: 3 staff, 500 students, 20 device tokens`);
  return {
    btcStaffId,
    btcUserId,
    checkin1UserId,
    checkin2UserId,
    studentIds,
    studentUserIds,
  };
}

// ── Phase 2: Event Infrastructure ─────────────────────────────────────────────

async function seedInfrastructure() {
  const speakerRows = [
    {
      speakerId: crypto.randomUUID(),
      fullName: "TS. Nguyễn Minh Khoa",
      title: "Trưởng khoa CNTT",
      bio: "Chuyên gia hệ thống phân tán và điện toán đám mây tại Đại học Bách Khoa.",
      avatarUrl: null,
    },
    {
      speakerId: crypto.randomUUID(),
      fullName: "Ths. Trần Thị Lan Anh",
      title: "Senior Product Manager",
      bio: "Hơn 8 năm kinh nghiệm phát triển sản phẩm tại Tiki và các startup fintech.",
      avatarUrl: null,
    },
    {
      speakerId: crypto.randomUUID(),
      fullName: "Lê Văn Đức",
      title: "Engineering Manager",
      bio: "Dẫn dắt đội kỹ thuật 50+ kỹ sư tại VNG, chuyên về kiến trúc microservices.",
      avatarUrl: null,
    },
    {
      speakerId: crypto.randomUUID(),
      fullName: "Phạm Thu Hương",
      title: "UX Lead",
      bio: "Thiết kế trải nghiệm người dùng cho hàng triệu người tại FPT Software.",
      avatarUrl: null,
    },
    {
      speakerId: crypto.randomUUID(),
      fullName: "Ngô Quốc Bảo",
      title: "CTO & Co-founder",
      bio: "Đồng sáng lập StartupVN, cựu kỹ sư Google Singapore.",
      avatarUrl: null,
    },
  ];
  await db.insert(schema.speakers).values(speakerRows);

  const roomRows = [
    {
      roomId: crypto.randomUUID(),
      name: "Hội trường A",
      building: "A",
      floor: 1,
      capacity: 200,
      facilities: { microphone: true, projector: true, airConditioning: true },
    },
    {
      roomId: crypto.randomUUID(),
      name: "Phòng B201",
      building: "B",
      floor: 2,
      capacity: 80,
      facilities: { projector: true, whiteboard: true, airConditioning: true },
    },
    {
      roomId: crypto.randomUUID(),
      name: "Phòng C305",
      building: "C",
      floor: 3,
      capacity: 60,
      facilities: { projector: true, whiteboard: true },
    },
    {
      roomId: crypto.randomUUID(),
      name: "Lab D401",
      building: "D",
      floor: 4,
      capacity: 40,
      facilities: { computers: true, projector: true, whiteboard: true },
    },
  ];
  await db.insert(schema.rooms).values(roomRows);

  console.log(`✓ Infrastructure: 5 speakers, 4 rooms`);
  return {
    speakerIds: speakerRows.map((s) => s.speakerId),
    rooms: roomRows.map((r) => ({ roomId: r.roomId, capacity: r.capacity })),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding UniHub Workshop database...");
  const passwordHash = await hashPassword("123456789");
  await clearAll();
  const identity = await seedIdentity(passwordHash);
  const infra = await seedInfrastructure();
  void identity;
  void infra;
  console.log("✅ Seed complete");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
