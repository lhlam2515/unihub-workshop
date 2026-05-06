# UniHub Workshop — Architecture Decision Records (ADR)

> **Mục đích tài liệu này:** Ghi nhận *quyết định kiến trúc* — trả lời câu hỏi "Tại sao chọn A trong n phương án?" cho mỗi lựa chọn kỹ thuật quan trọng. Không chứa pseudocode hay schema chi tiết.
>
> **Cách đọc:** ADR được viết theo thứ tự *nhân quả*, không phải thứ tự số. ADR-02 và ADR-03 là cause; ADR-13 phải được co-design với ADR-03. ADR-01 là label tổng kết sau khi các ADR cụ thể đã chốt.
>
> **Tài liệu liên quan:**
>
> - Schema SQL đầy đủ → `data/schema.sql`
> - Cơ chế hoạt động chi tiết (Rate Limiting, CB, Idempotency) → `design/04_safety-mechanism.md`
> - Enforcement authentication/authorization → `access-control.md`
> - Luồng nghiệp vụ và AC → `specs/`

---

## ADR-02 — Lựa chọn Database chính và lớp phụ trợ

### 1. Quyết định

**PostgreSQL** làm primary database duy nhất — source of truth cho mọi trạng thái nghiệp vụ. **Redis** làm lớp phụ trợ cho ba mục đích cụ thể: cache `seats_available` (TTL ngắn), sliding window counters cho Rate Limiting (volatile), và Redis Streams cho async job queue. Redis không bao giờ là source of truth.

Schema đầy đủ → `data/schema.sql`.

### 2. Lý do chọn

**PostgreSQL được force bởi ADR-03:** Optimistic Locking đòi `UPDATE ... WHERE version = ?` trả về *số rows affected* chính xác, và bảo đảm constraint `seats_available >= 0` không vi phạm. Đây là ACID transaction cấp row — không phải cấp document.

Khi đã có PostgreSQL, các bài toán khác được giải miễn phí:

| Bài toán | PostgreSQL native solution |
|---|---|
| Idempotency (ADR-08) | `UNIQUE` constraint + `INSERT ... ON CONFLICT DO NOTHING` là atomic check-and-insert |
| CSV upsert (ADR-12) | `INSERT ... ON CONFLICT DO UPDATE` — chạy lại nhiều lần cùng kết quả |
| Ngăn đăng ký trùng | `UNIQUE (workshop_id, student_id)` — defense layer sau idempotency key |
| First-check-in-wins (ADR-11) | `UNIQUE (registration_id)` trên `checkins` — không cần lock |

**Tách bảng `students` và `staff`:** Lifecycle hoàn toàn khác nhau — students sync từ CSV đêm (ADR-12), staff được provision thủ công. Gộp một bảng tạo nhiều cột nullable và làm mờ ranh giới lifecycle.

**`qr_code` là UUID v4 riêng biệt, không phải `registrations.id`:** Registration ID có thể predictable (sequential). UUID v4 random 122-bit entropy không brute-force được. Tách cho phép re-issue QR mà không đổi registration ID.

**Redis cho ba việc, không hơn:** Cache (performance hint), Rate Limit counters (volatile — mất là tự reset), job queue (Streams với persistence). Giới hạn rõ vai trò để tránh Redis trở thành implicit source of truth.

### 3. Trade-off và rủi ro

**Single-node PostgreSQL = single bottleneck.** Dưới spike 7,200 req/3 phút, connection pool có thể cạn nếu không có lớp bảo vệ phía trước (Redis cache giảm read load, Rate Limiting giảm write load). Nếu cả hai layer đó fail, hệ thống trả lỗi gracefully — không sập silently.

**Không scale ngang.** Với 12,000 user/10 phút ≈ 20 req/s trung bình, không cần scale ngang. Nếu đồ án sau đòi 10× traffic, PostgreSQL là điểm phải xem lại đầu tiên.

**FK cycle giữa `payments` và `idempotency_keys`.** Job dọn key đêm phải skip key đang được reference bởi `payments.status='unresolved'`. Giải pháp: subquery trong điều kiện DELETE — xem `database-schema.md`.

### 4. Phương án đã cân nhắc nhưng không chọn

**MongoDB:** Document-level ACID từ v4.0, nhưng atomic decrement `seats_available` đòi `findAndModify` với `$inc` — không tự nhiên bằng PostgreSQL row-level UPDATE. CSV upsert không có `ON CONFLICT` native.

**Redis làm primary cho `seats_available`:** `DECR` atomic và nhanh, nhưng volatile — crash mất seats. AOF sync đồng bộ tăng độ phức tạp ngang PostgreSQL nhưng thiếu relational integrity.

**MySQL:** Khả thi về OL và upsert. Không chọn vì PostgreSQL có `ON CONFLICT` tốt hơn cho CSV upsert, `JSONB` cho idempotency response body, và partial index linh hoạt hơn.

**Bảng `users` chung cho student và staff:** Đơn giản hơn schema nhưng force nhiều cột nullable và xóa ranh giới lifecycle. Tách bảng giữ schema chặt chẽ.

