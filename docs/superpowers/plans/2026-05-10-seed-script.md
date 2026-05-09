# Seed Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/server/scripts/seed.ts` with a comprehensive seed that generates 3 staff, 500 students, 25 workshops, and all supporting data to demo every system user flow.

**Architecture:** Single TypeScript file executed via `tsx`. Eight sequential seed phases in FK order. All UUIDs generated in-memory with `crypto.randomUUID()`, held in local arrays/maps so FK columns are populated correctly. `workshopSlots` is seeded alongside workshops (one row per workshop). Seat reconciliation runs after all registrations are inserted.

**Tech Stack:** Drizzle ORM (`drizzle-orm/neon-http`), `@neondatabase/serverless`, `bcrypt` (lazy import), `node:crypto`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/server/scripts/seed.ts` | **Replace entirely** | All 8 seed phases + helpers + clear |

No other files change. `db:seed` in `apps/server/package.json` already exists.

---

## Schema Quick Reference

Before implementing, confirm these exact column names from the schema files:

| Table | Key columns |
|-------|------------|
| `users` | `userId` (uuid PK), `email`, `passwordHash`, `role` (`STUDENT`/`BTC`/`CHECKIN_STAFF`), `status` (`ACTIVE`/…) |
| `staff` | `staffId` (uuid PK), `email`, `fullName`, `passwordHash`, `role` (`BTC`/`CHECKIN_STAFF`), `isActive` |
| `students` | `studentId` (TEXT PK), `email`, `fullName`, `passwordHash`, `userId` (uuid FK → users) |
| `deviceTokens` | `deviceTokenId` (uuid PK), `studentId` (TEXT FK), `token`, `platform` (`IOS`/`ANDROID`), `isActive` |
| `checkinStaffAssignments` | `assignmentId` (uuid PK), `userId` (uuid FK), `workshopIds` (jsonb string[]) |
| `speakers` | `speakerId` (uuid PK), `fullName`, `title`, `bio`, `avatarUrl` |
| `rooms` | `roomId` (uuid PK), `name`, `building`, `floor`, `capacity`, `facilities` (jsonb Record) |
| `workshops` | `workshopId` (uuid PK), `title`, `description`, `speakerId`, `roomId`, `startsAt`, `endsAt`, `seatsTotal`, `seatsAvailable`, `price` (numeric string), `status`, `createdBy` (→ staff.staffId), `version` (number) |
| `workshopSlots` | `slotId` (uuid PK), `workshopId` (FK), `totalCapacity`, `lockedCount` (default 0), `confirmedCount`, `version` |
| `registrations` | `registrationId`, `studentId`, `workshopId`, `status` (`PENDING`/`CONFIRMED`/`PAID`/`CANCELLED`), `qrCode` (unique text), `registeredAt`, `confirmedAt`, `cancelledAt`, `cancellationReason`, `version` |
| `tickets` | `ticketId`, `registrationId` (unique FK), `qrToken` (varchar 255, unique), `status` (`ACTIVE`/`VOID`), `issuedAt`, `voidedAt` (required when VOID) |
| `payments` | `paymentId`, `registrationId`, `studentId`, `amount` (numeric >0), `currency` (char 3), `gateway` (`MOCK`/…), `status` (`INITIATED`/`SUCCEEDED`/`FAILED`/`UNRESOLVED`), `idempotencyKey`, `gatewayTxnId`, `initiatedAt`, `completedAt`, `timeoutAt` |
| `checkinRecords` | `checkinId`, `registrationId`, `studentId`, `workshopId`, `checkedInAt`, `checkedInBy` (→ users.userId), `source` (`ONLINE`/`OFFLINE_SYNC`), `deviceId`, `syncedAt` |
| `offlineCheckinQueue` | `localId`, `qrToken`, `workshopId`, `checkedInAt`, `deviceId`, `checkedInBy`, `syncStatus` (`PENDING`/`SYNCED`/`CONFLICT`), `syncedAt`, `conflictReason` |
| `notificationChannelConfigs` | `channelConfigId`, `channelType` (`APP`/`EMAIL`/`TELEGRAM`), `isActive`, `configJson` |
| `notificationLogs` | `notificationId`, `userId` (TEXT — student ID), `workshopId`, `type`, `channel`, `status` (`PENDING`/`SENT`/`FAILED`/`TIMEOUT`), `payload`, `sentAt`, `errorMessage` |
| `workshopDocuments` | `documentId`, `workshopId`, `fileUrl`, `originalName`, `fileSizeBytes`, `uploadStatus` (`UPLOADED`/`PROCESSING`/`PROCESSED`/`FAILED`), `uploadedBy` (→ users.userId) |
| `aiSummaries` | `summaryId`, `documentId` (unique FK), `workshopId`, `rawText`, `summaryText`, `modelUsed`, `status` (`NONE`/`QUEUED`/`PROCESSING`/`DONE`/`FAILED`), `generatedAt`, `errorMessage` |
| `studentSyncJobs` | `jobId`, `triggeredAt`, `sourceFileName`, `status` (`RUNNING`/`SUCCESS`/`PARTIAL_FAILURE`/`FAILED`), `totalRows`, `processedRows`, `errorRows`, `completedAt` |
| `studentSyncErrors` | `errorId`, `jobId`, `rowNumber`, `rawData`, `errorReason` (`DUPLICATE`/`INVALID_FORMAT`/`MISSING_FIELD`/`UNKNOWN`), `errorDetail` |

---

## Task 1: Skeleton + Helpers + Clear Phase

**Files:**
- Replace: `apps/server/scripts/seed.ts`

- [ ] **Step 1: Replace the entire file with the skeleton**

```typescript
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
```

- [ ] **Step 2: Run to verify clear phase works**

```bash
cd apps/server && pnpm db:seed
```

Expected:
```
🌱 Seeding UniHub Workshop database...
✓ Cleared all tables
✅ Seed complete
```

If you get a module-not-found error, open the current `seed.ts` import path and match it exactly.

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/seed.ts
git commit -m "chore(seed): skeleton with clear phase"
```

