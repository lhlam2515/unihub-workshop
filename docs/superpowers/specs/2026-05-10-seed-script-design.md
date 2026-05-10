# Seed Script Design — UniHub Workshop

**Date:** 2026-05-10  
**Scope:** Rewrite `apps/server/scripts/seed.ts` to generate comprehensive demo data covering all system features and user flows.

---

## 1. Goals

- Replace the existing minimal seed (10 students, 5 workshops) with a full-scale demo dataset
- Cover all user flows described in `docs/user-flow.md`: student registration (free + paid), check-in (online + offline), admin management, AI summary, CSV sync
- Data must satisfy all DB constraints and business rules (FK order, unique indexes, seat accounting, OL counters)
- No new dependencies — use only existing packages: `drizzle-orm`, `@neondatabase/serverless`, `bcrypt`, `crypto`

---

## 2. Overall Architecture

**Single file:** `apps/server/scripts/seed.ts` — full replacement.

**Execution flow:**

```text
connect (neon + drizzle)
  │
  ▼
CLEAR — delete in FK-reverse order
  offlineCheckinQueue → checkinRecords → aiSummaries → workshopDocuments
  → notificationLogs → notificationChannelConfigs → studentSyncErrors
  → studentSyncJobs → payments → tickets → registrations
  → workshops → speakers → rooms → checkinStaffAssignments
  → deviceTokens → students → users → staff
  │
  ▼
SEED PHASE 1 — Identity
  • bcrypt.hash('123456789', 10) once, reuse for all
  • insert staff (BTC × 1, CHECKIN_STAFF × 2)
  • insert users linked to each staff
  • insert 500 students + linked users
  • insert deviceTokens for first 20 students
  │
  ▼
SEED PHASE 2 — Event Infrastructure
  • insert 5 speakers
  • insert 4 rooms
  │
  ▼
SEED PHASE 3 — Workshops (25 total)
  • seatsAvailable = seatsTotal initially
  • status/type per day distribution (see Section 4)
  │
  ▼
SEED PHASE 4 — Transactions
  • insert registrations (per fill-rate rules)
  • insert payments (paid workshops only)
  • insert tickets (all non-CANCELLED registrations)
  • UPDATE seatsAvailable = seatsTotal - COUNT(CONFIRMED + PAID) per workshop
  │
  ▼
SEED PHASE 5 — Check-in + Async
  • insert checkinRecords (COMPLETED workshops, 75% fill)
  • insert offlineCheckinQueue (3 SYNCED + 1 PENDING)
  • insert checkinStaffAssignments
  • insert studentSyncJobs + studentSyncErrors
  • insert notificationLogs
  • insert workshopDocuments + aiSummaries (2 workshops)
  │
  ▼
log summary counts
```

---

## 3. Identity Data (Phase 1)

### Staff

| Role | Email | Notes |
|------|-------|-------|
| BTC | `btc.admin@unihub.edu.vn` | Creates workshops, views stats |
| CHECKIN_STAFF | `checkin1@unihub.edu.vn` | Scans QR at venue |
| CHECKIN_STAFF | `checkin2@unihub.edu.vn` | Second device |

Each staff record also gets a linked `users` record (same role, status `ACTIVE`) so they can login via JWT API.

### Students (500)

- MSSV: `23127001` → `23127500` (TEXT PK)
- Email: `sv{mssv}@student.edu.vn`
- Full name: deterministic combination from pool of 10 họ × 50 tên (e.g., `Nguyễn Văn An`)
- Password: `bcrypt('123456789', 10)` — hashed once, reused
- Each student also gets a linked `users` record (role `STUDENT`, status `ACTIVE`) with `userId` FK

### Device Tokens

- First 20 students get 1 FCM device token each: `device_token_sv_{mssv}`
- Platform: `FCM`

---

## 4. Event Infrastructure (Phase 2)

### Speakers (5)

| # | Name | Title | Organization |
|---|------|-------|--------------|
| 1 | TS. Nguyễn Minh Khoa | Trưởng khoa CNTT | ĐH Bách Khoa |
| 2 | Ths. Trần Thị Lan Anh | Senior Product Manager | Tiki |
| 3 | Lê Văn Đức | Engineering Manager | VNG |
| 4 | Phạm Thu Hương | UX Lead | FPT Software |
| 5 | Ngô Quốc Bảo | CTO | StartupVN |

### Rooms (4)

| # | Name | Building | Floor | Capacity |
|---|------|----------|-------|----------|
| 1 | Hội trường A | A | 1 | 200 |
| 2 | Phòng B201 | B | 2 | 80 |
| 3 | Phòng C305 | C | 3 | 60 |
| 4 | Lab D401 | D | 4 | 40 |

---

## 5. Workshop Distribution (Phase 3)

**Scenario:** Event is at the start of Day 3. Days 1–2 completed; Days 3–5 ongoing/upcoming.

**Time slots per day** (avoids `UNIQUE(roomId, startsAt, endsAt)` conflicts):

```text
Slot 0: 08:00–09:30  → Room A (200 seats)
Slot 1: 10:00–11:30  → Room B (80 seats)
Slot 2: 13:00–14:30  → Room C (60 seats)
Slot 3: 15:00–16:30  → Room D (40 seats)
Slot 4: 17:00–18:30  → Room A (200 seats)
```

**Distribution:**

| Day | Offset | Count | Status | Free/Paid |
|-----|--------|-------|--------|-----------|
| 1 | today - 2 | 4 | COMPLETED | 2 free, 2 paid |
| 2 | today - 1 | 4 | COMPLETED | 2 free, 2 paid |
| 3 | today | 5 | OPEN (3) + CANCELLED (1) + OPEN (1) | 3 free, 2 paid |
| 4 | today + 1 | 6 | OPEN (5) + DRAFT (1) | 3 free, 3 paid |
| 5 | today + 2 | 6 | OPEN (5) + DRAFT (1) | 3 free, 3 paid |