---

## ADR-03 — Cơ chế kiểm soát tranh chấp chỗ ngồi

### 1. Quyết định

**Optimistic Locking (OL)** tại tầng database với cột `version BIGINT` trên bảng `workshops`, kết hợp **pre-check Redis** để lọc request không có cơ hội thành công trước khi chạm DB.

Cơ chế cốt lõi: đọc *không lock* (không dùng `FOR SHARE`/`FOR UPDATE`), kiểm tra `version` khi ghi. Nếu `version` đã thay đổi giữa lúc đọc và lúc ghi → `rowsAffected = 0` → retry. MAX_RETRIES = 1 (2 attempts tổng). Retry không quay lại bước claim idempotency key.

Pseudocode đầy đủ → `design/04_safety-mechanism.md` và `specs/registration-paid.md`.

### 2. Lý do chọn

**Pattern read-heavy, write-infrequent** là điều kiện lý tưởng cho OL. Hàng nghìn sinh viên đọc trang workshop, nhưng chỉ vài chục người ghi đồng thời trong peak second. Xung đột là ngoại lệ — OL tối ưu cho trường hợp này.

**Correctness tại DB layer, không phải application layer.** `WHERE seats_available > 0` trong UPDATE bảo đảm bởi PostgreSQL MVCC — dù 1,000 connection gửi UPDATE đồng thời, không ai nhận `seats_available < 0`.

**Pre-check Redis giảm tải thực sự.** Sau khi workshop hết chỗ, toàn bộ request sau đó bị chặn tại Redis — không request nào đến PostgreSQL. ADR-03 và ADR-13 phải co-design: nếu không có Redis pre-check, hot-row contention trên `workshops.version` sẽ nghiêm trọng dưới spike.

**Defense layer 2 phải rollback layer 1.** Khi `INSERT registrations` bị UNIQUE constraint (student đã đăng ký), `UPDATE workshops` đã decrement `seats_available` phải rollback trong cùng transaction. Nếu không: 1 chỗ bị mất phantom — không có registration tương ứng. Đây là invariant bắt buộc trong implementation.

### 3. Trade-off và rủi ro

**Retry có ceiling cứng.** MAX_RETRIES = 1 để tránh vòng lặp vô tận khi contention cao. Sau 2 attempts đều conflict → 503 `Try Again Later` với `Retry-After: 2`. Lý do ceiling ở 1: sau lần retry đầu tiên, version mới đã được đọc — nếu conflict tiếp, đây là dấu hiệu contention thực sự cao, không phải timing issue.

**Version conflict vs. "Hết chỗ" phải phân biệt.** `rowsAffected = 0` có thể do version mismatch (có slot nhưng bị người khác lấy trước) hoặc `seats_available = 0` (thực sự hết). Hai trường hợp cần response khác nhau — implementation phải re-read `seats_available` sau conflict để phân biệt.

**Hot-row vẫn có thể xảy ra** nếu Rate Limiting (ADR-06) không đủ. RL là vòng ngoài giảm collision rate; OL là correctness guarantee bên trong. Không thể dùng OL một mình để xử lý spike 12,000 user.

### 4. Phương án đã cân nhắc nhưng không chọn

**Pessimistic Locking (`SELECT ... FOR UPDATE`):** Zero collision bằng cách serialize writer. Phù hợp khi xung đột thường xuyên và write rate cao hơn read rate — không phải pattern của đồ án. Dưới 12,000 user đọc và vài trăm ghi, PL tạo hàng đợi lock dài, giảm throughput đáng kể.

**Redis `DECR seats:workshop_42` làm primary:** Atomic và nhanh hơn OL, nhưng không bền (xem ADR-02). Có thể dùng làm pre-filter — vai trò đó đã được giao cho Redis cache trong ADR-13.

**Distributed Lock (Redlock):** Giải bài toán nhiều process cạnh tranh một resource. Đồ án chỉ có một PostgreSQL node và một application process — không có race condition cross-process. Thêm Redlock = thêm SPOF không cần thiết.

---

## ADR-13 — Cache Strategy cho `seats_available` và Workshop List

### 1. Quyết định

**Cache-Aside với Write-Invalidate** (không phải Write-Through). Hai cache key:

- `cache:workshop:{id}:seats` — TTL **10 giây**
- `cache:workshop:list` — TTL **60 giây**

Sau khi OL UPDATE commit: `DEL cache:workshop:{id}:seats` (fire-and-forget, ngoài transaction). Cache không bao giờ được dùng làm enforcement — chỉ là performance hint. Correctness do OL tại DB đảm bảo.

### 2. Lý do chọn — và tại sao TTL 10 giây

ADR-13 phải được **co-design với ADR-03** vì TTL kiểm soát trực tiếp số lượng OL retry dưới tải đột biến:

```
TTL dài → nhiều user thấy seats stale → nhiều user vào OL write cùng lúc → retry storm
TTL ngắn → cache miss rate cao → DB connection pool chịu tải read nặng → latency tăng
```