---

## Task 2: Phase 1 — Identity (Staff, Students, Device Tokens)

**Files:**
- Modify: `apps/server/scripts/seed.ts`

- [ ] **Step 1: Add the `seedIdentity` function**

Insert this before `// ── Main ──`:

```typescript
// ── Phase 1: Identity ─────────────────────────────────────────────────────────

const LAST_NAMES = ["Nguyễn","Trần","Lê","Phạm","Hoàng","Huỳnh","Phan","Vũ","Đặng","Bùi"];
const FIRST_NAMES = [
  "An","Bình","Chi","Dũng","Em","Phương","Giang","Hoa","Ích","Khoa",
  "Lan","Minh","Nam","Oanh","Phú","Quân","Rạng","Sơn","Thảo","Uyên",
  "Văn","Xuân","Yến","Ánh","Đức","Hải","Khánh","Long","Mai","Ngân",
  "Phúc","Quỳnh","Sang","Thắng","Bảo","Vinh","Yên","Ân","Cường","Diễm",
  "Giao","Hiền","Khải","Lâm","Mỹ","Nhi","Tùng","Hào","Kiên","Lộc",
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
    { userId: btcUserId, email: "btc.admin@unihub.edu.vn", passwordHash, role: "BTC", status: "ACTIVE" },
    { userId: checkin1UserId, email: "checkin1@unihub.edu.vn", passwordHash, role: "CHECKIN_STAFF", status: "ACTIVE" },
    { userId: checkin2UserId, email: "checkin2@unihub.edu.vn", passwordHash, role: "CHECKIN_STAFF", status: "ACTIVE" },
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
    userRows.push({ userId, email, passwordHash, role: "STUDENT", status: "ACTIVE" });
    studentRows.push({ studentId: mssv, email, fullName: `${lastName} ${firstName}`, passwordHash, userId });
  }

  // Bulk insert in batches of 100 to stay under query size limits
  for (let b = 0; b < 5; b++) {
    await db.insert(schema.users).values(userRows.slice(b * 100, (b + 1) * 100));
  }
  for (let b = 0; b < 5; b++) {
    await db.insert(schema.students).values(studentRows.slice(b * 100, (b + 1) * 100));
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
  return { btcStaffId, btcUserId, checkin1UserId, checkin2UserId, studentIds, studentUserIds };
}
```

- [ ] **Step 2: Call `seedIdentity` from `main()`**

```typescript
async function main() {
  console.log("🌱 Seeding UniHub Workshop database...");
  const passwordHash = await hashPassword("123456789");
  await clearAll();
  const identity = await seedIdentity(passwordHash);
  console.log("✅ Seed complete");
}
```

- [ ] **Step 3: Run and verify**

```bash
cd apps/server && pnpm db:seed
```

Expected:
```
✓ Cleared all tables
✓ Identity: 3 staff, 500 students, 20 device tokens
✅ Seed complete
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed.ts
git commit -m "chore(seed): phase 1 identity — staff, 500 students, device tokens"
```

---

## Task 3: Phase 2 — Speakers + Rooms

**Files:**
- Modify: `apps/server/scripts/seed.ts`

- [ ] **Step 1: Add `seedInfrastructure` function**

Insert before `// ── Main ──`:

```typescript
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

  // facilities is Record<string, unknown> (jsonb), not an array
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
```

- [ ] **Step 2: Call from `main()`**

```typescript
const infra = await seedInfrastructure();
```

- [ ] **Step 3: Run and verify**

```bash
cd apps/server && pnpm db:seed
```

Expected new line:
```
✓ Infrastructure: 5 speakers, 4 rooms
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed.ts
git commit -m "chore(seed): phase 2 speakers and rooms"
```

---

## Task 4: Phase 3 — Workshops + WorkshopSlots

**Files:**
- Modify: `apps/server/scripts/seed.ts`

- [ ] **Step 1: Add workshop definitions and `seedWorkshops` function**

Insert before `// ── Main ──`:

