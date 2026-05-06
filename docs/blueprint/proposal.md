# UniHub Workshop — Project Proposal

---

## 1. Vấn đề

"Tuần lễ kỹ năng và nghề nghiệp" tổ chức hàng năm tại Trường Đại học A, quy mô 5 ngày × 8–12 workshop/ngày, thu hút hàng chục nghìn lượt đăng ký. Ban tổ chức hiện quản lý bằng Google Form và thông báo qua email thủ công — quy trình này tạo ra bốn điểm đau cụ thể:

1. **Đăng ký trùng chỗ.** Google Form không kiểm soát số chỗ theo thời gian thực. Workshop 60 chỗ nhưng người thứ 61 vẫn đăng ký được — ban tổ chức phải xử lý thủ công sau sự kiện.
2. **Check-in tốn nhân lực.** Không có QR code, nhân sự kiểm tra danh sách tay, trung bình 2–3 phút/người, tạo hàng đợi tại cửa.
3. **Thông báo chậm và rời rạc.** Email thủ công, không nhất quán, không có xác nhận tức thời sau khi đăng ký.
4. **Không có điểm truy cập chung.** Sinh viên tìm thông tin qua nhiều kênh khác nhau — không có trang tổng hợp lịch workshop.

Vấn đề trở nên cấp thiết khi quy mô dự kiến đạt **12,000 sinh viên truy cập trong 10 phút đầu khi mở đăng ký**, với 60% dồn vào 3 phút đầu tiên. Google Form không được thiết kế để xử lý tải đột biến này, và không có cơ chế nào ngăn hàng trăm người tranh cùng một chỗ cuối.

---

## 2. Mục tiêu

Xây dựng hệ thống **UniHub Workshop** số hóa toàn bộ quy trình từ đăng ký đến check-in, đạt các tiêu chí đo lường được sau:

| Tiêu chí | Ngưỡng chấp nhận |
|---|---|
| Throughput | 12,000 sinh viên trong 10 phút đầu; 7,200 trong 3 phút đầu; ≥ 95% request đăng ký hợp lệ (không vượt rate limit cá nhân) trả về kết quả thành công hoặc "hết chỗ" trong SLO latency — không trả 5xx |
| Latency — trang danh sách | p95 < 1 giây (tải bình thường) |
| Latency — đăng ký | p95 < 2 giây (tải bình thường); p99 < 5 giây (3 phút đầu giờ mở đăng ký) |
| Tính nhất quán ghế ngồi | 0 trường hợp 2 sinh viên cùng nhận chỗ cuối trong mọi điều kiện |
| Idempotency thanh toán | 0 trường hợp trừ tiền 2 lần dù client retry nhiều lần |
| Thời gian check-in | ≤ 10 giây trung bình/sinh viên (từ quét QR đến xác nhận) |
| Cách ly lỗi payment | Xem lịch và thông tin workshop vẫn hoạt động bình thường khi payment gateway sự cố |

---

## 3. Người dùng và nhu cầu

### Sinh viên (~12,000 người)

Xem danh sách workshop, đăng ký (free hoặc có phí), thanh toán, nhận mã QR xác nhận, check-in khi tham dự.

**Điều quan trọng nhất với họ:** Biết ngay kết quả đăng ký và không lo mất chỗ do hệ thống chậm hay lỗi. Mã QR phải sẵn sàng trước ngày diễn ra.

### Ban tổ chức (nội bộ)

Tạo và quản lý workshop, cập nhật thông tin, theo dõi số lượng đăng ký theo thời gian thực, upload tài liệu PDF để tạo AI summary.

**Điều quan trọng nhất với họ:** Không phải xử lý thủ công sau sự kiện — hệ thống tự quản lý đăng ký, thông báo, và đồng bộ dữ liệu sinh viên hằng đêm.

### Nhân sự check-in

Quét mã QR của sinh viên tại cửa phòng bằng mobile app.

**Điều quan trọng nhất với họ:** Check-in phải hoạt động kể cả khi kết nối mạng không ổn định — không bị gián đoạn vì sóng yếu trong tòa nhà.

---

## 4. Phạm vi

### 4.1 Trong phạm vi

