# Spec: Circuit Breaker (`circuit-breaker`)

> **ADR tham chiếu:** ADR-07 (Cách ly lỗi cổng thanh toán)
>
> **Cơ chế và lý do thiết kế:** Xem `design/04_safety-mechanism.md` § "Xử lý cổng thanh toán không ổn định" — giải thích state machine CLOSED / OPEN / HALF-OPEN, failure threshold, timeout 5 giây, và vì sao CB phải đứng sau idempotency check nhưng trước khi claim key.
>
> **Tài liệu này định nghĩa:** Hành vi quan sát được của payment path khi CB đóng/mở, contract của endpoint giám sát trạng thái CB, contract reset thủ công, error scenarios, invariants, và acceptance criteria.

---

## 1. Mô tả

Circuit Breaker chỉ áp dụng cho **payment gateway path**. Mục tiêu là fail-fast khi gateway down hoặc suy giảm nghiêm trọng, để bảo vệ connection pool và tránh cascading failure. CB không thay đổi business logic thanh toán; nó chỉ quyết định request có được phép đi tiếp đến gateway hay không.

CB là cơ chế **in-memory** theo process. Trạng thái gồm `CLOSED`, `OPEN`, `HALF_OPEN`, bộ đếm lỗi, và timestamp mở gần nhất. Khi CB `OPEN`, server phải trả 503 ngay, không gọi gateway, và không claim idempotency key mới.

---

## 2. Endpoint Mapping

| Endpoint | Phân quyền | Vai trò của CB |
|---|---:|---|
| `POST /payments` | `STUDENT` | CB kiểm tra trước khi gọi gateway; `OPEN` → 503 |
| `GET /admin/system/circuit-breaker` | `ORGANIZER` | Đọc trạng thái CB cho từng gateway |
| `POST /admin/system/circuit-breaker/{gateway}/reset` | `ORGANIZER` | Reset thủ công về `CLOSED` |

**Lưu ý:** Contract idempotency của `POST /payments` nằm ở `payment-idempotency.md`. Tài liệu này chỉ định nghĩa phần observable behavior do CB quyết định.

---

## 3. Circuit Breaker Contract

### 3.1 State behavior

| State | Hành vi quan sát được |
|---|---|
| `CLOSED` | Request payment được phép đi qua gateway; success/failure được ghi nhận để cập nhật bộ đếm |
| `OPEN` | Request bị từ chối ngay với `503 Service Unavailable`; không gọi gateway |
| `HALF_OPEN` | Chỉ một request probe được phép đi qua; các request còn lại vẫn bị từ chối như `OPEN` |

### 3.2 Threshold behavior

CB phải chuyển sang `OPEN` khi một trong hai điều kiện xảy ra:

- 5 lỗi liên tiếp
- tỉ lệ lỗi >= 50% trong cửa sổ 60 giây

CB phải giữ `OPEN` trong 30 giây trước khi chuyển sang `HALF_OPEN`.

### 3.3 Payment error contract

| Tình huống | HTTP status | Error code | Ý nghĩa |
|---|---:|---|---|
| Gateway đang down và CB `OPEN` | 503 | `PAYMENT_GATEWAY_OPEN` | Từ chối ngay, client thử lại sau |
| Gateway timeout khi đang gọi | 504 | `PAYMENT_TIMEOUT` | Kết quả chưa xác định; retry với cùng idempotency key |
| Gateway decline hợp lệ | 402 | `PAYMENT_GATEWAY_ERROR` hoặc code decline tương ứng | Giao dịch bị từ chối, không charge |

**Quan trọng:** Khi CB `OPEN`, server phải trả 503 trước khi claim key mới. Nếu request đã có key `completed`, response cached của idempotency layer vẫn phải được trả trước CB logic.

### 3.4 Admin monitoring contract

`GET /admin/system/circuit-breaker` phải trả tối thiểu:

- `gateway`
- `state`
- `failure_count`
- `opened_at`
- `last_attempt`

`POST /admin/system/circuit-breaker/{gateway}/reset` phải đưa gateway đó về `CLOSED` và reset bộ đếm về 0.

---

## 4. Error Scenarios

### E-01: 5 lỗi liên tiếp mở CB

```
Điều kiện: 5 request payment liên tiếp gọi gateway và thất bại
Kết quả: CB chuyển từ CLOSED sang OPEN
```

### E-02: Tỉ lệ lỗi >= 50% trong 60 giây

```
Điều kiện: Trong 60 giây gần nhất, số failure đạt ngưỡng 50%
Kết quả: CB chuyển sang OPEN, dù không đủ 5 lỗi liên tiếp
```

### E-03: CB OPEN trả 503 ngay