```typescript
// ── Phase 3: Workshops ────────────────────────────────────────────────────────

type WorkshopDef = {
  dayOffset: number;
  hour: number;
  roomIdx: number;   // index into infra.rooms array
  speakerIdx: number; // index into infra.speakerIds array
  status: "COMPLETED" | "OPEN" | "DRAFT" | "CANCELLED";
  price: number;     // 0 = free, positive = price in VND
  title: string;
};

// 25 workshops. Slot grid per day: 08:00, 10:00, 13:00, 15:00, 17:00.
// Each room used at most once per slot (unique constraint: roomId + startsAt + endsAt).
const WORKSHOP_DEFS: WorkshopDef[] = [
  // Day 1 (today - 2): 4 COMPLETED
  { dayOffset: -2, hour: 8,  roomIdx: 0, speakerIdx: 2, status: "COMPLETED", price: 0,      title: "Kỹ năng phỏng vấn kỹ thuật" },
  { dayOffset: -2, hour: 10, roomIdx: 1, speakerIdx: 3, status: "COMPLETED", price: 80000,  title: "Thiết kế UI/UX từ con số 0" },
  { dayOffset: -2, hour: 13, roomIdx: 2, speakerIdx: 0, status: "COMPLETED", price: 0,      title: "Hệ thống phân tán: Nhập môn thực hành" },
  { dayOffset: -2, hour: 15, roomIdx: 3, speakerIdx: 1, status: "COMPLETED", price: 100000, title: "Product Management: Từ ý tưởng đến sản phẩm" },
  // Day 2 (today - 1): 4 COMPLETED
  { dayOffset: -1, hour: 8,  roomIdx: 0, speakerIdx: 2, status: "COMPLETED", price: 0,      title: "Xây dựng CV ấn tượng cho kỹ sư phần mềm" },
  { dayOffset: -1, hour: 10, roomIdx: 1, speakerIdx: 4, status: "COMPLETED", price: 50000,  title: "Startup trong 48 giờ: Từ ý tưởng đến MVP" },
  { dayOffset: -1, hour: 13, roomIdx: 2, speakerIdx: 0, status: "COMPLETED", price: 80000,  title: "Thiết kế hệ thống cho ứng dụng triệu người dùng" },
  { dayOffset: -1, hour: 15, roomIdx: 3, speakerIdx: 3, status: "COMPLETED", price: 0,      title: "UX Research: Lắng nghe người dùng" },
  // Day 3 (today): 4 OPEN + 1 CANCELLED
  { dayOffset: 0,  hour: 8,  roomIdx: 0, speakerIdx: 2, status: "OPEN",      price: 0,      title: "Clean Code và SOLID Principles" },
  { dayOffset: 0,  hour: 10, roomIdx: 1, speakerIdx: 1, status: "OPEN",      price: 80000,  title: "Agile & Scrum trong thực tế doanh nghiệp" },
  { dayOffset: 0,  hour: 13, roomIdx: 2, speakerIdx: 4, status: "CANCELLED", price: 0,      title: "[Đã hủy] Blockchain và Web3 cơ bản" },
  { dayOffset: 0,  hour: 15, roomIdx: 3, speakerIdx: 0, status: "OPEN",      price: 100000, title: "Bảo mật ứng dụng Web: OWASP Top 10" },
  { dayOffset: 0,  hour: 17, roomIdx: 0, speakerIdx: 2, status: "OPEN",      price: 0,      title: "Nghề kỹ sư phần mềm: Góc nhìn thực tế" },
  // Day 4 (today + 1): 5 OPEN + 1 DRAFT
  { dayOffset: 1,  hour: 8,  roomIdx: 0, speakerIdx: 0, status: "OPEN",      price: 0,      title: "DevOps CI/CD Pipeline thực hành" },
  { dayOffset: 1,  hour: 10, roomIdx: 1, speakerIdx: 0, status: "OPEN",      price: 150000, title: "Machine Learning cho người mới bắt đầu" },
  { dayOffset: 1,  hour: 13, roomIdx: 2, speakerIdx: 2, status: "OPEN",      price: 0,      title: "React Native: Xây dựng ứng dụng di động" },
  { dayOffset: 1,  hour: 15, roomIdx: 3, speakerIdx: 1, status: "OPEN",      price: 80000,  title: "Data Analytics với Python và Pandas" },
  { dayOffset: 1,  hour: 17, roomIdx: 0, speakerIdx: 3, status: "OPEN",      price: 50000,  title: "Soft Skills cho kỹ sư: Giao tiếp hiệu quả" },
  { dayOffset: 1,  hour: 10, roomIdx: 3, speakerIdx: 4, status: "DRAFT",     price: 0,      title: "[Draft] Workshop dự phòng ngày 4" },
  // Day 5 (today + 2): 5 OPEN + 1 DRAFT
  { dayOffset: 2,  hour: 8,  roomIdx: 0, speakerIdx: 0, status: "OPEN",      price: 0,      title: "Kiến trúc Microservices: Bài học thực tế" },
  { dayOffset: 2,  hour: 10, roomIdx: 1, speakerIdx: 3, status: "OPEN",      price: 100000, title: "Product Design Sprint: 5 ngày ra sản phẩm" },
  { dayOffset: 2,  hour: 13, roomIdx: 2, speakerIdx: 2, status: "OPEN",      price: 0,      title: "Open Source: Đóng góp và xây dựng cộng đồng" },
  { dayOffset: 2,  hour: 15, roomIdx: 3, speakerIdx: 1, status: "OPEN",      price: 80000,  title: "Đàm phán lương và offer cho kỹ sư" },
  { dayOffset: 2,  hour: 17, roomIdx: 0, speakerIdx: 4, status: "OPEN",      price: 150000, title: "AI Tools cho lập trình viên: GitHub Copilot và hơn thế" },
  { dayOffset: 2,  hour: 10, roomIdx: 3, speakerIdx: 1, status: "DRAFT",     price: 50000,  title: "[Draft] Workshop dự phòng ngày 5" },
];

type WorkshopRow = {
  workshopId: string;
  def: WorkshopDef;
  seatsTotal: number;
  startsAt: Date;
  endsAt: Date;
};

async function seedWorkshops(
  btcStaffId: string,
  speakerIds: string[],
  rooms: { roomId: string; capacity: number }[],
): Promise<WorkshopRow[]> {
  const workshopRows: WorkshopRow[] = [];
  const insertValues: (typeof schema.workshops.$inferInsert)[] = [];
  const slotValues: (typeof schema.workshopSlots.$inferInsert)[] = [];

  for (const def of WORKSHOP_DEFS) {
    const room = rooms[def.roomIdx];
    const startsAt = dateAtSlot(def.dayOffset, def.hour);
    const endsAt = dateAtSlot(def.dayOffset, def.hour + 1, 30); // 90-minute sessions
    const workshopId = crypto.randomUUID();

    workshopRows.push({ workshopId, def, seatsTotal: room.capacity, startsAt, endsAt });

    insertValues.push({
      workshopId,
      title: def.title,
      description: `Nội dung chi tiết: ${def.title}. Workshop cung cấp kiến thức thực tế và kỹ năng ứng dụng ngay vào công việc.`,
      speakerId: speakerIds[def.speakerIdx],
      roomId: room.roomId,
      startsAt,
      endsAt,
      seatsTotal: room.capacity,
      seatsAvailable: room.capacity, // reconciled later in Task 5
      price: String(def.price),
      status: def.status,
      createdBy: btcStaffId,
      version: 0,
    });

    // One workshopSlots row per workshop (confirmedCount set to 0; reconciled in Task 5)
    slotValues.push({
      slotId: crypto.randomUUID(),
      workshopId,
      totalCapacity: room.capacity,
      lockedCount: 0,
      confirmedCount: 0,
      version: 0,
    });
  }

  await db.insert(schema.workshops).values(insertValues);
  await db.insert(schema.workshopSlots).values(slotValues);
  console.log(`✓ Workshops: ${workshopRows.length} workshops + slots`);
  return workshopRows;
}
```