**Total: 25** — 8 COMPLETED, 14 OPEN, 2 DRAFT, 1 CANCELLED (Day 3 slot 2).

**Prices for paid workshops:** 50,000 / 80,000 / 100,000 / 150,000 VND (cycled).

**`seatsTotal`** = room capacity. **`seatsAvailable`** = set correctly after Phase 4.

**`version`** = 0 on creation (OL counter).

---

## 6. Registrations & Seat Accounting (Phase 4)

### Fill rates by workshop status

| Status | Fill rate | Registration statuses |
|--------|-----------|----------------------|
| COMPLETED | 70–90% | CONFIRMED (free) / PAID (paid) + ~10% CANCELLED |
| OPEN today (morning slots past) | 50–70% | CONFIRMED/PAID + ~5% PENDING |
| OPEN today (afternoon) | 40–60% | CONFIRMED/PAID + ~10% PENDING |
| OPEN day 4 | 30–50% | CONFIRMED/PAID + ~15% PENDING |
| OPEN day 5 | 10–30% | CONFIRMED/PAID + ~20% PENDING |
| CANCELLED | ~20% seats | all CANCELLED |

### Student assignment

- Deterministic: `studentIndex = (workshopIndex * 97 + registrationIndex) % 500`
- Guarantees no `UNIQUE(studentId, workshopId)` violation within a workshop

### Timestamps

- `registeredAt`: random in `[startsAt - 5d, startsAt - 1h]`
- `confirmedAt`: `registeredAt + random(5s, 30s)` for CONFIRMED/PAID
- `cancelledAt`: set for CANCELLED

### Seat reconciliation (after all registrations)

```text
UPDATE workshops
SET seatsAvailable = seatsTotal - (
  SELECT COUNT(*) FROM registrations
  WHERE workshopId = workshops.workshopId
  AND status IN ('CONFIRMED', 'PAID')
)
```

---

## 7. Payments (Phase 4, paid workshops only)

| Registration status | Payment status | Notes |
|--------------------|---------------|-------|
| PAID | SUCCEEDED | Happy path |
| PENDING | INITIATED | Awaiting gateway |
| CANCELLED (from paid) | FAILED | Declined/cancelled |
| 2 special records | UNRESOLVED | Demo reconciliation |

**Fields:** `amount = workshop.price`, `currency = 'VND'`, `gateway = 'MOCK'`,  
`idempotencyKey = randomUUID()`, `gatewayTxnId = 'MOCK_TXN_{index}'`

---

## 8. Tickets (Phase 4, all non-CANCELLED registrations)

| Registration status | Ticket status |
|--------------------|--------------|
| CONFIRMED | ACTIVE |
| PAID | ACTIVE |
| PENDING | ACTIVE |

- `qrToken`: `crypto.randomBytes(32).toString('hex')` — 64-char hex, UNIQUE
- `issuedAt`: `confirmedAt ?? registeredAt`
- 1 ticket set to `VOID` (demo void flow): chosen from a COMPLETED workshop registration

---

## 9. Check-in Records & Async Data (Phase 5)

### Check-in Records (COMPLETED workshops only)

- 75% of CONFIRMED/PAID registrations → `ONLINE` source check-in
- 10% of those also get an `OFFLINE_SYNC` record (different `checkinId`, same `registrationId`) — uses `ON CONFLICT DO NOTHING` semantics in seed
- `checkedInAt`: random in `[startsAt, startsAt + 30min]`
- `checkedInBy`: `users.userId` of checkin staff (alternating between 2 staff users)
- `deviceId`: `'DEVICE_001'` or `'DEVICE_002'`

### Offline Checkin Queue

- 3 records `SYNCED` (corresponding checkinRecords exist)
- 1 record `PENDING` (no checkinRecord yet — demo unsynced state)

### Supplementary Data

| Table | Count | Purpose |
|-------|-------|---------|
| `checkinStaffAssignments` | 2 records | Each checkin staff assigned to all workshops (JSONB array) |
| `studentSyncJobs` | 1 SUCCESS | Demo completed CSV import (Flow 8) |
| `studentSyncErrors` | 2 records | Demo error rows from CSV import |
| `notificationLogs` | ~30 records | SENT/FAILED/PENDING sampling across workshops/students |
| `deviceTokens` | 20 records | First 20 students, FCM platform |
| `workshopDocuments` | 2 records | 1 per AI summary workshop |
| `aiSummaries` | 2 records | 1 DONE (complete summary text), 1 PROCESSING (demo in-progress) |

---

## 10. Constraints Checklist

| Constraint | How satisfied |
|-----------|---------------|
| `UNIQUE(studentId, workshopId)` on registrations | Deterministic student assignment avoids repeats |
| `UNIQUE(roomId, startsAt, endsAt)` on workshops | Fixed slot grid, no two workshops share room+time |
| `seatsAvailable >= 0 AND <= seatsTotal` | Reconciliation UPDATE after all registrations |
| `checkinRecords UNIQUE(registrationId, workshopId)` | One check-in per registration per workshop |
| `tickets.registrationId` UNIQUE | One ticket per registration |
| `tickets.qrToken` UNIQUE | `crypto.randomBytes(32)` collision probability negligible |
| FK: `checkinRecords.checkedInBy → users.userId` | Staff users created in Phase 1 before check-in records |
| `workshops.version = 0` | Set on insert |
| `endsAt > startsAt` | Slots are 90-minute fixed durations |
| `price >= 0` | Hardcoded positive values |