```
Điều kiện: CB đang OPEN
Kết quả: POST /payments trả 503 ngay, không gọi gateway, không claim idempotency key mới
```

### E-04: HALF_OPEN cho đúng một probe

```
Điều kiện: Hết 30 giây OPEN, nhiều request đến đồng thời
Kết quả: Chỉ 1 request được phép đi qua gateway làm probe
```

### E-05: Probe success đóng CB

```
Điều kiện: Probe ở HALF_OPEN thành công đủ 2 lần liên tiếp
Kết quả: CB quay về CLOSED và reset bộ đếm
```

### E-06: Probe failure mở lại CB

```
Điều kiện: Probe ở HALF_OPEN thất bại
Kết quả: CB quay lại OPEN và reset timer 30 giây
```

### E-07: Gateway timeout

```
Điều kiện: Gateway không phản hồi trong 5 giây
Kết quả: HTTP 504 + payment được đánh dấu unresolved; CB tính đây là failure
```

### E-08: Admin reset

```
Điều kiện: ORGANIZER gọi POST /admin/system/circuit-breaker/{gateway}/reset
Kết quả: Gateway đó về CLOSED, failure_count = 0
```

---

## 5. Invariants

**INV-01 — State Machine Fenced:**
Chỉ có 3 trạng thái hợp lệ: `CLOSED`, `OPEN`, `HALF_OPEN`.

**INV-02 — Open Timer Is Hard:**
Khi đã OPEN, timer 30 giây không được reset bởi request đến.

**INV-03 — Fail Fast in OPEN:**
`OPEN` phải trả 503 ngay và không gọi gateway.

**INV-04 — No Idempotency Claim on OPEN:**
CB OPEN không được claim key mới trong bảng idempotency.

**INV-05 — Single Probe in HALF_OPEN:**
HALF_OPEN chỉ cho phép một probe request đi qua tại một thời điểm.

**INV-06 — Timeout Counts as Failure:**
Gateway timeout phải làm tăng failure count và góp phần mở CB.

**INV-07 — Admin Reset Is Explicit:**
CB không tự reset bằng tay người dùng; chỉ timer hoặc endpoint admin được phép đổi state.

---

## 6. Acceptance Criteria

**AC-01 — Closed path passes:**
Given CB đang CLOSED, khi POST /payments gọi gateway thành công, Then request đi qua bình thường.

**AC-02 — Threshold opens breaker:**
Given 5 lỗi liên tiếp hoặc failure rate >= 50%/60s, Then CB chuyển sang OPEN.

**AC-03 — Open returns 503:**
Given CB OPEN, Then POST /payments trả 503 ngay, không chạm gateway.

**AC-04 — No key claim on open:**
Given CB OPEN, Then request mới không tạo `in_progress` idempotency key.

**AC-05 — Cached payment result survives open:**
Given idempotency key đã `completed`, Then retry vẫn nhận response cached dù CB đang OPEN.

**AC-06 — Half-open probe is single:**
Given 30 giây OPEN đã hết, Then chỉ một request probe được đi qua.

**AC-07 — Probe success closes breaker:**
Given probe thành công đủ 2 lần liên tiếp, Then CB quay về CLOSED.

**AC-08 — Probe failure reopens breaker:**
Given probe thất bại, Then CB quay lại OPEN và timer reset 30 giây.

**AC-09 — Timeout becomes unresolved:**
Given gateway timeout, Then response là 504 và payment được đánh dấu unresolved để reconciliation xử lý.

**AC-10 — Admin visibility and reset work:**
Given ORGANIZER gọi endpoint giám sát và reset, Then trạng thái hiện tại được đọc đúng và reset đưa CB về CLOSED.

---

## 7. Code Review Checklist

- CB check nằm sau idempotency lookup và trước khi claim key mới.
- `OPEN` trả 503 mà không gọi gateway.
- Timeout 5 giây được tính là failure.
- HALF_OPEN chỉ cho một probe.
- Probe failure quay lại OPEN ngay.
- Probe success chỉ đóng breaker sau 2 success liên tiếp.
- Admin reset không ảnh hưởng các gateway khác.
- Trạng thái CB là in-memory và không phụ thuộc Redis.
- Payload 503/504 khớp error code đã định nghĩa.
- Spec này không lặp lại contract idempotency chi tiết.

---

## 8. Integration

- `payment-idempotency.md` định nghĩa lifecycle của key và hành vi `completed` / `unresolved`.
- `design/04_safety-mechanism.md` định nghĩa state machine và thứ tự kiểm tra trong payment flow.
- `openapi.yaml` là nguồn chi tiết cho schema response và error code enum.
