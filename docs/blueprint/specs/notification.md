# Spec: Notification Service (`notification`)

> **ASR hiện thực hóa:** ASR-3 (Extensibility — thêm Telegram không sửa code cũ), ASR-7 (Async Processing)
>
> **ADR tham chiếu:** ADR-09 (Strategy Pattern in-process), ADR-10 (Redis Streams — async dispatch), ADR-02 (Schema — notification_logs)
>
> **Trade-off chủ đạo:** Best-effort over Exactly-once. Notification là enrichment, không phải critical path. Nếu email gửi thất bại, đăng ký vẫn hợp lệ. Nếu cần exactly-once guarantee, xem specs/notification-outbox.md.

---

## 1. Mô tả

Notification Service dispatch thông báo đến user qua nhiều kênh (Email, In-app, [Telegram — tương lai]) khi có business event. Service dùng Strategy Pattern — mỗi kênh là một `NotificationChannel` adapter độc lập. Thêm kênh mới = thêm adapter + uncomment 1 dòng tại composition root, không sửa code cũ (OCP).

Dispatch chạy async trong `notification-worker` consumer (Redis Streams, ADR-10). Business flow không chờ notification hoàn thành.

---

## 2. Luồng chính

### 2.1 Event Producer (Business Layer → Stream)

```
Khi business event xảy ra, producer XADD vào stream:

XADD stream:notifications * {
  event_type:  'registration_confirmed',
  user_id:     :student_id,
  payload:     JSON string
}

Events được định nghĩa:

| event_type                    | Trigger                      | Recipients     |
|-------------------------------|------------------------------|----------------|
| registration_confirmed        | Phase A success              | Student        |
| payment_confirmed             | Payment succeeded            | Student        |
| payment_failed                | Payment declined             | Student        |
| workshop_cancelled            | BTC cancel workshop          | All registrants|
| workshop_updated              | BTC update workshop info     | All registrants|
| csv_import_completed_with_errors | Pipeline failed_count > 0 | BTC users      |
| checkin_duplicate_alert       | [Optional] BTC audit         | BTC users      |

Payload structure per event_type (tất cả là JSON string):

registration_confirmed:
  { workshop_id, workshop_title, starts_at, location, qr_code }

payment_confirmed:
  { workshop_title, amount, currency, receipt_id }

payment_failed:
  { workshop_title, amount, currency, decline_reason }

workshop_cancelled:
  { workshop_title, original_starts_at, reason }

workshop_updated:
  { workshop_title, changed_fields: ["location", "starts_at"], new_values: {...} }

csv_import_completed_with_errors:
  { date, total_rows, success_count, failed_count, error_file_url }
```

### 2.2 Worker Consumer (Async)

```
Consumer group: notification-workers
Consumer name:  notification-worker-1  (scale nếu cần)

XREADGROUP GROUP notification-workers notification-worker-1
  COUNT 10 BLOCK 5000
  STREAMS stream:notifications >

FOR EACH message:

  Parse event_type, user_id, payload

  Gọi NotificationService.dispatch(user_id, event_type, payload)
  -- Xem Section 2.3

  Nếu dispatch hoàn thành (kể cả có channel fail):
    XACK stream:notifications notification-workers {message_id}

  Nếu dispatch throw uncaught exception:
    Tăng retry_count
    IF retry_count < 2:
      XACK + XADD lại stream:notifications (re-queue)
    ELSE:
      XACK + XADD stream:notifications-dlq
      -- Admin điều tra
```

### 2.3 NotificationService.dispatch()

```typescript
// Interface — thêm channel không sửa class này
interface NotificationChannel {
  readonly channelName: string;
  send(userId: string, event: string, payload: object): Promise<void>;
}

// Dispatch logic
async dispatch(userId, event, payload):
  CHANNEL_TIMEOUT = 5000ms   // per-channel timeout

  sendWithTimeout = (channel) =>
    Promise.race([
      channel.send(userId, event, payload),
      timeout(CHANNEL_TIMEOUT).then(() => throw Error('CHANNEL_TIMEOUT'))
    ])

  results = await Promise.allSettled(
    channels.map(async (ch) => {
      try:
        await sendWithTimeout(ch)
        await logRepo.log({ userId, event, channel: ch.channelName,
                            status: 'sent', payload })
      catch (err):
        await logRepo.log({ userId, event, channel: ch.channelName,
                            status: err.message == 'CHANNEL_TIMEOUT'
                                    ? 'timeout' : 'failed',
                            errorMsg: err.message, payload })
        throw err    // re-throw để Promise.allSettled record
    })
  )
  // allSettled: không throw lên caller kể cả khi tất cả channels fail
```

**Ví dụ cụ thể — Thêm Telegram:**
```typescript
// TRƯỚC (hiện tại):
const notificationService = new NotificationService(
  [
    new InAppAdapter(db),
    new EmailAdapter(smtpConfig),
    // new TelegramAdapter(botToken),  ← uncomment để enable
  ],
  new NotificationLogRepository(db)
);

// SAU khi thêm Telegram:
// 1. Tạo file: src/notification/adapters/TelegramAdapter.ts
//    implements NotificationChannel { channelName = 'telegram'; ... }
// 2. Uncomment 1 dòng trên
// 3. Deploy
// KẾT QUẢ: Email và In-app vẫn chạy như cũ. Không sửa EmailAdapter, InAppAdapter,
//          NotificationService, không sửa bất kỳ business logic nào.
```

### 2.4 Fan-out Workshop Cancellation (Multi-user)