**TTL 10 giây** dựa trên phép tính: spike đỉnh = 7,200 người / 180s = **40 RPS**. Với TTL 10s, sau khi hết chỗ, tối đa 40 × 10 = 400 người thấy stale cache. 400 người này vào OL write, nhận `rowsAffected = 0` (DB đúng), re-read `seats = 0`, nhận "Hết chỗ" — không retry storm vì DB là enforcement point, không phải cache.

**Write-Invalidate thay vì Write-Through** vì fault isolation: Write-Through đòi Redis write thành công trong PostgreSQL transaction — nếu Redis timeout, transaction rollback. Write-Invalidate tách biệt hoàn toàn: Redis down → DEL fail → cache tự expire → lần đọc tiếp theo miss → fill từ DB. Không mất data, chỉ có stale window hơi dài hơn.

**Ranh giới thiết kế quan trọng:** Cache cung cấp pre-filter (giảm load), OL cung cấp enforcement (correctness). Lẫn lộn hai vai trò này là nguồn gốc của hầu hết bugs liên quan đến overselling.

### 3. Trade-off và rủi ro

**Race condition giữa COMMIT và DEL** (dual-write gap ~1–2ms): Request đọc cache sau COMMIT nhưng trước DEL sẽ thấy stale value, vào OL write, nhận `rowsAffected = 0`, re-read DB và nhận đúng kết quả. Correctness không bị ảnh hưởng — chỉ tốn thêm 1 DB round-trip. Chấp nhận được.

**Admin update path không qua OL:** Khi BTC tăng `seats_total`, code path khác với registration flow. Bắt buộc phải `DEL cache` thủ công ở admin handler — không được bỏ qua. Đây là implicit assumption cần explicit trong checklist code review.

### 4. Phương án đã cân nhắc nhưng không chọn

**Write-Through Cache:** Đảm bảo cache luôn nhất quán. Bị loại vì coupling Redis vào PostgreSQL transaction path — fault isolation bị phá vỡ.

**TTL 1–2 giây:** Cache miss rate quá cao dưới spike — không absorb được burst read traffic.

**TTL 60 giây cho `seats_available`:** Quá stale. 60 × 40 = 2,400 người có thể thấy wrong count, tạo batch OL collision. TTL 60s phù hợp cho workshop metadata (tên, địa điểm) — không phải `seats_available`.

**Redis DECR làm atomic counter:** Loại bỏ OL complexity. Vấn đề: DECR atomic nhưng Redis không có FK — validation logic phải ở application layer, tạo TOCTOU race condition. Phức tạp hơn, không ít hơn.

---

## ADR-01 — Architectural Style (Label Document)

> Đây là label document — ghi lại kiến trúc tổng thể như tổng kết của các ADR cụ thể, không phải quyết định độc lập. Module boundaries đầy đủ → `design/01_architecture.md`.

### Kiến trúc: Modular Monolith

Một process duy nhất, nhiều module với ranh giới enforce tại compile time (package-level), không phải network boundary.

**Kết luận này đến từ các ADR đã chốt:**

- ADR-02 chốt single PostgreSQL node → không cần distributed transaction → không cần service isolation
- ADR-03 dùng ACID transaction bao gồm idempotency key check + INSERT registrations → đòi cùng DB connection → không thể cross-service
- ADR-07 CB state in-memory (single process) → không cần distributed state coordination
- ADR-08, ADR-12 đều dùng `ON CONFLICT` trên cùng schema → monolith tự nhiên

**Điều này KHÔNG có nghĩa là:**

- Mọi request đều đồng bộ (AI summary và batch notification vẫn async qua Redis Streams — ADR-10)
- Không thể tách thành Microservices sau này (ranh giới module được thiết kế để dễ extract)

---

## ADR-07 — Cách ly lỗi cổng thanh toán (Circuit Breaker)

### 1. Quyết định

**Circuit Breaker in-memory** với ba trạng thái CLOSED / OPEN / HALF-OPEN, bao bọc toàn bộ lời gọi đến payment gateway. State lưu trong process memory (không Redis) — phù hợp với Modular Monolith một process (ADR-01).

**Tham số vận hành:**

| Tham số | Giá trị | Lý do |
|---|---|---|
| Failure threshold | 5 lỗi liên tiếp **HOẶC** ≥ 50% trong 60s | OR logic: bắt cả burst failure và sustained degradation |
| Per-request timeout | 5 giây | Gateway thường < 2s; 5s đủ buffer |
| Thời gian giữ OPEN | 30 giây | Đủ thời gian gateway restart |
| Probe (HALF-OPEN) | 1 request, atomic CAS | Tránh thundering herd |
| Close threshold | 2 successes liên tiếp | 1 success có thể là fluke |

**Graceful degradation khi OPEN:** Workshop miễn phí không bị ảnh hưởng. Workshop có phí trả 503 có nghĩa. Các tính năng khác (xem workshop, check-in) tiếp tục bình thường.