- [ ] **Step 2: Call from `main()`**

```typescript
const workshops = await seedWorkshops(identity.btcStaffId, infra.speakerIds, infra.rooms);
```

- [ ] **Step 3: Run and verify**

```bash
cd apps/server && pnpm db:seed
```

Expected:
```
✓ Workshops: 25 workshops + slots
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed.ts
git commit -m "chore(seed): phase 3 workshops and workshop slots"
```

---

## Task 5: Phase 4 — Registrations + Seat Reconciliation

**Files:**
- Modify: `apps/server/scripts/seed.ts`

- [ ] **Step 1: Add `seedRegistrations` function**

Insert before `// ── Main ──`:

```typescript
// ── Phase 4: Registrations ────────────────────────────────────────────────────

type RegRow = typeof schema.registrations.$inferInsert & { registrationId: string };

function fillConfig(def: WorkshopDef): { fillRate: number; cancelRate: number; pendingRate: number } {
  if (def.status === "COMPLETED") return { fillRate: 0.80, cancelRate: 0.10, pendingRate: 0.00 };
  if (def.status === "CANCELLED") return { fillRate: 0.20, cancelRate: 1.00, pendingRate: 0.00 };
  if (def.dayOffset === 0)        return { fillRate: 0.55, cancelRate: 0.03, pendingRate: 0.08 };
  if (def.dayOffset === 1)        return { fillRate: 0.35, cancelRate: 0.02, pendingRate: 0.15 };
  return                                 { fillRate: 0.18, cancelRate: 0.02, pendingRate: 0.20 };
}

async function seedRegistrations(workshops: WorkshopRow[], studentIds: string[]) {
  const allRows: RegRow[] = [];

  for (let wi = 0; wi < workshops.length; wi++) {
    const ws = workshops[wi];
    const { fillRate, cancelRate, pendingRate } = fillConfig(ws.def);
    const target = Math.floor(ws.seatsTotal * fillRate);

    for (let ri = 0; ri < target; ri++) {
      // Deterministic, collision-free assignment: gcd(31, 500) = 1 → all indices unique per workshop
      const studentIdx = (wi * 97 + ri * 31) % studentIds.length;
      const studentId = studentIds[studentIdx];

      const registeredAt = new Date(
        ws.startsAt.getTime() - randomInt(3_600_000, 5 * 86_400_000),
      );

      let status: "CONFIRMED" | "PAID" | "PENDING" | "CANCELLED";
      if (ws.def.status === "CANCELLED") {
        status = "CANCELLED";
      } else if (ri < Math.floor(target * cancelRate)) {
        status = "CANCELLED";
      } else if (ri < Math.floor(target * (cancelRate + pendingRate))) {
        status = ws.def.price === 0 ? "CONFIRMED" : "PENDING";
      } else {
        status = ws.def.price === 0 ? "CONFIRMED" : "PAID";
      }

      const confirmedAt =
        status === "CONFIRMED" || status === "PAID"
          ? addSeconds(registeredAt, randomInt(5, 30))
          : null;
      const cancelledAt =
        status === "CANCELLED"
          ? addSeconds(registeredAt, randomInt(60, 3600))
          : null;

      allRows.push({
        registrationId: crypto.randomUUID(),
        studentId,
        workshopId: ws.workshopId,
        status,
        qrCode: crypto.randomUUID(),
        registeredAt,
        confirmedAt,
        cancelledAt,
        cancellationReason: cancelledAt ? "Sinh viên hủy đăng ký" : null,
        version: 0,
      });
    }
  }

  // Insert in batches of 200
  for (let b = 0; b < Math.ceil(allRows.length / 200); b++) {
    await db.insert(schema.registrations).values(allRows.slice(b * 200, (b + 1) * 200));
  }

  // Reconcile seatsAvailable and workshopSlots.confirmedCount
  for (const ws of workshops) {
    const confirmed = allRows.filter(
      (r) => r.workshopId === ws.workshopId && (r.status === "CONFIRMED" || r.status === "PAID"),
    ).length;
    const seatsAvailable = ws.seatsTotal - confirmed;

    await db
      .update(schema.workshops)
      .set({ seatsAvailable })
      .where(eq(schema.workshops.workshopId, ws.workshopId));

    await db
      .update(schema.workshopSlots)
      .set({ confirmedCount: confirmed })
      .where(eq(schema.workshopSlots.workshopId, ws.workshopId));
  }

  console.log(`✓ Registrations: ${allRows.length} records, seats reconciled`);
  return { registrations: allRows };
}
```

