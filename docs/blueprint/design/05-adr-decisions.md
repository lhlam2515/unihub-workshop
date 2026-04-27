# UniHub Workshop - Architectural Decision Records (ADR)

## Các quyết định kỹ thuật quan trọng (Architectural Decision Records - ADR)

### ADR 01: Lựa chọn phong cách kiến trúc tổng thể

- **Quyết định:** Áp dụng mô hình **Modular Monolith** (Hệ thống nguyên khối phân chia theo module logic) thay vì Microservices (Đa dịch vụ phân tán).
- **Ngữ cảnh & Lý do:** Nguồn lực đội ngũ cực kỳ eo hẹp và thời gian thực thi ngắn. Việc thiết lập, cấu hình và vận hành Microservices (DevOps, Distributed Tracing) gây lãng phí thời gian và rủi ro trễ tiến độ. Modular Monolith mang lại tốc độ phát triển và kiểm thử vượt trội, chia sẻ chung một vùng nhớ giúp dễ dàng gỡ lỗi, đồng thời vẫn giữ được khả năng tách rời (decoupling) thông qua ranh giới các thư mục/module.
- **Sự đánh đổi:** Mất đi tính độc lập trong triển khai (Independent Deployability) — cập nhật một tính năng nhỏ cũng yêu cầu khởi động lại toàn bộ máy chủ. Đổi lại, loại bỏ hoàn toàn sự phức tạp của mạng liên dịch vụ.

### ADR 02: Áp dụng Kiến trúc phân lớp (Layered Architecture)

- **Quyết định:** Tổ chức Tầng Ứng dụng thành 3 lớp riêng biệt: Lớp Trình bày (Presentation), Lớp Nghiệp vụ (Business Logic), và Lớp Truy cập Dữ liệu (Data Access).
- **Ngữ cảnh & Lý do:** Tránh rủi ro mã nguồn "dính chùm" (Spaghetti Code). Kiến trúc này tạo ra các "bức tường phạm vi", bảo vệ Lớp Nghiệp vụ cốt lõi khỏi những thay đổi của giao diện hay cơ sở dữ liệu. Nó cũng cho phép 2 thành viên chia tách công việc dễ dàng và hỗ trợ viết Unit Test độc lập thông qua việc tạo dữ liệu giả (Mocking).
- **Sự đánh đổi:** Tăng lượng code lặp lại (Boilerplate/DTOs) khi dữ liệu phải đi qua nhiều lớp, đổi lại tính bảo trì và khả năng đọc hiểu của mã nguồn tăng lên đáng kể.

### ADR 03: Áp dụng chiến lược Lưu trữ Lai (Explicit Hybrid Storage)

- **Quyết định:** Sử dụng kết hợp PostgreSQL (dữ liệu giao dịch cốt lõi), Redis (dữ liệu trạng thái biến đổi nhanh và bộ nhớ đệm) và Object Storage (S3/MinIO) cho file nhị phân — không lưu file nhị phân trong Database.
- **Ngữ cảnh & Lý do:** Hệ thống có hai loại dữ liệu đối lập: dữ liệu giao dịch yêu cầu tính toàn vẹn ACID (phù hợp với PostgreSQL), trong khi dữ liệu trạng thái (ví dụ: số ghế còn lại, khóa giữ chỗ) có tần suất đọc/ghi rất cao và mang tính tạm thời, phù hợp với Redis trên RAM.
- **Sự đánh đổi:** Tăng chi phí vận hành và độ phức tạp (cần vận hành thêm Redis và Object Storage). Đổi lại, hệ thống đạt được hiệu năng và khả năng chịu tải (scalability) tốt hơn, giảm áp lực lên RDBMS.

### ADR 04: Tách biệt vòng đời Đơn hàng (Registration) và Vé (Ticket)

