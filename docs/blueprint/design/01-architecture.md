# UniHub Workshop - Architecture Design

## Kiến trúc tổng thể

Hệ thống tuân theo phong cách **Client-Server** ở cấp độ vĩ mô, nhằm phân tách rạch ròi giữa giao diện người dùng (Web App, Mobile App) và logic xử lý trung tâm (Backend API), đồng thời sử dụng đa phong cách kiến trúc cho các bài toán đặc thù bên trong.

1. **Client Layer**
   - **Web Portal (Cổng thông tin Web)**: Ứng dụng trang đơn (SPA) cung cấp giao diện tương tác cho Sinh viên (xem lịch, đăng ký) và Ban tổ chức (quản trị hệ thống).
   - **Mobile App (Ứng dụng di động)**: Dành riêng cho công tác kiểm duyệt tại hiện trường (Check-in). Ứng dụng được thiết kế theo cơ chế **Offline-First**, tích hợp cơ sở dữ liệu cục bộ trên thiết bị để lưu trữ dữ liệu và hoạt động độc lập khi mất kết nối mạng.

2. **Gateway & Edge Layer**
   - **Mạng phân phối nội dung (CDN):** Bộ đệm phân tán toàn cầu chịu trách nhiệm phân phối các tài nguyên tĩnh (hình ảnh, mã nguồn giao diện) nhằm giảm tải triệt để cho máy chủ trung tâm.
   - **API Gateway / Load Balancer:** Cổng vào duy nhất tiếp nhận và điều phối mọi truy cập từ Client. Chịu trách nhiệm mã hóa bảo mật, cân bằng tải trọng và đặc biệt là thực thi **Rate Limiting (Giới hạn lưu lượng)** để bảo vệ hệ thống khỏi tải đột biến.

3. **Application Layer**
   Được xây dựng theo **Layered Architecture (Kiến trúc phân lớp)** nhằm đạt được sự kết ghép lỏng và che giấu thông tin. Tầng này chia thành 3 lớp chính:
   1. **Lớp Trình bày (Presentation Layer):**
      - Chịu trách nhiệm tiếp nhận các yêu cầu HTTP, kiểm tra tính hợp lệ của dữ liệu đầu vào (Validation), xử lý xác thực/phân quyền người dùng và chuyển đổi dữ liệu sang định dạng chuẩn trước khi đẩy xuống lớp nghiệp vụ.

   2. **Lớp Nghiệp vụ (Business Logic Layer - Core):**
      - Chứa toàn bộ "bộ não" của hệ thống, được tổ chức thành các phân hệ (modules) độc lập. Mỗi phân hệ áp dụng một kiến trúc riêng biệt phù hợp với bài toán:
        - _Phân hệ Cốt lõi & Đặt chỗ:_ Xử lý logic nghiệp vụ truyền thống (CRUD, kiểm tra điều kiện, tính toán số lượng).
        - _Phân hệ Thông báo & Thanh toán:_ Áp dụng **Event-Driven (Hướng sự kiện)** để tách rời các tác vụ chậm ra khỏi luồng xử lý chính.
        - _Phân hệ Tóm tắt AI:_ Áp dụng **Pipe-and-Filter (Ống và Bộ lọc)** để xử lý luồng biến đổi tài liệu tĩnh qua nhiều bước độc lập.
        - _Phân hệ Đồng bộ dữ liệu:_ Áp dụng **Batch-Sequential (Xử lý lô tuần tự)** để xử lý khối lượng dữ liệu lớn từ hệ thống ngoài theo lịch trình định kỳ.

   3. **Lớp Truy cập dữ liệu (Data Access Layer):**
      - Đóng vai trò cầu nối duy nhất với hệ thống lưu trữ. Lớp này che giấu các chi tiết về ngôn ngữ truy vấn (SQL/NoSQL) thông qua các giao diện trừu tượng (Repository Pattern), cung cấp các cơ chế khóa an toàn (Locking) cho Lớp Nghiệp vụ.

4. **Storage & State Layer**
   - **Cơ sở dữ liệu chính (Primary RDBMS):** Hệ quản trị cơ sở dữ liệu quan hệ, cung cấp tính toàn vẹn giao dịch (ACID) khắt khe cho các dữ liệu quan trọng như tài khoản, sự kiện, đơn đăng ký và lịch sử giao dịch.
   - **Bộ nhớ đệm (Cache):** Cấu trúc lưu trữ dữ liệu trên bộ nhớ (In-memory) tốc độ cực cao, dùng để lưu trữ trạng thái "số chỗ còn trống" và thông tin sự kiện, giúp giảm thiểu áp lực đọc lên cơ sở dữ liệu chính.

