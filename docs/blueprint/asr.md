# UniHub Workshop — Architecturally Significant Requirements (ASR)

> **Mục đích tài liệu:** Ghi nhận các yêu cầu kiến trúc quan trọng — những yêu cầu định hình cách xây dựng hệ thống, không chỉ định hình *cái gì* được xây. Mỗi ASR có trích dẫn gốc từ `requirements.md` và được dẫn chiếu trực tiếp đến ADR đáp ứng nó.
>
> **Cách đọc:** ASR là cầu nối giữa đề bài và quyết định kỹ thuật. Khi đọc một ADR mà không hiểu *tại sao*, quay lại ASR tương ứng để biết yêu cầu nào đang được giải quyết.
>
> **Kim chỉ nam:** *Functional Requirements quyết định bạn xây cái gì. ASR quyết định bạn xây như thế nào.*

---

## Phần 1 — Phân biệt FR và ASR

| Loại | Ví dụ trong requirements.md | Vai trò |
|---|---|---|
| **Functional Requirement (FR)** | Xem workshop, đăng ký, tạo QR, check-in, AI summary, đồng bộ CSV | Định nghĩa *hệ thống làm gì* — không trực tiếp định hình kiến trúc |
| **Architecturally Significant Requirement (ASR)** | "12.000 SV trong 10 phút", "không trừ tiền 2 lần", "mất mạng vẫn check-in được" | Định nghĩa *hệ thống làm như thế nào* — **buộc ra quyết định kiến trúc cụ thể** |

FR và ASR có thể đến từ cùng một câu trong đề bài. Ví dụ: *"Sinh viên đăng ký workshop"* là FR. *"Không có hai sinh viên cùng nhận chỗ cuối"* trong cùng đoạn đó là ASR — nó buộc phải chọn Optimistic Locking hoặc Pessimistic Locking hay cơ chế nào khác.

---

## Phần 2 — Danh sách ASR

### ASR-01 — Tải đột biến (Spike Load)

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Dự kiến khoảng 12.000 sinh viên truy cập trong 10 phút đầu khi mở đăng ký, trong đó 60% dồn vào 3 phút đầu tiên. Hệ thống cần có cơ chế bảo vệ backend API khỏi bị quá tải"* |
| **Đặc tính chất lượng** | Performance · Scalability |
| **Hàm ý kiến trúc** | Backend phải chịu được ~40 req/s trung bình và burst ~240 req/s trong 3 phút đầu. Không thể xử lý tất cả request bằng DB write — cần lớp bảo vệ phía trước |
| **ADR đáp ứng** | ADR-01 (Modular Monolith — đủ cho 20 req/s trung bình), ADR-06 (Rate Limiting), ADR-13 (Cache giảm read load) |
| **Mức độ critical** | 🔴 Cao — nếu không xử lý, toàn bộ hệ thống sập trong 3 phút đầu |

---

### ASR-02 — Nhất quán mạnh khi tranh chấp chỗ ngồi

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Hệ thống phải đảm bảo không có hai sinh viên nào cùng nhận được chỗ cuối cùng"* |
| **Đặc tính chất lượng** | Strong Consistency (CP — ưu tiên Consistency over Availability khi tranh chấp) |
| **Hàm ý kiến trúc** | Đây là yêu cầu correctness tuyệt đối — không có margin of error. Buộc phải chọn cơ chế đảm bảo atomic decrement với ACID guarantee. Phân biệt với ASR-06: hai yêu cầu chọn trade-off CAP trái ngược nhau nhưng cho các bounded context khác nhau |
| **ADR đáp ứng** | ADR-03 (Optimistic Locking + `seats_available > 0` trong DB), ADR-02 (PostgreSQL — ACID), ADR-13 (Cache là pre-filter, không phải enforcement) |
| **Mức độ critical** | 🔴 Cao nhất — vi phạm ảnh hưởng trực tiếp đến uy tín và tài chính |

---

### ASR-03 — Mở rộng kênh thông báo không sửa code cũ

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Hệ thống cần thiết kế để dễ dàng bổ sung kênh thông báo mới (ví dụ: Telegram) trong các học kỳ sau mà không cần thay đổi lớn"* |
| **Đặc tính chất lượng** | Extensibility · Maintainability (Open/Closed Principle) |
| **Hàm ý kiến trúc** | Kiến trúc notification phải có điểm mở rộng tường minh. "Không cần thay đổi lớn" dịch thành: thêm channel không được chạm vào code xử lý business event. Buộc phải có abstraction layer giữa event producer và channel adapter |
| **ADR đáp ứng** | ADR-09 (Strategy Pattern — `NotificationChannel` interface), ADR-10 (Redis Streams cho async dispatch) |
| **Mức độ critical** | 🟡 Trung — không ảnh hưởng MVP nhưng là requirement tường minh của đề bài |