- [ ] **Step 2: Call from `main()`**

```typescript
const { registrations } = await seedRegistrations(workshops, identity.studentIds);
```

- [ ] **Step 3: Run and verify**

```bash
cd apps/server && pnpm db:seed
```

Expected (exact count varies by randomInt but should be 3,000–5,000):
```
✓ Registrations: NNNN records, seats reconciled
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed.ts
git commit -m "chore(seed): phase 4 registrations with seat reconciliation"
```

---

## Task 6: Phase 5 — Payments + Tickets

**Files:**
- Modify: `apps/server/scripts/seed.ts`

- [ ] **Step 1: Add `seedPaymentsAndTickets` function**

Insert before `// ── Main ──`:

```typescript
// ── Phase 5: Payments + Tickets ───────────────────────────────────────────────

async function seedPaymentsAndTickets(workshops: WorkshopRow[], registrations: RegRow[]) {
  // Build lookup: workshopId → price (as number)
  const priceMap = new Map(workshops.map((w) => [w.workshopId, w.def.price]));

  const paymentRows: (typeof schema.payments.$inferInsert)[] = [];
  const ticketRows: (typeof schema.tickets.$inferInsert)[] = [];
  let unresolvedCount = 0;

  for (let i = 0; i < registrations.length; i++) {
    const reg = registrations[i];
    const price = priceMap.get(reg.workshopId as string) ?? 0;
    const isPaidWorkshop = price > 0;

    // ── Payments: only for paid workshops, and only non-CONFIRMED statuses ──
    if (isPaidWorkshop && reg.status !== "CONFIRMED") {
      let payStatus: "INITIATED" | "SUCCEEDED" | "FAILED" | "UNRESOLVED";
      if (reg.status === "PAID")      payStatus = "SUCCEEDED";
      else if (reg.status === "PENDING") payStatus = "INITIATED";
      else payStatus = "FAILED"; // CANCELLED

      // Override first 2 FAILED payments to UNRESOLVED for reconciliation demo
      if (payStatus === "FAILED" && unresolvedCount < 2) {
        payStatus = "UNRESOLVED";
        unresolvedCount++;
      }

      paymentRows.push({
        paymentId: crypto.randomUUID(),
        registrationId: reg.registrationId,
        studentId: reg.studentId as string,
        amount: String(price),   // numeric(12,2) — must be > 0
        currency: "VND",
        gateway: "MOCK",
        status: payStatus,
        idempotencyKey: crypto.randomUUID(),
        gatewayTxnId: `MOCK_TXN_${i}`,
        initiatedAt: reg.registeredAt as Date,
        completedAt: reg.confirmedAt ?? null,
        timeoutAt: null,
        rawGatewayResponse: null,
      });
    }

    // ── Tickets: all non-CANCELLED registrations ──────────────────────────
    if (reg.status !== "CANCELLED") {
      ticketRows.push({
        ticketId: crypto.randomUUID(),
        registrationId: reg.registrationId,
        qrToken: qrToken(),
        status: "ACTIVE",
        issuedAt: (reg.confirmedAt ?? reg.registeredAt) as Date,
        voidedAt: null,
      });
    }
  }

  // Mark the first ticket VOID for demo (chk_tickets_void requires voidedAt when VOID)
  if (ticketRows.length > 0) {
    ticketRows[0].status = "VOID";
    ticketRows[0].voidedAt = addSeconds(ticketRows[0].issuedAt as Date, 3600);
  }

  for (let b = 0; b < Math.ceil(paymentRows.length / 200); b++) {
    await db.insert(schema.payments).values(paymentRows.slice(b * 200, (b + 1) * 200));
  }
  for (let b = 0; b < Math.ceil(ticketRows.length / 200); b++) {
    await db.insert(schema.tickets).values(ticketRows.slice(b * 200, (b + 1) * 200));
  }

  console.log(
    `✓ Payments: ${paymentRows.length} (${unresolvedCount} UNRESOLVED), Tickets: ${ticketRows.length} (1 VOID)`,
  );
  return { tickets: ticketRows };
}
```