```
Khi BTC cancel workshop:
  PATCH /admin/workshops/:id { status: "cancelled" }
  ...
  -- Sau COMMIT:

  SELECT student_id FROM registrations
  WHERE workshop_id = :workshop_id
    AND status IN ('pending', 'paid');

  -- Chia batch để tránh memory explosion
  FOR EACH batch of 100 student_ids:
    FOR EACH student_id:
      XADD stream:notifications * {
        event_type: 'workshop_cancelled',
        user_id:    :student_id,
        payload:    { workshop_title, original_starts_at, reason }
      }

  -- 12,000 students → 120 batch → 12,000 messages trong stream
  -- Worker xử lý tuần tự, không concurrent explosion
```

---

## 3. Kịch bản lỗi

### E-01: Channel timeout — SMTP server treo
```
Điều kiện: EmailAdapter.send() không trả về sau 5 giây
Hành vi: Promise.race timeout → throw 'CHANNEL_TIMEOUT'
         notification_logs: status = 'timeout', error_msg = 'CHANNEL_TIMEOUT'
         InAppAdapter.send() vẫn chạy bình thường (Promise.allSettled)
Không cascade sang channel khác
```

### E-02: Channel fail — invalid email address
```
Điều kiện: EmailAdapter.send() throw Error('INVALID_RECIPIENT')
Hành vi: notification_logs: status = 'failed', error_msg = 'INVALID_RECIPIENT'
         Các channel khác vẫn chạy
```

### E-03: Tất cả channels fail
```
Điều kiện: Email timeout + InApp DB error
Hành vi: Promise.allSettled resolve (không throw)
         notification_logs: 2 rows với status='timeout'/'failed'
         XACK message (worker tiếp tục với message kế tiếp)
         Notification bị mất — không retry tự động
Note: Đây là best-effort design. Nếu cần retry per-user,
      xem specs/notification-outbox.md
```

### E-04: Worker crash sau XREADGROUP, trước XACK
```
Điều kiện: Process kill sau khi nhận message nhưng trước XACK
Hành vi: Message ở lại PEL (Pending Entries List)
         Worker restart: XAUTOCLAIM messages đã idle > 10 phút
         Message được re-processed → có thể duplicate notification
Note: Best-effort có thể gây duplicate notification.
      Acceptable vì notification là enrichment, không phải transaction.
      Nếu cần exactly-once: xem specs/notification-outbox.md
```

### E-05: Redis Streams down
```
Điều kiện: Redis unavailable khi producer XADD
Hành vi: XADD fail — notification không được queue
         Business event đã thành công (registration, payment commit đã xong)
         Notification bị mất hoàn toàn
Acceptable: Redis down là degraded mode; notification loss < business data loss
```

### E-06: Massive fan-out memory pressure
```
Điều kiện: Workshop có 10,000 registrants, tất cả cần notification
Hành vi: KHÔNG gọi dispatch() cho 10,000 users cùng lúc
         Batch thành 100 XADD operations → 100 messages trong stream
         Worker xử lý tuần tự 100 messages × dispatch(1 user) mỗi lần
         Throughput: ~100 users/5s (2 channels × 5s timeout = 10s max per user, 
                                     với 2 channels parallel = 5s)
```

---

## 4. Ràng buộc (Invariants)

**INV-01 — OCP (Open/Closed Principle):**
Thêm channel mới KHÔNG được sửa `NotificationService`, `EmailAdapter`, hoặc bất kỳ adapter hiện tại nào.
Chỉ được thêm: (a) file adapter mới, (b) 1 dòng tại composition root.

**INV-02 — Channel Isolation:**
Failure của 1 channel KHÔNG được cancel dispatch của channel khác.
Implementation: `Promise.allSettled` (không phải `Promise.all`).

**INV-03 — Per-channel Timeout:**
Mỗi channel có timeout riêng (5 giây).
Không có global timeout cho toàn bộ dispatch.

**INV-04 — No Silent Failure:**
Mọi failure (timeout, error) phải được ghi vào `notification_logs`.
"Best-effort" không có nghĩa là "không có log".

**INV-05 — Notification Không Block Business Flow:**
XADD vào stream là fire-and-forget — nếu XADD fail, business transaction đã committed không bị rollback.
Notification là decoupled hoàn toàn khỏi critical path.

**INV-06 — Batch Fan-out Tối Đa 100 Users/Message:**
Fan-out cho workshop event (nhiều users) phải được chia batch ≤ 100 users/XADD.
Không được XADD 1 message với 10,000 user_ids — worker phải fan-out.

---

## 5. Tiêu chí chấp nhận

**AC-01 — Happy path single user:**
Event 'registration_confirmed' cho student S.
Then: Email sent, In-app notification created.
notification_logs: 2 rows, status='sent'.

**AC-02 — Channel failure isolation:**
Email SMTP down. Event dispatch.
Then: In-app vẫn sent. notification_logs: email row status='failed', inapp row status='sent'.

**AC-03 — OCP — Add Telegram:**
Tạo TelegramAdapter.ts + uncomment 1 dòng tại main.ts.
Then: Tất cả events dispatch sang 3 channels.
EmailAdapter và InAppAdapter code không được thay đổi (verify bằng git diff).

**AC-04 — Fan-out workshop_cancelled:**
Workshop với 500 registrants bị cancel.
Then: 500 XADD messages vào stream. notification_logs: 500 × 2 channels = 1000 rows.
Memory usage tại thời điểm peak < 50MB (streaming, không load all at once).

**AC-05 — XAUTOCLAIM recovery:**
Worker crash sau XREADGROUP, trước XACK. Message ở lại PEL.
After 10 phút: XAUTOCLAIM reclaim message. Re-dispatch.
Then: Notification được gửi (có thể duplicate — acceptable).

**AC-06 — Notification log retention:**
Job đêm chạy DELETE FROM notification_logs WHERE created_at < now() - interval '30 days'.
Then: Table size maintained.