---

### ASR-04 — Cách ly lỗi cổng thanh toán

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Nếu cổng thanh toán gặp sự cố, sinh viên vẫn phải xem được lịch workshop và thông tin sự kiện bình thường... các tính năng không liên quan đến thanh toán vẫn phải hoạt động bình thường khi cổng thanh toán gặp sự cố kéo dài"* |
| **Đặc tính chất lượng** | Fault Isolation · Resilience · Graceful Degradation |
| **Hàm ý kiến trúc** | Failure của payment gateway không được cascade sang các module khác. Buộc phải có cơ chế fail-fast (không để request chờ timeout 30s mà chiếm connection pool) và graceful degradation (biết tính năng nào bị ảnh hưởng, tính năng nào không) |
| **ADR đáp ứng** | ADR-07 (Circuit Breaker — CLOSED/OPEN/HALF-OPEN, fail-fast trong 0ms khi OPEN) |
| **Mức độ critical** | 🔴 Cao — yêu cầu tường minh về fault isolation |

---

### ASR-05 — Idempotency thanh toán

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Luồng đăng ký có phí cần xử lý tình huống thanh toán timeout mà không gây ra trừ tiền hai lần"* |
| **Đặc tính chất lượng** | Reliability · Exactly-once Semantics |
| **Hàm ý kiến trúc** | Network timeout không xác định được kết quả (tiền đã trừ hay chưa). Buộc phải có cơ chế dedup ở cả server-side và gateway-side. Đây là yêu cầu có hậu quả tài chính trực tiếp — không thể giải quyết bằng "thử lại là được" |
| **ADR đáp ứng** | ADR-08 (Idempotency Key 3-state, forward key đến gateway) |
| **Mức độ critical** | 🟡 Trung — critical về correctness nhưng scope hẹp (chỉ luồng thanh toán) |

---

### ASR-06 — Hoạt động khi mất mạng và không mất dữ liệu

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Nhân sự ở khu vực mất mạng vẫn phải check-in được cho sinh viên; dữ liệu không được mất khi kết nối trở lại"* |
| **Đặc tính chất lượng** | Availability (AP — ưu tiên Availability over Consistency khi offline) · Eventual Consistency · Data Durability |
| **Hàm ý kiến trúc** | Hai yêu cầu được phát biểu cùng nhau: (1) phải hoạt động khi offline, (2) dữ liệu không được mất. Yêu cầu (2) tường minh hơn hầu hết offline-first system — không chỉ "offline OK" mà còn "sync phải thành công". Buộc phải có local persistence (không chỉ in-memory) và outbox pattern |
| **ADR đáp ứng** | ADR-11 (SQLite local-first + Outbox + Server-wins conflict resolution) |
| **Mức độ critical** | 🔴 Cao — đây là constraint vật lý (không kiểm soát được mạng trong trường) |
| **Ghi chú CAP** | ASR-02 chọn CP (seat allocation), ASR-06 chọn AP (check-in). Không mâu thuẫn vì thuộc hai bounded context khác nhau |

---

### ASR-07 — Xử lý nặng không chặn UX

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Hệ thống tự động xử lý [PDF], tách nội dung, làm sạch văn bản và gửi sang mô hình AI để tạo bản tóm tắt"* |
| **Đặc tính chất lượng** | Responsiveness · UX Non-blocking |
| **Nguồn gốc** | ⚠️ **NFR suy diễn** — spec nói "tự động xử lý" không nói "async". Tính async là hệ quả bắt buộc khi đối mặt với processing time 30s–2 phút: block HTTP response = reverse proxy timeout = UX fail. Đây là architectural inference từ đặc điểm kỹ thuật, không phải trích dẫn trực tiếp |
| **Hàm ý kiến trúc** | Mọi tác vụ có latency không xác định (AI API call, heavy computation) không được nằm trong synchronous HTTP path. Buộc phải có async processing pattern và trạng thái polling cho client |
| **ADR đáp ứng** | ADR-14 (AI Summary Pipeline — 202 Accepted + polling), ADR-10 (Redis Streams làm job queue) |
| **Mức độ critical** | 🟡 Trung — ảnh hưởng UX nhưng không ảnh hưởng correctness |