**Thứ tự bắt buộc trong payment flow:** Idempotency check (①) → CB check (②) → Claim key (③). Lý do ordering và implementation chi tiết → `design/04_safety-mechanism.md`.

### 2. Lý do chọn

**Tại sao in-memory:** Với Modular Monolith một process, tất cả request đều qua cùng một CB instance — không có race condition cross-process. Redis-based CB chỉ cần khi có nhiều application instances. Restart process reset CB về CLOSED — đây là *correctness guarantee*, không phải limitation: process mới không có failure history cũ, gateway có thể đã phục hồi.

**Tại sao OR logic cho threshold:** 5 lỗi liên tiếp bắt burst failure (gateway crash đột ngột). 50%/60s bắt sustained degradation (gateway trả lỗi xen kẽ success trong thời gian dài). Chỉ dùng một điều kiện bỏ sót một pattern.

**Tại sao CB không thể thay thế Rate Limiting:** Rate Limiting giảm volume request. CB fail-fast khi gateway down. Không phải substitutes — giải quyết hai failure mode khác nhau.

### 3. Trade-off và rủi ro

**Timeout là failure loại đặc biệt.** Gateway timeout → CB ghi failure (đóng góp vào threshold) → idempotency key mark `unresolved` (không phải `completed`). Client retry với cùng key → gateway dedup. Chi tiết → `design/04_safety-mechanism.md` và ADR-08.

**HALF-OPEN race với concurrent probes.** Hai request đến cùng lúc trong HALF-OPEN đều nghĩ mình là probe. Implementation bắt buộc dùng atomic CAS trên `probe_sent` flag — chỉ request đầu tiên đi qua.

### 4. Phương án đã cân nhắc nhưng không chọn

**Chỉ dùng timeout (không CB):** Mỗi request đến gateway down chờ 5s trước khi nhận lỗi. Dưới tải đỉnh, connection pool bị chiếm bởi requests đang chờ → các endpoint không liên quan đến payment cũng bị block. CB fail-fast trong 0ms khi OPEN.

**Bulkhead Pattern thay thế CB:** Cô lập pool connection của gateway. Bổ sung cho CB, không thay thế. Không implement vì mock gateway không có real latency — optimization, không phải correctness requirement.

**Retry + exponential backoff (không CB):** Retry giúp với lỗi thoáng qua nhưng làm tệ hơn khi gateway thực sự down — mỗi retry thêm load lên gateway đang sự cố.

---

## ADR-08 — Idempotency Key cho thanh toán

### 1. Quyết định

**Client-generated idempotency key** (UUID v4, sinh một lần trước khi gửi, không sinh lại khi retry). Key lưu trong PostgreSQL bảng `idempotency_keys` (schema → `database-schema.md`). Key được **forward đến payment gateway** như `Idempotency-Key` header — đây là quyết định phân biệt ADR-08 với idempotency registration ở ADR-03.

**3 trạng thái:**

- `in_progress` — đang xử lý, có `locked_until` (~30s) cho crash recovery
- `completed` — kết quả xác định (200/4xx), response đã cache, terminal state
- `unresolved` — đã gọi gateway nhưng timeout/network drop, **không terminal** — retry với cùng key để gateway dedup

Flow đầy đủ → `design/04_safety-mechanism.md`. Behavioral spec → `specs/registration-paid.md`.

### 2. Lý do chọn

**Tại sao forward key đến gateway:** Nếu không forward và gateway timeout, client retry với key mới → gateway xem như request mới → charge lần 2. Với forward: client retry với cùng key → gateway trả kết quả đã cache → không charge thêm. Gateway là người bảo đảm idempotency ở tầng charge; server bảo đảm không gọi gateway với key khác nhau cho cùng intent.

**Tại sao `unresolved` khác `completed`:** Nếu mark timeout là `completed` với cached 504: client nhận 504 cũ → không biết tiền đã bị trừ hay chưa → bắt buộc dùng key mới → double-charge. `unresolved` cho phép retry tiếp cận gateway với cùng key.

**Tại sao client-generated thay vì server-generated:** Server-generated đòi 2 round-trips (initiate → confirm). Nếu client crash sau bước 1, key là orphan entry. Client-generated: 1 round-trip, client lưu key ngay sau khi sinh — không có orphan.

**Tại sao PostgreSQL thay vì Redis:** Redis volatile — crash mất idempotency state, in-progress key biến mất, không có crash recovery. PostgreSQL với PRIMARY KEY B-tree index: O(log n) lookup, với vài nghìn payment/ngày không đo được khác biệt so với Redis O(1). Durability trumps latency ở đây.

**Tại sao dùng chung bảng với registration idempotency:** Registration key và payment key có cùng lifecycle (claim → complete/unresolved → expire 24h) và cùng crash recovery mechanism. Tách bảng là code duplication không có lợi ích. `resource_type` đủ để phân biệt semantic.

### 3. Trade-off và rủi ro

