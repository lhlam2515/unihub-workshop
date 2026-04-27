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