- **Quyết định:** Tách riêng vòng đời `Registration` (đơn đặt chỗ) và `Ticket` (vé vào cửa). `Ticket` chỉ được sinh ra khi `Registration` chuyển sang trạng thái `CONFIRMED`.
- **Ngữ cảnh & Lý do:** Việc ghép chung có thể dẫn đến bất đồng bộ giữa trạng thái đơn và vé (ví dụ: mã QR đã in nhưng đơn bị hủy), đặc biệt khi Mobile App hoạt động offline. Tách riêng giúp Mobile App chỉ đồng bộ danh sách vé ở trạng thái `ACTIVE`, giảm payload và tránh lỗ hổng bảo mật/uy tín.
- **Sự đánh đổi:** Tăng số lượng bảng và cần nhiều JOIN khi truy vấn. Bù lại, mô hình domain rõ ràng hơn và tối ưu băng thông cho chế độ offline.

### ADR 05: Quản lý "Giam ghế" (SeatLock) hoàn toàn trên Redis

- **Quyết định:** Không lưu trạng thái giữ chỗ (pending payment) vào PostgreSQL; dùng khóa Redis (`seat:lock:{workshop_id}:{registration_id}`) với TTL = 15 phút.
- **Ngữ cảnh & Lý do:** Khi hàng ngàn người giữ chỗ mà không thanh toán, lưu tạm bản ghi trong DB sẽ tạo ra nhiều dữ liệu rác và cần cơ chế dọn dẹp. Redis TTL cho phép khóa tự động hết hạn, trả ghế về hệ thống mà không cần cron job.
- **Sự đánh đổi:** Nếu Redis mất dữ liệu (crash), các khóa có thể biến mất sớm dẫn đến rủi ro cạnh tranh ghế. Giảm thiểu bằng cấu hình persistence (RDB/AOF) và cơ chế sao lưu/giám sát Redis.

### ADR 05: Kiểm soát tải đột biến bằng Token Bucket (Redis) tại API Gateway

- **Quyết định:** Áp dụng thuật toán **Token Bucket** (Xô Token) định danh theo Student ID lưu trữ trên Redis (`ratelimit:register:{user_id}`), kết hợp cơ chế Debounce (Chặn click liên tục) tại Frontend. Nhóm quyết định **không** sử dụng Message Queue để hứng request đăng ký.
- **Ngữ cảnh & Lý do:** Hệ thống phải chịu tải 12.000 sinh viên truy cập dồn dập trong 3-10 phút đầu. Token Bucket vượt trội hơn _Fixed Window_ hay _Leaky Bucket_ vì nó vừa ngăn chặn tool spam, vừa cho phép một lượng tải bùng nổ ngắn hạn (Burst) để bù đắp cho thao tác nhanh của người dùng thực. Việc không dùng Message Queue cho luồng đăng ký giúp giữ nguyên mô hình xử lý Đồng bộ (Synchronous), đảm bảo sinh viên biết kết quả ngay lập tức (KISS principle).
- **Sự đánh đổi:** Đánh đổi sự công bằng tuyệt đối (First-In-First-Out của Queue) lấy tốc độ phản hồi tức thì và giảm độ phức tạp của hệ thống. "Sự công bằng" ở đây được định nghĩa là chặn lạm dụng (anti-spam) và xử lý theo thứ tự đến trước tại cổng Redis.

### ADR 06: Chống tranh chấp chỗ (Race Condition) bằng Redis Counters & DB Fail-Fast

- **Quyết định:** Sử dụng lệnh nguyên tử `DECR` trên Redis (`seat:available:{workshop_id}`) làm chốt chặn tốc độ cao (Source of Truth cho số lượng ghế). Tại Database, áp dụng **Khóa bi quan (Pessimistic Locking)** với câu lệnh `SELECT ... FOR UPDATE` kết hợp nguyên lý **Fail-Fast** (`Lock Wait Timeout` = 3 giây).
- **Ngữ cảnh & Lý do:** Yêu cầu tuyệt đối không để xảy ra tình trạng bán vượt số chỗ (Overselling). Nếu để hàng ngàn request lao thẳng vào Database, Connection Pool sẽ cạn kiệt và gây treo máy chủ. Việc trừ ghế trên Redis trước giúp loại bỏ 99% request dư thừa. Tại DB, Khóa bi quan ép các request hợp lệ phải xếp hàng tuần tự. Nếu hàng đợi quá dài (chờ quá 3s), nguyên lý Fail-Fast sẽ chủ động hủy giao dịch và báo lỗi _"Hệ thống quá tải"_ để bảo vệ sự sống còn của CSDL.
- **Sự đánh đổi:** Chấp nhận từ chối phục vụ (chủ động báo lỗi) một số request hợp lệ trong lúc cao điểm để tránh hiện tượng sụp đổ dây chuyền (Cascading Failure).