5. **Asynchronous Messaging Layer**
   - **Hàng đợi thông điệp (Message Queue):** Trạm trung chuyển đóng vai trò cốt lõi trong kiến trúc Event-Driven, giúp các phân hệ nghiệp vụ giao tiếp với nhau thông qua cơ chế Xuất bản - Đăng ký (Pub/Sub) mà không cần nhận thức trực tiếp về nhau.

---

## C4 Diagram

### Level 1 — System Context

<!-- Sơ đồ: UniHub Workshop + actors + hệ thống ngoài -->

### Level 2 — Container

<!-- Sơ đồ: web app, mobile app, backend API, database, message broker, ... -->

---

## High-Level Architecture Diagram

<!-- Sơ đồ luồng dữ liệu, đặc biệt tại các điểm tích hợp và luồng check-in offline -->

---

## Mẫu Result Pattern (Railway Oriented Programming)

Các Service **KHÔNG BAO GIỜ** ném exception. Chúng luôn trả về `Result.ok(data)` hoặc `Result.fail(appError)`:

```typescript
// Thành công
return Result.ok(WorkshopResponseDto.from(entity));
// Thất bại
return Result.fail(seatErrors.unavailable(workshopId));
```

Mẫu này mang lại các lợi ích sau:

(a) **Xử lý lỗi có thể dự đoán trước** — mọi caller BUỘC PHẢI xử lý cả hai nhánh (thành công và thất bại), không có lỗi nào bị "rơi tự do" xuyên qua các tầng.

(b) **ResponseInterceptor tự động ánh xạ** — `OkResult` → 200/201 (thành công), `FailResult` → mã lỗi HTTP tương ứng (400, 401, 403, 404, 409, 500...), giúp Controller hoàn toàn không cần quan tâm đến mã HTTP.

(c) **Chuỗi lỗi an toàn về kiểu (type-safe)** — kiểu `AppError` mang đầy đủ thông tin mã lỗi, thông điệp, và ngữ cảnh, cho phép caller kiểm tra chính xác loại lỗi thông qua các factory function.

---

## Mẫu tryCatch Wrapper

Các Repository bọc toàn bộ lời gọi Drizzle bằng hàm `tryCatch`:

```typescript
async findById(id: string): Promise<Result<WorkshopType>> {
  return tryCatch(
    async () => { /* drizzle query */ },
    (err) => systemErrors.internal('Không thể tìm workshop', err)
  );
}
```

Hàm `tryCatch` tự động bắt mọi ngoại lệ phát sinh từ tầng cơ sở dữ liệu và chuyển đổi chúng thành các `Result.fail()` với mã lỗi phù hợp. Điều này đảm bảo rằng không có ngoại lệ nào từ Drizzle/PostgreSQL thoát ra khỏi tầng Repository, duy trì nguyên tắc "không ném exception" xuyên suốt hệ thống.

---

## Mẫu Error Factory

Tất cả lỗi được tạo thông qua các hàm factory trong `src/shared/response/errors.ts`, được tổ chức theo từng miền (domain):

| Factory | Mã lỗi |
|---------|--------|
| `authErrors` | TOKEN_INVALID, TOKEN_EXPIRED, TOKEN_REVOKED, INVALID_CREDENTIALS, CHECKIN_SCOPE_DENIED |
| `seatErrors` | SEAT_UNAVAILABLE, SEAT_LOCK_EXPIRED |
| `registrationErrors` | REGISTRATION_DUPLICATE, REGISTRATION_NOT_FOUND, REGISTRATION_CANCELLED |
| `paymentErrors` | PAYMENT_DUPLICATE, PAYMENT_ALREADY_SUCCESS, PAYMENT_GATEWAY_OPEN, PAYMENT_TIMEOUT |
| `workshopErrors` | WORKSHOP_NOT_FOUND, WORKSHOP_NOT_PUBLISHED, WORKSHOP_FULL, WORKSHOP_TIME_CONFLICT |
| `ticketErrors` | TICKET_NOT_FOUND, TICKET_VOID, TICKET_ALREADY_CHECKEDIN |
| `systemErrors` | INTERNAL_ERROR, DB_LOCK_TIMEOUT |

