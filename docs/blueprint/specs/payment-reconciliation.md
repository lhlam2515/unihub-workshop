# Spec: Payment Reconciliation Job (`payment-reconciliation`)

> **ASR hiện thực hóa:** ASR-5 (Idempotent Payment — timeout không gây trừ tiền 2 lần)
>
> **ADR tham chiếu:** ADR-08 (Idempotency Key — unresolved state), ADR-02 (Schema — payments, idempotency_keys)
>
> **Boundary:** Job này chỉ xử lý payments với status='UNRESOLVED'. Payments 'FAILED' hoặc 'SUCCEEDED' không được touch. Reconciliation không trigger refund — chỉ update trạng thái. Refund là quy trình nghiệp vụ riêng (ngoài scope).

---

## 1. Mô tả

Khi gateway timeout, payment được mark `unresolved` — tiền có thể đã bị trừ hoặc chưa, server không biết. Reconciliation job chạy mỗi 5 phút để query gateway với `idempotency_key` đã dùng, tìm kết quả thực, và update trạng thái payment trong DB.

---

## 2. Luồng chính

### 2.1 Job Schedule và Trigger

```
Schedule: Cron mỗi 5 phút
           -- "0/5 * * * *" hoặc equivalent

Manual trigger: POST /admin/payments/reconcile (BTC role)
                -- Dùng khi cần reconcile ngay sau incident

Concurrent run protection:
  Dùng PostgreSQL advisory lock: pg_try_advisory_lock(12345) (magic number cho job này)
  Nếu lock fail → job khác đang chạy → EXIT silently
  Lock tự release khi job kết thúc (session-level lock)
```

### 2.2 Main Reconciliation Loop

```
SELECT p.id, p.idempotency_key, p.registration_id,
       p.amount, p.currency, p.created_at,
       ik.key AS gateway_key
FROM payments p
JOIN idempotency_keys ik ON ik.key = p.idempotency_key
WHERE p.status = 'UNRESOLVED'
  AND p.created_at < now() - interval '5 minutes'  -- không reconcile quá sớm
  AND p.created_at > now() - interval '24 hours'   -- không reconcile quá cũ
ORDER BY p.created_at ASC
LIMIT 100;   -- process batch, tránh memory explosion

FOR EACH payment:
  Gọi gateway query API:
    GET gateway.com/charges?idempotency_key={payment.gateway_key}
    Timeout: 10 giây
    Headers: Authorization: Bearer <gateway_api_key>

  CASE response:
    200 { status: "succeeded", charge_id: "..." }:
      → update_payment_resolved(payment.id, 'SUCCEEDED', charge_id)

    200 { status: "failed", decline_code: "..." }:
      → update_payment_resolved(payment.id, 'FAILED', NULL)

    200 { status: "not_found" } (gateway không biết key này):
      -- Gateway chưa nhận request → payment chưa bao giờ được charge
      → update_payment_resolved(payment.id, 'FAILED', NULL)
         -- Treat as failed: tiền không bị trừ, student cần retry với key mới

    4xx client error:
      -- Lỗi từ phía mình (bad API key, bad format)
      LOG ERROR + ALERT: "Reconciliation API error: {status}" -- cần investigate
      CONTINUE (không update payment — giữ nguyên unresolved)

    5xx / timeout:
      LOG WARNING: "Gateway query failed for payment {id}"
      CONTINUE (retry ở lần chạy tiếp theo sau 5 phút)

  Sleep 100ms giữa mỗi payment (rate limiting)
```

### 2.3 Update Payment Resolved

```
update_payment_resolved(payment_id, final_status, gateway_charge_id):

  BEGIN TRANSACTION;

    UPDATE payments
      SET status            = :final_status,   -- 'SUCCEEDED' hoặc 'FAILED'
          gateway_charge_id = :gateway_charge_id,
          resolved_at       = now()
    WHERE id         = :payment_id
      AND status     = 'UNRESOLVED';   -- guard: không overwrite final state

    Nếu final_status = 'SUCCEEDED':
      UPDATE registrations
        SET status = 'PAID'
      WHERE id = (SELECT registration_id FROM payments WHERE id = :payment_id);

      addJob notification * {
        event_type: 'payment_confirmed_late',
        user_id:    :student_id,
        payload:    { workshop_title, amount, receipt_id: gateway_charge_id,
                      note: "Thanh toán đã được xác nhận (xử lý chậm)" }
      }

    Nếu final_status = 'FAILED' (bao gồm not_found):
      -- Student cần được thông báo để retry
      addJob notification * {
        event_type: 'payment_failed_reconciled',
        user_id:    :student_id,
        payload:    { workshop_title, amount,
                      message: "Thanh toán không thành công. Vui lòng thử lại." }
      }
      -- Note: registrations.status vẫn = 'PENDING' — student có thể retry

    UPDATE idempotency_keys
      SET status = 'COMPLETED'          -- đóng vòng đời key
    WHERE key = :payment.idempotency_key
      AND status = 'UNRESOLVED';

  COMMIT;
```