### ADR 07: Quản lý giam ghế (Seat Lock) hoàn toàn bằng Redis TTL

- **Quyết định:** Không lưu trạng thái "giam ghế chờ thanh toán" vào bảng vật lý trong PostgreSQL. Sử dụng cấu trúc Redis Key (`seat:lock:{workshop_id}:{registration_id}`) với cơ chế **TTL (Time-To-Live) là 15 phút**.
- **Ngữ cảnh & Lý do:** Khi hàng ngàn sinh viên giữ chỗ nhưng không thanh toán, PostgreSQL sẽ sinh ra một lượng khổng lồ các bản ghi rác, đòi hỏi phải viết Cronjob quét liên tục để xóa và nhả ghế (gây nặng DB). Redis TTL giải quyết bài toán này một cách thụ động: Key tự động bốc hơi khỏi RAM khi hết 15 phút, giải phóng slot mà không tốn bất kỳ tài nguyên tính toán nào của Backend.
- **Sự đánh đổi:** Nếu máy chủ Redis sụp đổ (Crash) và mất dữ liệu trên RAM, hệ thống có thể bị nhả ghế sớm hơn dự kiến. (Đã giảm thiểu bằng cách cấu hình Redis Persistence RDB/AOF).

### ADR 08: Chống trừ tiền hai lần bằng Khóa lũy đẳng (Idempotency Key) 2 lớp

- **Quyết định:** Sinh `idempotency_key` (Mã giao dịch nội bộ) cho mỗi ý định thanh toán. Thiết lập cơ chế bảo vệ 2 lớp: Lớp 1 dùng lệnh `SET NX` trên Redis (TTL 24h), Lớp 2 dùng ràng buộc `UNIQUE` tại cột `idempotency_key` của bảng `payments` trong PostgreSQL.
- **Ngữ cảnh & Lý do:** Sinh viên có thói quen nhấn "Thanh toán" liên tục khi mạng chậm. Khóa giao diện ở Frontend là không đủ. Lớp 1 (Redis) giúp phản hồi chặn các request trùng lặp cực nhanh (tránh truy vấn DB vô ích). Lớp 2 (PostgreSQL) là chốt chặn cuối cùng bảo vệ dữ liệu tài chính trong trường hợp Redis bị Cache Miss (mất đồng bộ).
- **Sự đánh đổi:** Tăng số lượng mã lệnh tại Backend để phối hợp giữa Redis và PostgreSQL, nhưng tạo ra "Nguồn sự thật duy nhất" (Source of Truth) an toàn 100% chống lại mọi trường hợp retry (thử lại) từ phía thiết bị của người dùng.

### ADR 09: Chiến lược Phân quyền — RBAC với JWT Dual-Token & Môi trường lưu trữ Đặc thù

- **Quyết định:** Áp dụng mô hình RBAC với 3 vai trò (`STUDENT`, `ORGANIZER`, `CHECKIN_STAFF`). Sử dụng cơ chế **Access Token + Refresh Token**.
- **Ngữ cảnh & Lý do:**
  - **Chiến lược Token:** Để cân bằng giữa bảo mật và trải nghiệm, hệ thống áp dụng thời hạn và nơi lưu trữ khác nhau tùy môi trường:
    - **Web Portal:** Access Token (15 phút - lưu In-memory) và Refresh Token (7 ngày - lưu HttpOnly Cookie).
    - **Mobile App (Staff):** Cả Access Token và Refresh Token đều được lưu trong **Keychain/Secure Storage** (môi trường mã hóa phần cứng). Riêng Access Token cho nhân sự điểm danh có thời hạn **8 giờ** để phủ toàn bộ ca làm việc tại hiện trường.
  - **Tính nhất quán quyền hạn:** Chấp nhận tính **Nhất quán sau (Eventual Consistency)** đối với danh sách workshop được phân công (`allowed_workshop_ids`). Nếu có sự thay đổi phân công giữa chừng, nhân sự cần đăng nhập lại hoặc chờ token hết hạn để cập nhật quyền mới (Phương án KISS).