**Worst case — client không retry:** Sau 24h, idempotency key bị xóa (với bảo vệ FK). `payments.status='unresolved'` không bị xóa theo. Reconciliation job chạy mỗi 5 phút query `payments WHERE status='unresolved'` → gọi gateway để biết kết quả thực. Chi tiết → `specs/payment-reconciliation.md`.

**Key validation:** Server phải validate format UUID v4 tại middleware. Key giả mạo (`"admin-free-pass"`) không có ý nghĩa về security (key chỉ là dedup token) nhưng validation giữ schema sạch.

### 4. Phương án đã cân nhắc nhưng không chọn

**Key lưu trong Redis:** Nhanh hơn, nhưng volatile — crash recovery mất. Correctness trumps performance.

**Server-generated key (two-phase commit):** Hai round-trips, orphan key khi client crash. Gateway vẫn cần client-side key để dedup — two-phase ở server không giải quyết gateway-side deduplication.

**Không có idempotency, chỉ dùng CB:** CB ngăn double-call khi gateway down nhưng không ngăn double-charge khi response mất sau khi gateway đã xử lý. CB và Idempotency giải quyết hai failure mode khác nhau.

---

## ADR-04 — Authentication: JWT với Refresh Token

### 1. Quyết định

**JWT access token** TTL 15 phút (RS256), **Refresh Token** TTL 7 ngày trong HttpOnly cookie. Không có server-side session store. Hai endpoint đăng nhập riêng: `POST /auth/login/student` (tra `students`) và `POST /auth/login/staff` (tra `staff`, đọc `staff.role`).

JWT payload → `access-control.md`. HTTP contract → `specs/authentication.md`.

### 2. Lý do chọn

**Stateless:** Không cần session store. Mỗi request tự chứa thông tin xác thực — phù hợp với Modular Monolith không có distributed session.

**Mobile offline (ADR-11):** Staff check-in cần validate token khi mất mạng. JWT tự chứa signature và expiry — mobile verify bằng public key bundle offline. Session-based auth không thể làm được điều này.

**Hai endpoint login riêng:** Phản ánh schema tách (ADR-02). Một endpoint chung buộc query cả 2 bảng — phức tạp hơn và có thể lộ timing attack giữa "student có email này" vs "staff có email này".

**Boundary:** JWT access token không thể revoke trước TTL 15 phút. Nếu cần immediate revoke → token blacklist Redis → `specs/auth-revocation.md`.

### 3. Trade-off và rủi ro

**Silent refresh:** TTL 15 phút tạo UX ma sát. Frontend tự gọi `/auth/refresh` khi token còn < 2 phút — user không nhận biết. Nếu refresh token hết hạn (7 ngày) → redirect login.

**Mobile exception:** Cookie không available trên mobile → refresh token gửi trong response body và lưu trong Android Keystore / iOS Keychain.

**RS256 thay vì HS256:** Private key chỉ ở auth service, public key verify ở mọi nơi kể cả mobile bundle offline. Trong monolith không có lợi ích lớn, nhưng setup đúng từ đầu tránh migration sau.

### 4. Phương án đã cân nhắc nhưng không chọn

**Session-based auth:** Đơn giản hơn nhưng đòi session store (Redis) và không hỗ trợ offline validation cho mobile. ADR-11 là forcing function.

**Long-lived JWT (24h+, không refresh token):** Window bị exploit dài — token bị đánh cắp đầu buổi dùng được đến cuối buổi sự kiện.

**OAuth2 với SSO trường:** Phù hợp production nhưng đòi tích hợp LDAP/CAS — ngoài scope.

---

## ADR-05 — Authorization: RBAC với 3 roles

### 1. Quyết định

**RBAC** với 3 roles cứng (`student`, `btc`, `checkin_staff`), không có role hierarchy, không có ABAC trong phạm vi đồ án. Permission gắn với role tại deployment time — không lưu trong DB, không thay đổi runtime. Enforcement tại 3 điểm theo thứ tự: JWT middleware (Layer ①) → Route RBAC middleware (Layer ②) → Query-level filter (Layer ③).

Permission matrix đầy đủ và route mapping → `specs/authorization.md`. Implementation 3 lớp → `access-control.md`.

### 2. Lý do chọn

**RBAC là fit tự nhiên** khi permission phân theo nhóm người dùng, không theo attribute của resource. 3 roles có permission hoàn toàn tách biệt — không có overlap hay conditional.

**Layer ③ (Query-level filter) là điểm dễ bị bỏ qua nhất.** Middleware Layer ② bảo đảm *"student được vào endpoint này"*. Query filter Layer ③ bảo đảm *"student chỉ thấy data của mình"*. Hai điều khác nhau hoàn toàn — thiếu Layer ③ là security bug.

### 3. Trade-off và rủi ro

**Role cứng không xử lý attribute-level permission.** *"BTC chỉ sửa workshop do mình tạo"* đòi ABAC. Hiện tại mọi BTC được trust như nhau — quyết định có ý thức vì không có multi-BTC competition. Schema có `workshops.created_by` để mở rộng sau chỉ cần thêm WHERE clause tại Layer ③.