### 2.4 Cleanup — Idempotency Keys Expired

```
-- Chạy cùng job (sau reconciliation loop) hoặc job riêng

DELETE FROM idempotency_keys
WHERE expires_at < now()
  AND status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM payments
    WHERE idempotency_key = idempotency_keys.key
      AND status = 'UNRESOLVED'
  );
-- Không xóa key còn FK reference với payment unresolved
-- Không xóa key chưa expired
```

---

## 3. Kịch bản lỗi

### E-01: Gateway trả "not_found" cho key
```
Điều kiện: Gateway timeout ở lần charge đầu → payment unresolved.
           Reconciliation query: gateway không nhận được request ban đầu
Hành vi: Treat as 'FAILED'. Tiền không bị trừ.
         Student nhận notification "thử lại".
         registrations.status = 'PENDING' → student có thể mở payment flow lại.
Note: Student phải tạo payment_key MỚI (key cũ đã closed).
```

### E-02: Gateway trả "succeeded" — tiền đã bị trừ nhưng ta không biết
```
Điều kiện: Lần charge đầu: gateway nhận, trừ tiền, response lost trong network
           Reconciliation xác nhận: charge_id có thật
Hành vi: payment.status = 'SUCCEEDED', registration.status = 'PAID'
         Student nhận notification "Thanh toán đã được xác nhận (xử lý chậm)"
Note: Student không bị charge 2 lần nhờ forward idempotency key (ADR-08)
```

### E-03: Payment đã unresolved > 24 giờ
```
Điều kiện: Student không retry, key sắp hết TTL (24h)
Hành vi: Reconciliation job bỏ qua (WHERE created_at > now() - 24h)
         idempotency_key hết expires_at → job cleanup xóa key
         payments record vẫn còn với status='UNRESOLVED'
         (FK payments → idempotency_keys: ON DELETE là behavior cần handle)
Recovery: Admin query payments WHERE status='UNRESOLVED' AND created_at < 24h ago
          Manual investigation với gateway team
```

### E-04: Gateway API down khi reconciliation chạy
```
Điều kiện: gateway query timeout trong 10 giây
Hành vi: LOG WARNING. CONTINUE sang payment tiếp theo.
         Payment giữ nguyên status='UNRESOLVED'.
         Lần chạy tiếp theo (5 phút sau) retry.
```

---

## 4. Ràng buộc (Invariants)

**INV-01 — Never Touch Final States:**
Job chỉ update payments với `status='UNRESOLVED'`.
`status='SUCCEEDED'` và `status='FAILED'` KHÔNG BAO GIỜ bị overwrite.
Enforcement: `WHERE status='UNRESOLVED'` trong UPDATE guard.

**INV-02 — Single Job Instance:**
Không có 2 reconciliation jobs chạy cùng lúc.
Enforcement: PostgreSQL advisory lock.

**INV-03 — Not-found = Failed:**
Nếu gateway không nhận được charge request → treat as failed, không phải error.
Student cần tạo payment mới. Tiền không bị trừ.

**INV-04 — Notification on Both Outcomes:**
Cả succeeded và failed sau reconciliation đều phải notify student.
Student không nên phải tự kiểm tra — hệ thống push kết quả.

---

## 5. Tiêu chí chấp nhận

**AC-01 — Unresolved → succeeded:**
Payment unresolved. Gateway query → succeeded.
Then: payments.status='SUCCEEDED', registrations.status='PAID'. Student nhận notification.

**AC-02 — Unresolved → not_found:**
Payment unresolved. Gateway query → not_found.
Then: payments.status='FAILED'. registration.status='PENDING' (có thể retry).
Student nhận notification "thử lại".

**AC-03 — Job idempotency:**
Run job 2 lần cho cùng unresolved payment (gateway trả succeeded cả 2 lần).
Then: Chỉ 1 update thành công (guard `WHERE status='UNRESOLVED'`).
registration.status chỉ set 'PAID' 1 lần.

**AC-04 — Concurrent job prevention:**
Run 2 instances cùng lúc.
Then: Chỉ 1 instance chạy. Instance thứ 2 exit sau khi fail advisory lock.