---

### ASR-08 — Batch pipeline không sập hệ thống khi file lỗi

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Luồng nhập dữ liệu phải xử lý được file lỗi, dữ liệu trùng và không làm gián đoạn hệ thống đang chạy"* + *"Hệ thống quản lý sinh viên hiện tại của trường chưa có API. Cách duy nhất để lấy dữ liệu là qua file CSV được export vào ban đêm"* |
| **Đặc tính chất lượng** | Robustness · Fault Tolerance (batch) · Integration Constraint |
| **Hàm ý kiến trúc** | Ba yêu cầu gộp: (1) xử lý được file lỗi — error quarantine không dừng pipeline, (2) idempotent — chạy lại nhiều lần ra cùng kết quả, (3) không làm gián đoạn — pipeline chạy song song với hệ thống đang phục vụ user. Constraint "không có API" là forcing function dẫn đến polling pattern |
| **ADR đáp ứng** | ADR-12 (Batch Sequential + error quarantine + idempotent upsert + cron) |
| **Mức độ critical** | 🟢 Thấp hơn — module này cô lập tốt, ít interaction với core |

---

### ASR-09 — Phân quyền 3 nhóm người dùng

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Trang admin chỉ dành cho nội bộ và cần kiểm soát truy cập chặt chẽ — ba nhóm người dùng có quyền hạn khác nhau: Sinh viên / Ban tổ chức / Nhân sự check-in"* |
| **Đặc tính chất lượng** | Security — Authentication · Authorization |
| **Hàm ý kiến trúc** | Ba nhóm có permission không chồng lấn: student chỉ đăng ký, BTC chỉ quản trị, checkin_staff chỉ quét QR. Đặc biệt: checkin_staff cần xác thực offline (không gọi server để verify JWT khi mất mạng — liên quan ASR-06). Buộc phải có stateless token với public key bundle trên mobile |
| **ADR đáp ứng** | ADR-04 (JWT RS256 + Refresh Token), ADR-05 (RBAC 3 roles + 3 enforcement layers) |
| **Mức độ critical** | 🟡 Trung — requirement rõ ràng, giải pháp tương đối standard |

---

### ASR-10 — Bảo vệ API khỏi spam và đảm bảo công bằng

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Hệ thống cần có cơ chế bảo vệ backend API khỏi bị quá tải, ngăn chặn các client gửi request liên tục và đảm bảo tính công bằng giữa các sinh viên đăng ký"* |
| **Đặc tính chất lượng** | Fairness · API Protection · Availability (under load) |
| **Hàm ý kiến trúc** | "Công bằng" là từ quan trọng — không chỉ limit tổng traffic mà còn đảm bảo không ai chiếm ưu thế bằng cách spam. Buộc phải có per-user limiting (không chỉ per-IP). Quan hệ với ASR-01: rate limiting là công cụ để đạt được ASR-01, không phải yêu cầu độc lập |
| **ADR đáp ứng** | ADR-06 (Sliding Window Counter 3-tier: IP / User / User×Workshop) |
| **Mức độ critical** | 🟡 Trung — cần thiết cho fairness nhưng OL (ADR-03) vẫn đảm bảo correctness kể cả khi rate limiting fail |

---

### ASR-11 — Hiển thị số chỗ còn lại theo thời gian thực

| Trường | Nội dung |
|---|---|
| **Trích dẫn gốc** | *"Sinh viên có thể xem... số chỗ còn lại theo thời gian thực"* |
| **Đặc tính chất lượng** | Data Freshness · Responsiveness (read path) |
| **Nguồn gốc** | ⚠️ **Yêu cầu FR với hệ quả ASR** — đây là functional requirement nhưng "thời gian thực" tạo constraint về staleness: cache TTL không thể quá dài, invalidation phải xảy ra ngay sau mỗi đăng ký thành công |
| **Hàm ý kiến trúc** | Tạo tension trực tiếp với ASR-01 (cache lâu = load thấp nhưng stale, cache ngắn = load cao nhưng fresh). Buộc phải có quyết định có chủ ý về TTL — không phải mặc định. Quyết định: "thời gian thực" được interpret là "stale tối đa 10 giây" — acceptable window khi cân với load protection |
| **ADR đáp ứng** | ADR-13 (Cache TTL 10s + Write-Invalidate sau mỗi đăng ký thành công) |
| **Mức độ critical** | 🟢 Thấp — ảnh hưởng UX nhưng correctness do OL (ADR-03) đảm bảo |