- Xem danh sách và chi tiết workshop; số chỗ còn lại cập nhật theo thời gian thực
- Đăng ký workshop: miễn phí và có phí (thanh toán online)
- Phát mã QR sau khi đăng ký thành công
- Check-in bằng mobile app: hoạt động online và offline, tự đồng bộ khi kết nối phục hồi
- Thông báo xác nhận qua in-app và email; hệ thống được thiết kế để bổ sung kênh mới (ví dụ: Telegram) mà không cần sửa code hiện tại
- Trang admin: tạo, sửa, hủy workshop; xem thống kê đăng ký
- Phân quyền 3 nhóm: Sinh viên / Ban tổ chức / Nhân sự check-in
- AI Summary: upload PDF → hệ thống tự xử lý và hiển thị bản tóm tắt trên trang chi tiết workshop
- Đồng bộ dữ liệu sinh viên từ file CSV ban đêm (validate, xử lý lỗi, upsert idempotent)
- Bảo vệ API: Rate Limiting chống spam và Circuit Breaker cho payment gateway

### 4.2 Ngoài phạm vi

| Hạng mục | Lý do loại trừ |
|---|---|
| Payment gateway thật | Không có tài khoản production; dùng mock/sandbox |
| Deploy cloud production | Không yêu cầu; chạy Docker Compose |
| SLA availability ≥ 99.9% | Không có infrastructure phù hợp |
| Refund / hoàn tiền | Quy trình nghiệp vụ chưa được định nghĩa |
| Analytics nâng cao | Ngoài yêu cầu; chỉ thống kê số đăng ký cơ bản |
| OAuth / SSO với hệ thống trường | Không có thông tin tích hợp LDAP/CAS |
| Đa ngôn ngữ | Không yêu cầu |
| GDPR / data retention policy | Ngoài phạm vi môn học |
| Push notification native (APNs/FCM) | Chỉ in-app notification và email |

---

## 5. Rủi ro và ràng buộc

### 5.1 Rủi ro kỹ thuật

**R1 — Tranh chấp chỗ ngồi:** Ưu tiên cao — bắt buộc đúng, không có phương án degrade. Khi hàng trăm sinh viên tranh cùng một workshop trong vài giây, hệ thống phải tuyệt đối không bán trùng. Xử lý bằng Optimistic Locking ở tầng database kết hợp Rate Limiting để kiểm soát lượng request đến DB.

**R2 — Tải đột biến:** Ưu tiên cao. 7,200 sinh viên trong 3 phút đầu có thể áp đảo backend nếu không có lớp bảo vệ. Xử lý bằng Rate Limiting (per-user và per-workshop) và Redis cache cho dữ liệu đọc nhiều; sinh viên vượt ngưỡng nhận phản hồi yêu cầu chờ thay vì làm hệ thống sập.

**R3 — Thanh toán không ổn định:** Ưu tiên cao — bắt buộc đúng ở hai điểm độc lập. (a) Khi payment gateway sự cố kéo dài, các tính năng không liên quan vẫn chạy bình thường — xử lý bằng Circuit Breaker. (b) Client retry nhiều lần không gây trừ tiền 2 lần — xử lý bằng Idempotency Key lưu trong database. Cả hai không có phương án degrade.

**R4 — Check-in offline:** Ưu tiên cao về tiến độ. Là tính năng duy nhất đòi cài đặt đồng thời trên mobile, backend, và sync protocol — chi phí implementation cao nhất trong dự án. Prototype trong 2 tuần đầu giai đoạn cài đặt; nếu không đạt go/no-go trước tuần 4, degrade thành check-in online-only và ghi nhận hạn chế rõ ràng.

**R5 — Tích hợp CSV một chiều:** Ưu tiên trung bình. File CSV từ hệ thống sinh viên có thể chứa dữ liệu lỗi hoặc trùng lặp; pipeline phải xử lý được mà không gián đoạn hệ thống đang chạy. Xử lý bằng batch pipeline ban đêm với error quarantine (file lỗi được cách ly, không xóa) và import idempotent (chạy lại nhiều lần ra cùng kết quả). Khi pipeline lỗi, hệ thống tiếp tục chạy với dữ liệu sinh viên của lần import gần nhất; admin được thông báo để xử lý file lỗi thủ công.

### 5.2 Ràng buộc team và môi trường

- **Nhân sự:** 2 thành viên, ~2 tuần. Không có dedicated mobile developer — R4 là rủi ro tiến độ cao nhất và sẽ được prototype sớm nhất.
- **Môi trường:** Docker Compose local hoặc VPS đơn giản; không dùng Kubernetes hay cloud managed services.
- **Payment:** Chỉ mock/sandbox — cần tự dựng mock server (Wiremock hoặc tương đương) để kiểm thử failure mode.
- **Dữ liệu sinh viên:** File CSV là nguồn duy nhất; không có API backup khi file lỗi hoặc export muộn.
