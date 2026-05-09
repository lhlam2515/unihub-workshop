/**
 * Seed Script — generates realistic demo data for UniHub Workshop.
 *
 * Usage: `pnpm db:seed`  (or `npx tsx scripts/seed.ts` from apps/server)
 *
 * Drops existing data before inserting to allow re-runs.
 * Connect via DATABASE_URL env var (loaded from apps/server/.env).
 */

import "dotenv/config";
import crypto from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../src/infra/database/schema/index";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const db = drizzle({ client: neon(url), schema });

// lazy bcrypt — loaded only when needed (script may be imported elsewhere)
let bcrypt: typeof import("bcrypt");
async function hash(plain: string): Promise<string> {
  if (!bcrypt) bcrypt = await import("bcrypt");
  return bcrypt.hash(plain, 10);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qrToken(seed: string): string {
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

function daysFromNow(n: number, h = 0, m = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(h, m, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Seed Data
// ---------------------------------------------------------------------------

const STAFF = [
  {
    email: "hoang.lam@unihub.edu.vn",
    fullName: "Hoàng Lâm",
    role: "BTC" as const,
    password: "admin123",
  },
  {
    email: "minh.anh@unihub.edu.vn",
    fullName: "Minh Anh",
    role: "BTC" as const,
    password: "admin123",
  },
  {
    email: "tuan.nguyen@unihub.edu.vn",
    fullName: "Nguyễn Minh Tuấn",
    role: "CHECKIN_STAFF" as const,
    password: "staff123",
  },
];

const STUDENTS = [
  {
    id: "21127001",
    name: "Nguyễn Văn An",
    email: "21127001@student.hcmus.edu.vn",
  },
  {
    id: "21127002",
    name: "Trần Thị Bích",
    email: "21127002@student.hcmus.edu.vn",
  },
  {
    id: "21127003",
    name: "Lê Hoàng Cường",
    email: "21127003@student.hcmus.edu.vn",
  },
  {
    id: "21127004",
    name: "Phạm Minh Đức",
    email: "21127004@student.hcmus.edu.vn",
  },
  {
    id: "21127005",
    name: "Hoàng Thị Mai",
    email: "21127005@student.hcmus.edu.vn",
  },
  {
    id: "21127006",
    name: "Đặng Văn Phúc",
    email: "21127006@student.hcmus.edu.vn",
  },
  {
    id: "21127007",
    name: "Vũ Thị Hồng",
    email: "21127007@student.hcmus.edu.vn",
  },
  {
    id: "21127008",
    name: "Bùi Quang Sơn",
    email: "21127008@student.hcmus.edu.vn",
  },
  {
    id: "21127009",
    name: "Đỗ Thị Thảo",
    email: "21127009@student.hcmus.edu.vn",
  },
  {
    id: "21127010",
    name: "Ngô Minh Tuấn",
    email: "21127010@student.hcmus.edu.vn",
  },
];

const SPEAKERS = [
  {
    fullName: "PGS.TS Nguyễn Đức Hoàng",
    title: "Chuyên gia AI & Machine Learning",
    bio: "Phó Giáo sư tại Đại học Khoa học Tự nhiên, với hơn 15 năm nghiên cứu về Trí tuệ Nhân tạo và Học máy. Tác giả của nhiều công trình nghiên cứu trên các tạp chí quốc tế uy tín.",
  },
  {
    fullName: "TS. Lê Thị Minh Tâm",
    title: "Chuyên gia An ninh mạng",
    bio: "Tiến sĩ Bảo mật Thông tin, hiện là Trưởng nhóm Nghiên cứu An ninh mạng tại Trung tâm Công nghệ Thông tin. Có chứng chỉ CISSP và CEH.",
  },
  {
    fullName: "ThS. Trần Văn Hùng",
    title: "Chuyên gia Cloud & DevOps",
    bio: "Thạc sĩ Khoa học Máy tính, Kiến trúc sư Giải pháp Đám mây tại một công ty công nghệ hàng đầu. AWS Certified Solutions Architect.",
  },
  {
    fullName: "Mr. John Smith",
    title: "International Startup Mentor",
    bio: "Serial entrepreneur with 20+ years experience in Silicon Valley. Founded 3 startups with successful exits. Currently mentoring young entrepreneurs in Southeast Asia.",
  },
  {
    fullName: "ThS. Phạm Thị Lan",
    title: "Chuyên gia UX/UI Design",
    bio: "Thạc sĩ Thiết kế Tương tác, Lead Designer tại một công ty Fintech. Từng đoạt giải Red Dot Design Award.",
  },
];

const ROOMS = [
  { name: "A101", building: "Tòa A", floor: 1, capacity: 50 },
  { name: "A201", building: "Tòa A", floor: 2, capacity: 80 },
  { name: "B102 (Phòng Lab)", building: "Tòa B", floor: 1, capacity: 30 },
  { name: "Hội trường B", building: "Tòa B", floor: 1, capacity: 200 },
];

// Workshop definitions — using relative day offsets for deterministic dates
const WORKSHOP_DEFS: Array<{
  title: string;
  description: string;
  speakerIdx: number;
  roomIdx: number;
  seatsTotal: number;
  price: string;
  status: "DRAFT" | "OPEN" | "COMPLETED";
  dayOffset: number; // days from now
  startHour: number;
  startMin: number;
  durationMinutes: number;
}> = [
  {
    title: "AI trong Giáo dục Đại học: Cơ hội và Thách thức",
    description:
      "Buổi thảo luận về tác động của AI đối với giáo dục đại học, từ ChatGPT đến các mô hình ngôn ngữ lớn (LLMs). Chúng ta sẽ khám phá cách giảng viên và sinh viên có thể tận dụng AI để nâng cao chất lượng dạy và học, cũng như những thách thức về đạo đức và học thuật.",
    speakerIdx: 0,
    roomIdx: 0,
    seatsTotal: 50,
    price: "50000",
    status: "OPEN",
    dayOffset: 11,
    startHour: 9,
    startMin: 0,
    durationMinutes: 150,
  },
  {
    title: "Bảo mật Thông tin trong Thời đại Số",
    description:
      "Tìm hiểu về các mối đe dọa an ninh mạng phổ biến và cách phòng tránh. Workshop bao gồm các chủ đề: phishing, social engineering, bảo vệ dữ liệu cá nhân, và các thực hành bảo mật cơ bản cho sinh viên công nghệ thông tin.",
    speakerIdx: 1,
    roomIdx: 1,
    seatsTotal: 80,
    price: "0",
    status: "OPEN",
    dayOffset: 13,
    startHour: 14,
    startMin: 0,
    durationMinutes: 150,
  },
  {
    title: "Cloud Computing & Ứng dụng Thực tế",
    description:
      "Workshop giới thiệu về điện toán đám mây với AWS, Google Cloud và Azure. Thực hành triển khai ứng dụng cơ bản trên cloud, tìm hiểu về serverless, containerization với Docker, và CI/CD pipelines.",
    speakerIdx: 2,
    roomIdx: 3,
    seatsTotal: 200,
    price: "100000",
    status: "COMPLETED",
    dayOffset: -2,
    startHour: 9,
    startMin: 0,
    durationMinutes: 150,
  },
  {
    title: "Khởi nghiệp Công nghệ: Từ Ý tưởng đến Thực tế",
    description:
      "Chia sẻ kinh nghiệm thực tế từ các nhà sáng lập startup công nghệ. Chủ đề bao gồm: tìm kiếm ý tưởng, xây dựng MVP, gọi vốn đầu tư, và phát triển sản phẩm phù hợp với thị trường.",
    speakerIdx: 3,
    roomIdx: 1,
    seatsTotal: 80,
    price: "0",
    status: "COMPLETED",
    dayOffset: -1,
    startHour: 14,
    startMin: 0,
    durationMinutes: 120,
  },
  {
    title: "Thiết kế UX/UI cho Ứng dụng Di động",
    description:
      "Workshop thực hành về thiết kế trải nghiệm người dùng cho ứng dụng di động. Từ nghiên cứu người dùng, wireframing, prototyping đến testing. Công cụ sử dụng: Figma, Adobe XD.",
    speakerIdx: 4,
    roomIdx: 2,
    seatsTotal: 30,
    price: "150000",
    status: "OPEN",
    dayOffset: 16,
    startHour: 9,
    startMin: 0,
    durationMinutes: 120,
  },
  {
    title: "Blockchain & Tương lai Tài chính Số",
    description:
      "Giới thiệu tổng quan về công nghệ blockchain, hợp đồng thông minh (smart contracts), DeFi, và tiền mã hóa. Thảo luận về tác động của blockchain đối với tài chính truyền thống và các cơ hội nghề nghiệp trong lĩnh vực này.",
    speakerIdx: 0,
    roomIdx: 0,
    seatsTotal: 50,
    price: "200000",
    status: "DRAFT",
    dayOffset: 20,
    startHour: 9,
    startMin: 0,
    durationMinutes: 150,
  },
];

// Registration distribution per workshop (student indices, status)
const REGISTRATIONS: Array<{
  workshopIdx: number;
  studentIdxs: number[];
  statuses: Array<"PENDING" | "CONFIRMED" | "PAID" | "CANCELLED">;
}> = [
  // Workshop 0 (AI - future, OPEN)
  {
    workshopIdx: 0,
    studentIdxs: [0, 1, 2, 5, 7, 8],
    statuses: [
      "CONFIRMED",
      "PAID",
      "CONFIRMED",
      "PENDING",
      "CANCELLED",
      "PAID",
    ],
  },
  // Workshop 1 (Security - future, OPEN)
  {
    workshopIdx: 1,
    studentIdxs: [0, 3, 4, 6, 8, 9],
    statuses: ["CONFIRMED", "CONFIRMED", "PAID", "PENDING", "PENDING", "PAID"],
  },
  // Workshop 2 (Cloud - past, COMPLETED)
  {
    workshopIdx: 2,
    studentIdxs: [0, 1, 2, 3, 4, 5, 6, 7],
    statuses: [
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "CONFIRMED",
      "PAID",
      "PAID",
      "CANCELLED",
    ],
  },
  // Workshop 3 (Startup - past, COMPLETED)
  {
    workshopIdx: 3,
    studentIdxs: [0, 2, 3, 5, 7, 8, 9],
    statuses: [
      "PAID",
      "CONFIRMED",
      "PAID",
      "PAID",
      "PAID",
      "CONFIRMED",
      "PAID",
    ],
  },
  // Workshop 4 (UX/UI - future, OPEN)
  {
    workshopIdx: 4,
    studentIdxs: [1, 4, 6, 9],
    statuses: ["CONFIRMED", "PENDING", "CONFIRMED", "PAID"],
  },
];

// Check-in records for COMPLETED workshops (Cloud, Startup)
const CHECKINS = [
  // Cloud workshop: students 0,1,2,3,4,5 checked in
  { workshopIdx: 2, studentIdxs: [0, 1, 2, 3, 4, 5] },
  // Startup workshop: students 0,2,3,5,7 checked in
  { workshopIdx: 3, studentIdxs: [0, 2, 3, 5, 7] },
];

const DEVICE_TOKENS = [
  { studentIdx: 0, platform: "ANDROID" as const },
  { studentIdx: 1, platform: "IOS" as const },
  { studentIdx: 4, platform: "ANDROID" as const },
  { studentIdx: 5, platform: "IOS" as const },
  { studentIdx: 8, platform: "ANDROID" as const },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🌱 Seeding UniHub Workshop database...\n");

  // ── 0. Clear existing data (order respects FK constraints) ──────────────
  console.log("  Clearing existing data...");
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
  await db.delete(schema.staff);
  await db.delete(schema.users);
  await db.delete(schema.idempotencyKeys);

  // ── 1. Users (auth backward compat) + Staff ─────────────────────────────
  console.log("  Creating staff accounts...");
  const staffPasswordHash = await hash("admin123");
  const staffPasswordHash2 = await hash("staff123");

  const createdUsers: Array<{ userId: string; email: string; role: string }> =
    [];
  const createdStaff: Array<{ staffId: string; email: string; role: string }> =
    [];

  for (const s of STAFF) {
    const pw =
      s.email === "tuan.nguyen@unihub.edu.vn"
        ? staffPasswordHash2
        : staffPasswordHash;
    const [user] = await db
      .insert(schema.users)
      .values({
        email: s.email,
        passwordHash: pw,
        role: s.role,
        status: "ACTIVE",
      })
      .returning({
        userId: schema.users.userId,
        email: schema.users.email,
        role: schema.users.role,
      });
    createdUsers.push(user);

    const [staff] = await db
      .insert(schema.staff)
      .values({
        email: s.email,
        fullName: s.fullName,
        passwordHash: pw,
        role: s.role,
        isActive: true,
      })
      .returning({
        staffId: schema.staff.staffId,
        email: schema.staff.email,
        role: schema.staff.role,
      });
    createdStaff.push(staff);
  }

  const btcStaff = createdStaff.filter((s) => s.role === "BTC");
  const checkinUser = createdUsers.find((u) => u.role === "CHECKIN_STAFF")!;

  // ── 2. Students ─────────────────────────────────────────────────────────
  console.log("  Creating student accounts...");
  const studentPasswordHash = await hash("student123");
  const createdStudents: Array<{ studentId: string; fullName: string }> = [];

  for (const s of STUDENTS) {
    // Create users record (auth layer) so login flow via users table works
    const [user] = await db
      .insert(schema.users)
      .values({
        email: s.email,
        passwordHash: studentPasswordHash,
        role: "STUDENT",
        status: "ACTIVE",
      })
      .returning({ userId: schema.users.userId });

    // Create student record linked to the user
    const [student] = await db
      .insert(schema.students)
      .values({
        studentId: s.id,
        email: s.email,
        fullName: s.name,
        passwordHash: studentPasswordHash,
        userId: user.userId,
      })
      .returning({
        studentId: schema.students.studentId,
        fullName: schema.students.fullName,
      });
    createdStudents.push(student);
  }

  // ── 3. Speakers ─────────────────────────────────────────────────────────
  console.log("  Creating speakers...");
  const createdSpeakers: Array<{ speakerId: string }> = [];
  for (const sp of SPEAKERS) {
    const [speaker] = await db
      .insert(schema.speakers)
      .values(sp)
      .returning({ speakerId: schema.speakers.speakerId });
    createdSpeakers.push(speaker);
  }

  // ── 4. Rooms ────────────────────────────────────────────────────────────
  console.log("  Creating rooms...");
  const createdRooms: Array<{ roomId: string }> = [];
  for (const r of ROOMS) {
    const [room] = await db
      .insert(schema.rooms)
      .values(r)
      .returning({ roomId: schema.rooms.roomId });
    createdRooms.push(room);
  }

  // ── 5. Workshops ────────────────────────────────────────────────────────
  console.log("  Creating workshops...");
  const createdWorkshops: Array<{
    workshopId: string;
    title: string;
    status: string;
    seatsTotal: number;
  }> = [];

  for (const w of WORKSHOP_DEFS) {
    const startsAt = daysFromNow(w.dayOffset, w.startHour, w.startMin);
    const endsAt = new Date(startsAt.getTime() + w.durationMinutes * 60_000);
    // seatsAvailable starts as seatsTotal; updated after registrations
    const [workshop] = await db
      .insert(schema.workshops)
      .values({
        title: w.title,
        description: w.description,
        speakerId: createdSpeakers[w.speakerIdx].speakerId,
        roomId: createdRooms[w.roomIdx].roomId,
        startsAt,
        endsAt,
        seatsTotal: w.seatsTotal,
        seatsAvailable: w.seatsTotal,
        price: w.price,
        status: w.status,
        createdBy: btcStaff[0].staffId,
      })
      .returning({
        workshopId: schema.workshops.workshopId,
        title: schema.workshops.title,
        status: schema.workshops.status,
        seatsTotal: schema.workshops.seatsTotal,
      });
    createdWorkshops.push(workshop);

    // Workshop slot (capacity tracking)
    await db.insert(schema.workshopSlots).values({
      workshopId: workshop.workshopId,
      totalCapacity: w.seatsTotal,
      lockedCount: 0,
      confirmedCount: 0,
    });
  }

  // ── 6. Check-in Staff Assignments ──────────────────────────────────────
  console.log("  Assigning check-in staff to workshops...");
  // Assign Tuấn to all OPEN workshops
  const openWorkshopIds = createdWorkshops
    .filter((w) => w.status === "OPEN")
    .map((w) => w.workshopId);
  await db.insert(schema.checkinStaffAssignments).values({
    userId: checkinUser.userId,
    workshopIds: openWorkshopIds,
  });

  // ── 7. Registrations + Tickets + Payments ──────────────────────────────
  console.log("  Creating registrations, tickets & payments...");
  const paidRegistrations: Array<{
    registrationId: string;
    studentId: string;
    workshopId: string;
    amount: string;
  }> = [];

  for (const regGroup of REGISTRATIONS) {
    const workshop = createdWorkshops[regGroup.workshopIdx];
    let confirmedCount = 0;

    for (let i = 0; i < regGroup.studentIdxs.length; i++) {
      const studentIdx = regGroup.studentIdxs[i];
      const status = regGroup.statuses[i];
      if (!status) continue;

      const student = createdStudents[studentIdx];
      if (!student) continue;

      const qrCode = qrToken(`${workshop.workshopId}-${student.studentId}`);
      const isActiveStatus = status !== "CANCELLED";

      // Registration
      const [reg] = await db
        .insert(schema.registrations)
        .values({
          studentId: student.studentId,
          workshopId: workshop.workshopId,
          status,
          qrCode,
          confirmedAt: isActiveStatus
            ? daysFromNow(WORKSHOP_DEFS[regGroup.workshopIdx].dayOffset - 5)
            : null,
        })
        .returning({ registrationId: schema.registrations.registrationId });

      // Ticket for non-cancelled registrations
      if (isActiveStatus) {
        const ticketQr = qrToken(`ticket-${reg.registrationId}`);
        await db.insert(schema.tickets).values({
          registrationId: reg.registrationId,
          qrToken: ticketQr,
          status: "ACTIVE",
          issuedAt: daysFromNow(
            WORKSHOP_DEFS[regGroup.workshopIdx].dayOffset - 5
          ),
        });
      }

      // Payment for PAID registrations
      if (status === "PAID") {
        const def = WORKSHOP_DEFS[regGroup.workshopIdx];
        paidRegistrations.push({
          registrationId: reg.registrationId,
          studentId: student.studentId,
          workshopId: workshop.workshopId,
          amount: def.price,
        });
      }

      if (isActiveStatus) confirmedCount++;
    }

    // Update workshop seat counts
    const seatsTotal = workshop.seatsTotal;
    const seatsAvailable = seatsTotal - confirmedCount;
    await db
      .update(schema.workshops)
      .set({ seatsAvailable })
      .where(eq(schema.workshops.workshopId, workshop.workshopId));

    await db
      .update(schema.workshopSlots)
      .set({ confirmedCount })
      .where(eq(schema.workshopSlots.workshopId, workshop.workshopId));
  }

  // Payments for PAID registrations
  for (const p of paidRegistrations) {
    const amt = p.amount === "0" ? "50000" : p.amount; // free workshops charged 50k
    await db.insert(schema.payments).values({
      registrationId: p.registrationId,
      studentId: p.studentId,
      amount: amt,
      currency: "VND",
      gateway: "MOCK",
      status: "SUCCEEDED",
      idempotencyKey: `seed-${p.registrationId}`,
      gatewayTxnId: `MOCK-${crypto.randomUUID().slice(0, 8)}`,
      completedAt: daysFromNow(-3),
      rawGatewayResponse: { provider: "MOCK", message: "Simulated success" },
    });
  }

  // ── 8. Check-in Records ────────────────────────────────────────────────
  console.log("  Creating check-in records...");
  for (const ci of CHECKINS) {
    const workshop = createdWorkshops[ci.workshopIdx];

    for (const studentIdx of ci.studentIdxs) {
      const student = createdStudents[studentIdx];
      if (!student) continue;

      // find the registration
      const [registration] = await db
        .select({ registrationId: schema.registrations.registrationId })
        .from(schema.registrations)
        .where(
          and(
            eq(schema.registrations.studentId, student.studentId),
            eq(schema.registrations.workshopId, workshop.workshopId)
          )
        )
        .limit(1);
      if (!registration) continue;

      const def = WORKSHOP_DEFS[ci.workshopIdx];
      await db.insert(schema.checkinRecords).values({
        registrationId: registration.registrationId,
        studentId: student.studentId,
        workshopId: workshop.workshopId,
        checkedInAt: daysFromNow(def.dayOffset, def.startHour + 1, 0),
        checkedInBy: checkinUser.userId,
        source: "ONLINE",
      });
    }
  }

  // ── 9. Device Tokens ───────────────────────────────────────────────────
  console.log("  Creating device tokens...");
  for (const dt of DEVICE_TOKENS) {
    const student = createdStudents[dt.studentIdx];
    if (!student) continue;
    await db.insert(schema.deviceTokens).values({
      studentId: student.studentId,
      token: `fcm-${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`,
      platform: dt.platform,
      isActive: true,
    });
  }

  // ── 10. Notification Logs ──────────────────────────────────────────────
  console.log("  Creating notification logs...");
  for (const p of paidRegistrations.slice(0, 8)) {
    await db.insert(schema.notificationLogs).values({
      userId: p.studentId,
      workshopId: p.workshopId,
      type: "PAYMENT_SUCCESS",
      channel: "EMAIL",
      status: "SENT",
      payload: { amount: p.amount, currency: "VND" },
      sentAt: daysFromNow(-2),
    });
  }

  // Registration confirmed notifications
  for (const regGroup of REGISTRATIONS.slice(0, 3)) {
    const workshop = createdWorkshops[regGroup.workshopIdx];
    for (const studentIdx of regGroup.studentIdxs.slice(0, 4)) {
      const student = createdStudents[studentIdx];
      if (!student) continue;
      await db.insert(schema.notificationLogs).values({
        userId: student.studentId,
        workshopId: workshop.workshopId,
        type: "REGISTRATION_CONFIRMED",
        channel: "APP",
        status: "SENT",
        payload: { workshopTitle: workshop.title },
        sentAt: daysFromNow(-4),
      });
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const counts = {
    users: createdUsers.length,
    staff: createdStaff.length,
    students: createdStudents.length,
    speakers: createdSpeakers.length,
    rooms: createdRooms.length,
    workshops: createdWorkshops.length,
    registrations: REGISTRATIONS.reduce((s, g) => s + g.studentIdxs.length, 0),
    payments: paidRegistrations.length,
  };

  console.log("\n✅ Seed complete! Summary:");
  for (const [key, val] of Object.entries(counts)) {
    console.log(`   ${key}: ${val}`);
  }

  console.log("\n📋 Demo accounts:");
  console.log(`   BTC Admin:     hoang.lam@unihub.edu.vn / admin123`);
  console.log(`   BTC Staff:     minh.anh@unihub.edu.vn / admin123`);
  console.log(`   Check-in:      tuan.nguyen@unihub.edu.vn / staff123`);
  console.log(`   Students:      21127001-21127010 / student123`);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