- [ ] **Step 2: Call from `main()`**

```typescript
const { tickets } = await seedPaymentsAndTickets(workshops, registrations);
```

- [ ] **Step 3: Run and verify**

```bash
cd apps/server && pnpm db:seed
```

Expected:
```
✓ Payments: NNN (2 UNRESOLVED), Tickets: NNN (1 VOID)
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed.ts
git commit -m "chore(seed): phase 5 payments and tickets"
```

---

## Task 7: Phase 6 — Check-in Records + Offline Queue

**Files:**
- Modify: `apps/server/scripts/seed.ts`

- [ ] **Step 1: Add `seedCheckins` function**

Insert before `// ── Main ──`:

```typescript
// ── Phase 6: Check-in ─────────────────────────────────────────────────────────

async function seedCheckins(
  workshops: WorkshopRow[],
  registrations: RegRow[],
  tickets: (typeof schema.tickets.$inferInsert)[],
  checkin1UserId: string,
  checkin2UserId: string,
) {
  const completedIds = new Set(
    workshops.filter((w) => w.def.status === "COMPLETED").map((w) => w.workshopId),
  );
  // Map registrationId → qrToken for offline queue entries
  const qrByRegId = new Map(tickets.map((t) => [t.registrationId, t.qrToken]));
  const startsByWorkshopId = new Map(workshops.map((w) => [w.workshopId, w.startsAt]));

  const eligible = registrations.filter(
    (r) =>
      completedIds.has(r.workshopId as string) &&
      (r.status === "CONFIRMED" || r.status === "PAID"),
  );

  const checkinRows: (typeof schema.checkinRecords.$inferInsert)[] = [];
  const offlineRows: (typeof schema.offlineCheckinQueue.$inferInsert)[] = [];
  let offlineSyncedAdded = 0;

  for (let i = 0; i < eligible.length; i++) {
    const reg = eligible[i];
    const startsAt = startsByWorkshopId.get(reg.workshopId as string)!;
    const checkedInAt = addSeconds(startsAt, randomInt(0, 1800));
    const checkedInBy = i % 2 === 0 ? checkin1UserId : checkin2UserId;
    const deviceId = i % 2 === 0 ? "DEVICE_001" : "DEVICE_002";

    // 75% get online check-in (skip every 4th entry)
    if (i % 4 !== 0) {
      checkinRows.push({
        checkinId: crypto.randomUUID(),
        registrationId: reg.registrationId,
        studentId: reg.studentId as string,
        workshopId: reg.workshopId as string,
        checkedInAt,
        syncedAt: null,
        checkedInBy, // UUID of users.userId (not staff.staffId)
        source: "ONLINE",
        deviceId,
      });

      // Add a SYNCED offline queue entry for ~every 10th online check-in (max 3)
      if (i % 10 === 0 && offlineSyncedAdded < 3) {
        offlineRows.push({
          localId: crypto.randomUUID(),
          qrToken: qrByRegId.get(reg.registrationId) ?? qrToken(),
          workshopId: reg.workshopId as string,
          checkedInAt,
          deviceId,
          checkedInBy,
          syncStatus: "SYNCED",
          syncedAt: addSeconds(checkedInAt, randomInt(30, 300)),
          conflictReason: null,
        });
        offlineSyncedAdded++;
      }
    }
  }

  // Add 1 PENDING offline queue entry (not yet synced — demo unresolved state)
  const lastEligible = eligible[eligible.length - 1];
  const lastStartsAt = startsByWorkshopId.get(lastEligible.workshopId as string)!;
  offlineRows.push({
    localId: crypto.randomUUID(),
    qrToken: qrToken(), // fresh token — not in checkinRecords
    workshopId: lastEligible.workshopId as string,
    checkedInAt: addSeconds(lastStartsAt, randomInt(0, 1800)),
    deviceId: "DEVICE_001",
    checkedInBy: checkin1UserId,
    syncStatus: "PENDING",
    syncedAt: null,
    conflictReason: null,
  });

  for (let b = 0; b < Math.ceil(checkinRows.length / 200); b++) {
    await db.insert(schema.checkinRecords).values(checkinRows.slice(b * 200, (b + 1) * 200));
  }
  if (offlineRows.length > 0) {
    await db.insert(schema.offlineCheckinQueue).values(offlineRows);
  }

  console.log(
    `✓ Check-ins: ${checkinRows.length} online, ${offlineRows.length} offline queue (1 PENDING)`,
  );
}
```

- [ ] **Step 2: Call from `main()`**

```typescript
await seedCheckins(
  workshops,
  registrations,
  tickets,
  identity.checkin1UserId,
  identity.checkin2UserId,
);
```

- [ ] **Step 3: Run and verify**

```bash
cd apps/server && pnpm db:seed
```

Expected:
```
✓ Check-ins: NNN online, 4 offline queue (1 PENDING)
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed.ts
git commit -m "chore(seed): phase 6 check-in records and offline queue"
```

---

## Task 8: Phase 7 — Supplementary Data

**Files:**
- Modify: `apps/server/scripts/seed.ts`

- [ ] **Step 1: Add `seedSupplementary` function**

Insert before `// ── Main ──`:

```typescript
// ── Phase 7: Supplementary ────────────────────────────────────────────────────

async function seedSupplementary(
  workshops: WorkshopRow[],
  studentIds: string[],
  checkin1UserId: string,
  checkin2UserId: string,
  btcUserId: string,
) {
  const allWorkshopIds = workshops.map((w) => w.workshopId);

  // checkinStaffAssignments: one row per staff, UNIQUE(userId)
  await db.insert(schema.checkinStaffAssignments).values([
    { assignmentId: crypto.randomUUID(), userId: checkin1UserId, workshopIds: allWorkshopIds },
    { assignmentId: crypto.randomUUID(), userId: checkin2UserId, workshopIds: allWorkshopIds },
  ]);

  // notificationChannelConfigs: one row per channel type, UNIQUE(channelType)
  await db.insert(schema.notificationChannelConfigs).values([
    {
      channelConfigId: crypto.randomUUID(),
      channelType: "APP",
      isActive: true,
      configJson: { provider: "internal" },
    },
    {
      channelConfigId: crypto.randomUUID(),
      channelType: "EMAIL",
      isActive: true,
      configJson: { host: "smtp.mock.edu.vn", port: 587 },
    },
    {
      channelConfigId: crypto.randomUUID(),
      channelType: "TELEGRAM",
      isActive: false,
      configJson: { botToken: "MOCK_BOT_TOKEN" },
    },
  ]);

  // studentSyncJob (1 SUCCESS run)
  const syncJobId = crypto.randomUUID();
  const syncTriggeredAt = new Date(Date.now() - 86_400_000); // yesterday
  await db.insert(schema.studentSyncJobs).values({
    jobId: syncJobId,
    triggeredAt: syncTriggeredAt,
    sourceFileName: "students_export_2026_05_09.csv",
    status: "SUCCESS",
    totalRows: 502,
    processedRows: 500,
    errorRows: 2,
    completedAt: addSeconds(syncTriggeredAt, 45),
    errorLogUrl: null,
  });

  // studentSyncErrors (2 bad rows)
  await db.insert(schema.studentSyncErrors).values([
    {
      errorId: crypto.randomUUID(),
      jobId: syncJobId,
      rowNumber: 47,
      rawData: "23127047,invalid-email,Nguyễn Văn Test",
      errorReason: "INVALID_FORMAT",
      errorDetail: "Email không đúng định dạng: invalid-email",
    },
    {
      errorId: crypto.randomUUID(),
      jobId: syncJobId,
      rowNumber: 213,
      rawData: ",,",
      errorReason: "MISSING_FIELD",
      errorDetail: "Thiếu studentId và email",
    },
  ]);

  // notificationLogs (~30 sampling across students and workshops)
  const notifTypes: (typeof schema.notificationLogs.$inferInsert["type"])[] = [
    "REGISTRATION_CONFIRMED",
    "WORKSHOP_CANCELLED",
    "PAYMENT_SUCCESS",
    "PAYMENT_FAILED",
    "CHECKIN_REMINDER",
  ];
  const channels: (typeof schema.notificationLogs.$inferInsert["channel"])[] = ["EMAIL", "APP"];
  const statuses: (typeof schema.notificationLogs.$inferInsert["status"])[] = [
    "SENT","SENT","SENT","FAILED","PENDING",
  ];
  const notifRows = Array.from({ length: 30 }, (_, i) => ({
    notificationId: crypto.randomUUID(),
    userId: studentIds[i % studentIds.length], // TEXT field — student ID
    workshopId: workshops[i % workshops.length].workshopId,
    type: notifTypes[i % notifTypes.length],
    channel: channels[i % channels.length],
    status: statuses[i % statuses.length],
    payload: { message: `Demo notification #${i + 1}` },
    sentAt:
      statuses[i % statuses.length] === "SENT"
        ? addSeconds(new Date(), -randomInt(3600, 86400))
        : null,
    errorMessage:
      statuses[i % statuses.length] === "FAILED"
        ? "SMTP connection timeout"
        : null,
  }));
  await db.insert(schema.notificationLogs).values(notifRows);

  // workshopDocuments + aiSummaries for 2 COMPLETED workshops
  const completedWs = workshops.filter((w) => w.def.status === "COMPLETED");
  const doc1Id = crypto.randomUUID();
  const doc2Id = crypto.randomUUID();

  await db.insert(schema.workshopDocuments).values([
    {
      documentId: doc1Id,
      workshopId: completedWs[0].workshopId,
      fileUrl: "https://storage.mock/docs/workshop-ktvkt.pdf",
      originalName: "workshop_intro_ktvkt.pdf",
      fileSizeBytes: 524288,
      uploadStatus: "PROCESSED",     // enum: UPLOADED | PROCESSING | PROCESSED | FAILED
      uploadedBy: btcUserId,         // users.userId (UUID)
    },
    {
      documentId: doc2Id,
      workshopId: completedWs[1].workshopId,
      fileUrl: "https://storage.mock/docs/workshop-uiux.pdf",
      originalName: "speaker_slides_uiux.pdf",
      fileSizeBytes: 1_048_576,
      uploadStatus: "PROCESSED",
      uploadedBy: btcUserId,
    },
  ]);

  await db.insert(schema.aiSummaries).values([
    {
      summaryId: crypto.randomUUID(),
      documentId: doc1Id,
      workshopId: completedWs[0].workshopId,
      rawText: "Nội dung gốc từ PDF về kỹ năng phỏng vấn...",
      summaryText:
        "Workshop cung cấp kiến thức nền tảng về phỏng vấn kỹ thuật, " +
        "bao gồm cấu trúc dữ liệu, giải thuật, system design, và kỹ năng hành vi. " +
        "Diễn giả chia sẻ kinh nghiệm thực từ các vòng phỏng vấn tại công ty lớn.",
      modelUsed: "gpt-4o-mini",
      status: "DONE",
      generatedAt: addSeconds(new Date(), -86_400),
      errorMessage: null,
    },
    {
      summaryId: crypto.randomUUID(),
      documentId: doc2Id,
      workshopId: completedWs[1].workshopId,
      rawText: null,
      summaryText: null,
      modelUsed: null,
      status: "PROCESSING", // in-progress demo
      generatedAt: null,
      errorMessage: null,
    },
  ]);

  console.log(
    "✓ Supplementary: assignments, channel configs, sync job, 30 notifications, 2 AI summaries",
  );
}
```

- [ ] **Step 2: Call from `main()`**

```typescript
await seedSupplementary(
  workshops,
  identity.studentIds,
  identity.checkin1UserId,
  identity.checkin2UserId,
  identity.btcUserId,
);
```

The final `main()` function should look like:

```typescript
async function main() {
  console.log("🌱 Seeding UniHub Workshop database...");
  const passwordHash = await hashPassword("123456789");
  await clearAll();
  const identity = await seedIdentity(passwordHash);
  const infra = await seedInfrastructure();
  const workshops = await seedWorkshops(identity.btcStaffId, infra.speakerIds, infra.rooms);
  const { registrations } = await seedRegistrations(workshops, identity.studentIds);
  const { tickets } = await seedPaymentsAndTickets(workshops, registrations);
  await seedCheckins(workshops, registrations, tickets, identity.checkin1UserId, identity.checkin2UserId);
  await seedSupplementary(workshops, identity.studentIds, identity.checkin1UserId, identity.checkin2UserId, identity.btcUserId);
  console.log("✅ Seed complete");
}
```

- [ ] **Step 3: Run full seed**

```bash
cd apps/server && pnpm db:seed
```

Expected full output:
```
🌱 Seeding UniHub Workshop database...
✓ Cleared all tables
✓ Identity: 3 staff, 500 students, 20 device tokens
✓ Infrastructure: 5 speakers, 4 rooms
✓ Workshops: 25 workshops + slots
✓ Registrations: NNNN records, seats reconciled
✓ Payments: NNN (2 UNRESOLVED), Tickets: NNN (1 VOID)
✓ Check-ins: NNN online, 4 offline queue (1 PENDING)
✓ Supplementary: assignments, channel configs, sync job, 30 notifications, 2 AI summaries
✅ Seed complete
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed.ts
git commit -m "chore(seed): phase 7 supplementary — complete seed script"
```

---

## Task 9: Type-check + Idempotency Verification

**Files:**
- No changes (fix errors if found)

- [ ] **Step 1: Run TypeScript type-check**

```bash
pnpm check-types --filter=server
```

Common errors and fixes:
- `Type 'number' is not assignable to type 'bigint'` → The `version` column uses `mode: "number"` so plain `0` is correct (not `BigInt(0)`).
- `Argument of type 'string' is not assignable to ...` → Check enum values against `enums.schema.ts`. Ensure string literals match exactly.
- `Object literal may only specify known properties` → Check the column name against the schema file for that table.
- Missing required field → Add `null` or the default value.

- [ ] **Step 2: Run seed a second time (re-run idempotency)**

```bash
cd apps/server && pnpm db:seed
```

Must complete without FK errors. The clear phase runs before every seed so this is always a fresh state.

- [ ] **Step 3: Commit any type-check fixes**

```bash
git add apps/server/scripts/seed.ts
git commit -m "chore(seed): fix type errors"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| 500 students, MSSV 23127001–23127500 | Task 2 |
| Password `123456789` | Tasks 2 (hashPassword) |
| 3 staff (1 BTC, 2 CHECKIN_STAFF) | Task 2 |
| users table backward-compat rows | Task 2 |
| Device tokens for 20 students | Task 2 |
| 5 speakers, 4 rooms | Task 3 |
| 25 workshops over 5 days | Task 4 |
| 8 COMPLETED, 14 OPEN, 2 DRAFT, 1 CANCELLED | Task 4 (WORKSHOP_DEFS) |
| workshopSlots per workshop | Task 4 |
| Slot grid — no room conflicts | Task 4 (unique slots per room per day) |
| Fill rates by status/day | Task 5 |
| Seat reconciliation (seatsAvailable + confirmedCount) | Task 5 |
| UNIQUE(studentId, workshopId) safe | Task 5 (gcd(31,500)=1 proof) |
| Payments for paid workshops | Task 6 |
| 2 UNRESOLVED payments | Task 6 |
| Tickets for non-CANCELLED | Task 6 |
| 1 VOID ticket | Task 6 |
| Online check-ins for COMPLETED workshops | Task 7 |
| Offline queue: 3 SYNCED + 1 PENDING | Task 7 |
| checkinStaffAssignments | Task 8 |
| notificationChannelConfigs | Task 8 |
| studentSyncJob + 2 errors | Task 8 |
| 30 notification logs | Task 8 |
| 2 workshopDocuments + aiSummaries (1 DONE, 1 PROCESSING) | Task 8 |