Các factory function này đảm bảo tính nhất quán trong toàn bộ codebase — mọi lỗi đều có mã định danh rõ ràng, thông điệp chuẩn hóa, và có thể được ResponseInterceptor ánh xạ sang mã HTTP tương ứng mà không cần logic điều kiện phức tạp.

---

## Vòng đời Request (Request Lifecycle)

Luồng xử lý yêu cầu qua 5 tầng của NestJS:

```
Inbound Guards (JWT, RBAC, Scope)
  → ZodValidationPipe (body/params)
    → Controller (mỏng: lấy user từ @CurrentUser(), gọi service, trả về Result)
      → Service (luật nghiệp vụ — trả về Result.ok() hoặc Result.fail())
        → ResponseInterceptor (OkResult → 200/201 ApiResponse; FailResult → HttpException)
          → GlobalExceptionFilter (bắt mọi thứ còn sót → JSON đã được làm sạch)
```

Chi tiết từng bước:

1. **Guards (JWT, RBAC, Scope):** Xác thực token, kiểm tra vai trò (STUDENT/ADMIN/CHECKIN_STAFF) và phạm vi truy cập. Nếu không hợp lệ, request bị từ chối ngay tại tầng này.

2. **ZodValidationPipe:** Kiểm tra tính hợp lệ của body/params/query dựa trên Zod schema. Trả về lỗi 400 nếu dữ liệu không khớp schema.

3. **Controller:** Lớp mỏng (thin) — chỉ trích xuất thông tin người dùng từ `@CurrentUser()`, gọi Service, và trả về `Result` nguyên trạng. Controller không chứa bất kỳ logic nghiệp vụ nào.

4. **Service:** Chứa toàn bộ luật nghiệp vụ. Luôn trả về `Result.ok()` khi thành công hoặc `Result.fail()` khi có lỗi. Service KHÔNG BAO GIỜ ném exception.

5. **ResponseInterceptor:** Chặn kết quả trả về từ Controller:
   - `OkResult` → `ApiResponse` với status 200 (hoặc 201 cho POST)
   - `FailResult` → `HttpException` với mã HTTP tương ứng dựa trên mã lỗi trong `AppError`

6. **GlobalExceptionFilter:** Lưới an toàn cuối cùng — bắt mọi exception không được xử lý (trường hợp hy hữu) và trả về JSON đã được làm sạch, tránh rò rỉ thông tin nội bộ.

---

## Ranh giới Module (Module Boundaries)

- **Giao tiếp xuyên module:** CHỈ Service → Service (KHÔNG cho phép Service gọi Repository của module khác). Điều này duy trì tính đóng gói và ranh giới trách nhiệm giữa các module.

- **Quy tắc import:** Không bao giờ import Repository từ module khác. Mọi truy cập dữ liệu xuyên module phải thông qua Service của module sở hữu dữ liệu đó.

- **CatalogModule** xuất `WorkshopNotificationPublisher` để phục vụ thông báo xuyên module (ví dụ: khi có workshop mới được xuất bản, các module khác có thể đăng ký nhận thông báo).

- **BackgroundModule** PHẢI được khai báo CUỐI CÙNG trong mảng `imports` của `AppModule`. Lý do: BackgroundModule khởi tạo các cron job và BullMQ consumer khi ứng dụng khởi động; nếu được import trước, các module phụ thuộc có thể chưa sẵn sàng.

- **BookingModule** xuất `SeatLockMechanic` để các cron job trong BackgroundModule có thể sử dụng (ví dụ: giải phóng ghế hết hạn).

- **SharedQueueModule** KHÔNG phải là `@Global()`. Module nào cần dùng `@InjectQueue()` phải import SharedQueueModule một cách tường minh. Điều này tránh phụ thuộc vòng và đảm bảo tính minh bạch của đồ thị phụ thuộc.

---

## Ghi chú về TLS Termination

TLS termination xảy ra tại tầng API Gateway / Load Balancer. Ứng dụng backend (NestJS) nhận HTTP thuần từ reverse proxy và KHÔNG xử lý TLS trực tiếp. Reverse proxy PHẢI được cấu hình để chuyển tiếp các header `X-Forwarded-Proto` và `X-Forwarded-For`. Điều này có nghĩa là việc tuân thủ HTTPS (TLS 1.2+) được thực hiện ở tầng hạ tầng, không phải trong mã ứng dụng.