---

## Phần 3 — Bảng Tham chiếu ASR ↔ ADR

### 3.1 Mỗi ASR được đáp ứng bởi ADR nào?

| ASR | Đặc tính chất lượng | ADR chính | ADR hỗ trợ |
|---|---|---|---|
| ASR-01 Spike Load | Performance · Scalability | ADR-06 | ADR-01, ADR-13 |
| ASR-02 Strong Consistency | Strong Consistency (CP) | ADR-03 | ADR-02, ADR-13 |
| ASR-03 Extensibility Notification | Extensibility · OCP | ADR-09 | ADR-10 |
| ASR-04 Fault Isolation Payment | Fault Isolation · Resilience | ADR-07 | ADR-01 |
| ASR-05 Idempotent Payment | Reliability · Exactly-once | ADR-08 | ADR-07 |
| ASR-06 Offline Availability | Availability (AP) · Durability | ADR-11 | ADR-04 |
| ASR-07 Non-blocking UX | Responsiveness | ADR-14 | ADR-10 |
| ASR-08 Batch Robustness | Robustness · Fault Tolerance | ADR-12 | ADR-02 |
| ASR-09 Access Control | Security — Auth + Authz | ADR-04, ADR-05 | ADR-11 |
| ASR-10 API Fairness | Fairness · Protection | ADR-06 | — |
| ASR-11 Data Freshness | Data Freshness | ADR-13 | ADR-03 |

### 3.2 Mỗi ADR đáp ứng ASR nào?

| ADR | Quyết định | ASR đáp ứng | Critical |
|---|---|---|---|
| **ADR-01** | Architectural Style: Modular Monolith | ASR-01, 03, 04, 07 | 🔴 Cao nhất |
| **ADR-02** | Database: PostgreSQL primary + Redis auxiliary | ASR-02, 07, 08 | 🔴 Cao |
| **ADR-03** | Seat contention: Optimistic Locking | ASR-02 | 🔴 Cao |
| **ADR-04** | Authentication: JWT RS256 + Refresh Token | ASR-09, ASR-06¹ | 🟡 Trung |
| **ADR-05** | Authorization: RBAC 3 roles | ASR-09 | 🟡 Trung |
| **ADR-06** | Rate Limiting: Sliding Window 3-tier | ASR-01, ASR-10 | 🟡 Trung |
| **ADR-07** | Circuit Breaker: in-memory 3-state | ASR-04 | 🔴 Cao |
| **ADR-08** | Idempotency Key: client-generated, 3-state | ASR-05 | 🟡 Trung |
| **ADR-09** | Notification: Strategy Pattern in-process | ASR-03 | 🟡 Trung |
| **ADR-10** | Message Queue: Redis Streams | ASR-07, **ASR-03**² | 🟡 Trung |
| **ADR-11** | Mobile Offline: SQLite + Outbox + Server-wins | ASR-06 | 🔴 Cao |
| **ADR-12** | CSV Pipeline: Batch Sequential + Error Quarantine | ASR-08 | 🟢 Thấp hơn |
| **ADR-13** | Cache: Cache-Aside + Write-Invalidate, TTL 10s | ASR-01, ASR-02, **ASR-11**³ | 🟡 Trung |
| **ADR-14** | AI Summary: Async + AIProvider abstraction | ASR-07 | 🟡 Trung |

> ¹ ADR-04 dùng RS256 (asymmetric) một phần để hỗ trợ mobile offline verify — liên quan ASR-06
>
> ² **Đính chính:** Bảng phân tích gốc ghi "ADR-10 → ASR-7, **9**" — sai. ASR-9 là Authorization, không liên quan message queue. Đúng phải là ASR-07 (responsiveness) + ASR-03 (notification worker là consumer của Redis Streams)
>
> ³ ADR-13 là ADR đầu tiên giải quyết ASR-11 (data freshness) — không có trong bảng gốc

---

## Phần 4 — Xung đột ASR và cách giải quyết

### 4.1 CAP Tension: ASR-02 vs ASR-06

Đây là xung đột kiến trúc quan trọng nhất trong hệ thống:

```
ASR-02: Strong Consistency cho seat allocation
        → Không thể có 2 người nhận chỗ cuối
        → Chọn CP: chấp nhận reject request khi không chắc chắn

ASR-06: High Availability cho check-in offline
        → Phải hoạt động khi không có network
        → Chọn AP: chấp nhận eventual consistency, server-wins khi sync

Giải pháp: Bounded Context tách biệt
  - Registration domain: CP (OL + ACID PostgreSQL)
  - Check-in domain: AP (SQLite local-first + Outbox)
  Hai domain không share mutable state → CAP tension được giải quyết bằng partition
```

### 4.2 Tension: ASR-01 vs ASR-11

```
ASR-01 (Spike Load): cache lâu → ít DB hit → hệ thống sống sót
ASR-11 (Data Freshness): cache ngắn → data fresh → UX tốt hơn

Giải pháp: TTL 10 giây + Write-Invalidate (ADR-13)
  - 10 giây đủ để absorb spike burst (40 req/s × 10s = 400 buffer)
  - 10 giây đủ ngắn để UX chấp nhận được ("gần real-time")
  - Write-Invalidate: cache bị xóa ngay sau đăng ký thành công
  - Correctness vẫn do OL đảm bảo — cache chỉ là performance hint
```

### 4.3 Tension: ASR-04 vs ASR-05

```
ASR-04 (Fault Isolation): CB OPEN → reject payment ngay → gateway được bảo vệ
ASR-05 (Idempotent): retry phải hoạt động đúng kể cả khi CB OPEN

Giải pháp: Idempotency check TRƯỚC CB check (ADR-07 + ADR-08)
  - Key đã 'completed': trả cached response NGAY, kể cả khi CB OPEN
  - Key 'unresolved': cho phép retry đến gateway (không bị CB chặn)
  - Key không tồn tại: CB check → OPEN → reject (không pollute idempotency table)
```

---

## Phần 5 — ASR nào KHÔNG có trong requirements.md (Suy diễn)

Các ASR sau đây không có trích dẫn trực tiếp — là hệ quả bắt buộc từ các constraint khác:

| ASR (suy diễn) | Nguồn gốc suy diễn | ADR |
|---|---|---|
| **Durability of idempotency state** | Nếu idempotency key trong Redis → crash mất key → có thể double-charge → vi phạm ASR-05 | ADR-08 (chọn PostgreSQL thay Redis) |
| **Async là bắt buộc cho AI (ASR-07)** | AI API mất 30s-2 phút, HTTP timeout thường 30s → sync = fail. Spec không nói "async" nhưng sync không khả thi | ADR-14 |
| **Circuit Breaker state phải in-memory** | Modular Monolith (ADR-01) → 1 process → không cần distributed CB state | ADR-07 |
| **JWT offline verify** | ASR-06 (mất mạng vẫn check-in) + ASR-09 (cần auth) → phải verify token offline → không thể dùng session | ADR-04 (RS256 + public key bundle) |

---

## Phần 6 — ASR Coverage Check

Checklist kiểm tra mỗi ADR có gốc từ ít nhất 1 ASR:

| ADR | Có ASR gốc không? | Ghi chú |
|---|---|---|
| ADR-01 Modular Monolith | ✅ | ASR-01, 03, 04, 07 |
| ADR-02 PostgreSQL + Redis | ✅ | ASR-02 là forcing function |
| ADR-03 Optimistic Locking | ✅ | ASR-02 trực tiếp |
| ADR-04 JWT | ✅ | ASR-09 + ASR-06 (offline verify) |
| ADR-05 RBAC | ✅ | ASR-09 trực tiếp |
| ADR-06 Rate Limiting | ✅ | ASR-01, ASR-10 |
| ADR-07 Circuit Breaker | ✅ | ASR-04 trực tiếp |
| ADR-08 Idempotency | ✅ | ASR-05 trực tiếp |
| ADR-09 Strategy Pattern | ✅ | ASR-03 trực tiếp |
| ADR-10 Redis Streams | ✅ | ASR-07, ASR-03 |
| ADR-11 SQLite Offline | ✅ | ASR-06 trực tiếp |
| ADR-12 CSV Pipeline | ✅ | ASR-08 trực tiếp |
| ADR-13 Cache | ✅ | ASR-01, ASR-11 |
| ADR-14 AI Summary | ✅ | ASR-07 trực tiếp |

**Kết quả:** 14/14 ADR có ít nhất 1 ASR gốc → không có over-engineering ẩn.