- **Sự đánh đổi:** Việc lưu Access Token 8 giờ vào Keychain là một sự đánh đổi có chủ ý. Nhóm đánh giá mức độ bảo mật của Keychain tương đương với HttpOnly Cookie trên Web, cho phép chấp nhận rủi ro này để đảm bảo nhân sự không bị gián đoạn công việc do hết hạn token khi đang ở khu vực mạng yếu.

### ADR 10: Cô lập lỗi Thanh toán bằng Circuit Breaker (Ngắt mạch)

- **Quyết định:** Bọc các module gọi API thanh toán bên ngoài bằng **Circuit Breaker**, kết hợp với chiến lược **Graceful Degradation** (Giảm cấp dịch vụ).
- **Ngữ cảnh & Lý do:** Cổng thanh toán ngân hàng có thể bị timeout. Nếu Backend cố gắng chờ, các Thread xử lý sẽ bị treo, kéo sập toàn bộ hệ thống. Khi Circuit Breaker "ngắt mạch" (Trạng thái OPEN), hệ thống lập tức chặn luồng thanh toán, ngừng gọi đối tác.
- **Sự đánh đổi:** Chấp nhận mất doanh thu hoặc làm gián đoạn đăng ký workshop _có phí_ để thu hẹp vùng ảnh hưởng (Blast Radius), đảm bảo 12.000 sinh viên vẫn có thể xem lịch, đọc AI Summary và đăng ký các workshop _miễn phí_ một cách bình thường.

### ADR 11: Tách rời tác vụ chậm bằng Hàng đợi thông điệp (Message Queue)

- **Quyết định:** Xây dựng kiến trúc Hướng sự kiện (Event-Driven) sử dụng Hàng đợi trung gian cho tính năng Gửi thông báo (Email, Telegram).
- **Ngữ cảnh & Lý do:** Việc gửi Email phụ thuộc vào SMTP Server bên ngoài, độ trễ có thể lên tới vài giây. Nếu đặt trong luồng đăng ký chính, người dùng sẽ phải chờ lâu. Message Queue giúp Backend chỉ cần "ném" sự kiện vào hàng đợi rồi trả kết quả thành công ngay lập tức, các Worker chạy nền sẽ gửi email sau.
- **Sự đánh đổi:** Đánh đổi Tính nhất quán tức thời lấy **Nhất quán cuối (Eventual Consistency)** — giao diện báo thành công ngay nhưng email có thể đến trễ vài giây/vài phút. Quy trình gỡ lỗi (Debugging) cũng phức tạp hơn do luồng thực thi bị đứt đoạn.

### ADR 12: Điểm danh ngoại tuyến bằng cơ chế Offline-First

- **Quyết định:** Mobile App lưu trữ dữ liệu vào SQLite cục bộ và xử lý Đồng bộ nền (Background Sync) khi có mạng.
- **Ngữ cảnh & Lý do:** Môi trường hội trường thường xuyên quá tải Wifi/4G. Cơ chế Offline-First đảm bảo nhân sự có thể quét QR không độ trễ, không làm ách tắc hàng ngàn sinh viên tại cửa chỉ vì rớt mạng.
- **Sự đánh đổi:** Tăng độ phức tạp thuật toán ở Backend để xử lý giải quyết xung đột (Conflict Resolution) khi nhiều máy trạm gửi dữ liệu điểm danh trễ lên hệ thống cùng lúc.