**Role trong JWT không revoke real-time.** Downgrade BTC → student: JWT cũ có role `btc` tối đa 15 phút. Nếu cần immediate revoke → `specs/auth-revocation.md`.

### 4. Phương án đã cân nhắc nhưng không chọn

**ABAC:** Hỗ trợ policy phức tạp. Không cần thiết với 3 roles và permission matrix đơn giản — over-engineering.

**Permission per-route lưu trong DB:** Linh hoạt nhưng thêm DB query mỗi request chỉ để check permission không thay đổi trong runtime — overhead không xứng với lợi ích.

**Role hierarchy (BTC inherit student permissions):** BTC và student có usecase khác nhau, gộp tạo confused responsibility.

---

## ADR-06 — Rate Limiting

### 1. Quyết định

**Sliding Window Counter** với Redis Sorted Set, 3 tier độc lập:

| Tier | Key Pattern | Limit | Window | Scope |
|---|---|---|---|---|
| T1 — IP | `rl:ip:{ip}` | 60 req | 60s | Unauthenticated (login, public) |
| T2 — User | `rl:user:{user_id}` | 30 req | 60s | Tất cả authenticated endpoints |
| T3 — User×Workshop | `rl:reg:{user_id}:{workshop_id}` | 5 req | 60s | POST register + POST payment |

Kiểm tra T1→T2→T3, dừng khi tier đầu tiên vi phạm. Fail-open khi Redis down.

Thuật toán MULTI/EXEC chi tiết → `design/04_safety-mechanism.md`. HTTP contract và AC → `specs/rate-limiting.md`.

### 2. Lý do chọn

**Sliding Window** tránh *boundary burst* của Fixed Window: user gửi 5 req ở giây 59 + 5 req ở giây 61 = 10 req trong 2 giây nhưng Fixed Window không bắt được. Sliding Window tính "N req trong 60s bất kỳ tính đến hiện tại".

**T3 (per user per workshop) là tier quan trọng nhất:** Giảm hot-row contention tại `workshops.version` (ADR-03). Người dùng spam 20 lần trong 5 giây → chỉ 5 requests vào backend → eliminates impatient-client retry storm.

**Fail-open khi Redis down:** Redis down đồng nghĩa cache (ADR-13) cũng down — hệ thống đã trong degraded mode. Mất rate limiting là acceptable vì OL (ADR-03) vẫn bảo đảm correctness về chỗ ngồi. Fail-closed (block tất cả khi Redis down) = overprotection không chấp nhận được.

### 3. Trade-off và rủi ro

**T1 IP-based và NAT.** Nhiều student ở ký túc xá đứng sau cùng IP. Giảm thiểu: T1 chỉ cho unauthenticated endpoints; sau login, T2 per `user_id` là binding — không còn NAT issue.

**Redis là SPOF cho rate limiting.** Redis down → rate limiting tắt. Acceptable vì OL vẫn đảm bảo correctness, và Redis down là degraded mode toàn hệ thống.

### 4. Phương án đã cân nhắc nhưng không chọn

**Token Bucket:** Cho phép burst ngắn — không muốn burst vì mỗi request register tạo OL contention.

**Leaky Bucket:** Smooth output rate nhưng user expect response ngay, không chờ trong queue ảo.

**Fixed Window Counter:** Đơn giản nhất nhưng boundary burst problem.

---

## ADR-09 — Kiến trúc Notification

### 1. Quyết định

**Strategy Pattern in-process** — không dùng external Pub/Sub broker. Mỗi `NotificationChannel` là một adapter độc lập. Thêm kênh mới = thêm adapter + uncomment 1 dòng tại composition root — không sửa code cũ (OCP). Per-channel timeout 5 giây với `Promise.allSettled` — failure của một channel không cascade sang channel khác.

Implementation detail và TypeScript interface → `access-control.md`. Behavioral spec → `specs/notification.md`.

### 2. Lý do chọn

**Throughput thực tế không đòi Pub/Sub.** 12,000 notification/event ≈ vài chục msg/s trong vài phút. Redis Streams (ADR-10) xử lý batch async đủ. Kafka/RabbitMQ = cluster 3 nodes + operational overhead cho bài toán này.

**In-process đủ isolation nhờ `Promise.allSettled`.** `TelegramAdapter.send()` throw → không cancel `EmailAdapter.send()`. Failure của một channel bị log và bị bỏ qua.

**Best-effort không có nghĩa là silent failure.** `notification_logs` ghi đầy đủ: user nào, event gì, channel nào, lỗi cụ thể — để BTC có thể điều tra và retry thủ công.

**Boundary:** Worker crash giữa batch notification → một số user không nhận được. Nếu cần exactly-once → Outbox Pattern → `specs/notification-outbox.md`.

### 3. Trade-off và rủi ro

**Thêm channel = deploy lại.** Đăng ký tại composition root (main.ts) không phải runtime-configurable. Acceptable cho đồ án.

**Massive fan-out memory.** Notify 12,000 user × 2 channels = 24,000 concurrent promise — overload SMTP. Giải pháp: chia batch 100 user/dispatch tại notification-worker consumer (ADR-10), không dispatch tất cả cùng lúc.

### 4. Phương án đã cân nhắc nhưng không chọn

**Full Pub/Sub (Kafka/RabbitMQ):** Overkill. 12,000 notification/event không cần Kafka designed cho triệu msg/s.

**Inline notification trong registration transaction:** SMTP timeout → transaction rollback → đăng ký thất bại. Coupling notification vào critical path là anti-pattern.

**Observer Pattern không tách interface:** Khó test từng channel độc lập. Strategy với explicit `NotificationChannel` interface cho phép mock từng channel.

---

## ADR-10 — Message Queue cho Async Processing

### 1. Quyết định

**Redis Streams** làm job queue cho async tasks:

| Task | Stream | Retry | DLQ |
|---|---|---|---|
| AI PDF summary | `stream:ai-summary` | 3 lần (exponential backoff) | `stream:ai-summary-dlq` |
| Batch notification | `stream:notifications` | 2 lần | `stream:notifications-dlq` |

Consumer group pattern với `XREADGROUP` + `XACK` sau khi hoàn thành. `XAUTOCLAIM` để reclaim messages từ PEL khi worker crash trước XACK. DLQ chỉ lưu — admin can thiệp thủ công.

Redis commands và retry flow chi tiết → `specs/ai-summary.md` và `specs/notification.md`.

### 2. Lý do chọn

**Redis đã có sẵn** (ADR-13 cache, ADR-06 rate limiting) — không add infrastructure mới. Redis Streams persistent hơn Redis Pub/Sub (Pub/Sub là fire-and-forget, Streams có offset như Kafka mini).

**Boundary:** Redis crash mà không có AOF → pending jobs bị mất. Acceptable cho đồ án — production cần AOF `appendfsync everysec` hoặc Redis Sentinel.

### 3. Trade-off và rủi ro

**PEL tích lũy khi worker crash không XACK.** XAUTOCLAIM bắt buộc — implementation detail không phải optional.

**Một Redis instance cho cache + rate limit + streams.** Nếu AI summary tiêu thụ nhiều memory → evict cache entries. Giải pháp: dùng Redis 16 DB slots với `maxmemory-policy` khác nhau (DB 0 cache: `allkeys-lru`, DB 1 streams: `noeviction`, DB 2 rate limit: `volatile-ttl`).

### 4. Phương án đã cân nhắc nhưng không chọn

**RabbitMQ:** Feature-rich nhưng thêm Docker container mới chỉ cho job queue khi Redis đã có sẵn. YAGNI.

**BullMQ:** Abstraction tốt cho production nhưng hides Redis internals — cho đồ án học, hiểu Streams raw tốt hơn.

**In-memory queue (EventEmitter):** Zero persistence — không acceptable cho AI summary có thể mất vài phút xử lý.

---

## ADR-11 — Mobile Offline Check-in và Sync Strategy

### 1. Quyết định

**Local-first với SQLite + Outbox Pattern** — check-in ghi vào SQLite local ngay lập tức (không cần network), sync lên server khi kết nối phục hồi. **Server wins, First check-in wins** khi conflict.

Prototype deadline: Tuần 4. Nếu không xong → degrade thành online-only check-in (acceptable — check-in là operational tracking, không phải financial transaction).

SQLite schema và sync flow → `specs/checkin-offline.md`.

### 2. Lý do chọn

**Outbox (ghi local trước, sync sau)** là cách duy nhất đảm bảo ASR-6: staff không cần nghĩ đến mạng — cứ quét, app confirm ngay.

**Batch sync 50 records/request** thay vì per-record: khi mạng phục hồi sau offline vài phút, có thể có 20-30 pending check-ins. Batch một lần tiết kiệm round-trips.

**First check-in wins** được enforce bởi `UNIQUE (registration_id)` trên bảng `checkins` với `ON CONFLICT DO NOTHING` — không cần distributed lock. Server trả thông tin "ai check-in trước" để staff B có context rõ ràng.

**Boundary:** Nếu device không bao giờ kết nối lại, check-in offline bị mất. Acceptable.

### 3. Trade-off và rủi ro

**Device clock lệch.** `checked_at` theo device clock — sai timestamp nhưng không ảnh hưởng logic "đã check-in hay chưa" (dựa trên `registration_id`, không timestamp). Server lưu `received_at = now()` cho audit.

**go/no-go prototype cứng tuần 4.** Nếu không đạt: degrade online-only, BTC chuẩn bị danh sách backup in giấy.

### 4. Phương án đã cân nhắc nhưng không chọn

**Online-only check-in:** Không đáp ứng ASR-6. Là "degrade path" nếu prototype thất bại.

**CouchDB/PouchDB replication:** Industry-standard offline sync nhưng đòi CouchDB server mới và full replication không phù hợp (staff chỉ cần upload delta, không cần bidirectional sync).

---

## ADR-12 — CSV Import Pipeline

### 1. Quyết định

**Batch Sequential Pipeline** — cron 02:00 AM Asia/Ho_Chi_Minh hàng ngày, streaming parse (không load toàn bộ vào RAM), batch upsert 500 rows, error quarantine (invalid rows không dừng pipeline), idempotent (`ON CONFLICT DO UPDATE`).

5-stage pipeline chi tiết và SQL → `specs/csv-import.md`.

### 2. Lý do chọn

**Idempotent upsert** là tính chất quan trọng nhất: pipeline có thể restart, chạy lại nhiều lần mà không tạo duplicate. `ON CONFLICT (student_id) DO UPDATE` là native PostgreSQL — không cần logic phức tạp.

**Error quarantine:** Invalid rows không làm pipeline dừng, không làm valid rows mất. BTC có file lỗi cụ thể để điều tra.

**Cron 2am Asia/Ho_Chi_Minh** (không UTC, không trigger on file upload): Spec không có webhook từ legacy system — polling thư mục là cách duy nhất. Pin timezone tránh confusion khi deploy trong container mặc định UTC. 2am VN đảm bảo file CSV đã được export xong từ legacy.

**Streaming parse** bắt buộc: defensive design cho file tương lai có thể lên 100MB+.

**Boundary:** Sinh viên vừa được thêm vào CSV nhưng pipeline chưa chạy → chưa có account, window tối đa ~24h. Acceptable vì workshop đăng ký trước nhiều ngày.

### 3. Trade-off và rủi ro

**Concurrent run protection** bằng `import_logs` status check — đơn giản hơn distributed lock và đủ cho single-process monolith.

**File path injection** giảm thiểu bằng restrict quyền write vào thư mục input/ — file được coi là input từ nguồn tin cậy.

### 4. Phương án đã cân nhắc nhưng không chọn

**Trigger khi file xuất hiện (inotify/fs.watch):** File từ legacy có thể được ghi dần, không atomic — trigger quá sớm đọc file chưa complete.

**TRUNCATE rồi INSERT lại:** Trong thời gian TRUNCATE → INSERT, bảng `students` empty → FK constraint fail cho registrations đang processing. Upsert giữ bảng consistent trong suốt.

**Real-time sync (CDC từ legacy DB):** Yêu cầu access vào legacy DB hoặc message broker — ngoài scope.

---

## ADR-14 — AI Summary Pipeline

### 1. Quyết định

**Async AI Summary** qua Redis Streams (ADR-10). Provider: OpenAI GPT-4o-mini, abstracted qua interface để dễ swap:

```typescript
interface AIProvider {
  summarize(text: string, maxTokens: number): Promise<string>;
}
```

Storage: `workshops.summary_text` và `workshops.summary_status` (5 trạng thái: `none`/`queued`/`processing`/`done`/`failed`) trên bảng `workshops` — không tách bảng riêng (1-1 với workshop).

3-stage async flow và failure handling → `specs/ai-summary.md`.

### 2. Lý do chọn

**Async qua queue (không inline):** AI summary mất 30s–2 phút — block HTTP response là UX tệ và risk timeout reverse proxy. 202 Accepted + polling là pattern chuẩn cho long-running task.

**Provider abstraction:** API key có thể bị giới hạn — cần dễ swap sang Claude hoặc Ollama. Interface đơn giản, không phụ thuộc vào feature riêng của provider.

**Truncate text 50,000 chars thay vì reject:** PDF dài không phải lỗi user. Tóm tắt phần đầu vẫn hữu ích. 50K chars ≈ 12K tokens — vừa context window model rẻ.

**`summary_status` enum 5 giá trị:** Cho phép frontend hiển thị progress chính xác. Nếu chỉ `done`/`not done`, user không phân biệt "đang xử lý" với "chưa upload PDF".

**AI summary không trong critical path:** Workshop vẫn hoạt động đầy đủ khi không có summary. Provider down → chỉ feature này bị ảnh hưởng.

### 3. Trade-off và rủi ro

**AI provider down → feature fail.** Mitigation: retry 3 lần exponential backoff → DLQ → BTC retry thủ công.

**Privacy:** Nội dung PDF gửi sang external API. Document trong UI: "Không upload PDF chứa thông tin cá nhân".

**PDF scan (image, không có text layer):** `pdf-parse` trả empty → detect `text.length < 100` → mark `failed` với reason `pdf_no_text`.

### 4. Phương án đã cân nhắc nhưng không chọn

**Local LLM (Ollama):** Privacy-friendly nhưng đòi GPU — không có sẵn trên Docker Compose dev. Chất lượng thấp hơn với model nhỏ.

**Inline trong upload handler:** HTTP timeout sau 30s, AI có thể mất 2 phút.

**Anthropic Claude thay vì OpenAI:** Chất lượng tương đương. OpenAI có SDK ecosystem rộng hơn cho Node.js/Python — nhưng `AIProvider` interface cho phép swap.
