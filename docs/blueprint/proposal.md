# UniHub Workshop — Project Proposal

## Vấn đề

Hiện tại, ban tổ chức sự kiện "Tuần lễ kỹ năng và nghề nghiệp" đang quản lý quy trình đăng ký tham dự thông qua Google Form và đối soát email thủ công. Khi quy mô sự kiện tăng lên (8-12 workshop mỗi ngày, diễn ra song song), phương pháp này bộc lộ những điểm yếu nghiêm trọng:

1. **Mất kiểm soát số lượng (Overselling):** Google Form không có khả năng tự động dừng nhận phản hồi ngay tại thời điểm số lượng đăng ký đạt mức giới hạn sức chứa của phòng. Hậu quả là sinh viên vẫn đăng ký thành công dù đã hết chỗ, gây bức xúc và làm vỡ kế hoạch tổ chức.

2. **Độ trễ thông tin và Nút thắt vận hành:** Việc xác nhận đăng ký và gửi mã QR thủ công qua email tạo ra một khoảng thời gian chờ đợi mù mờ cho sinh viên. Tại hiện trường, việc điểm danh bằng giấy hoặc đối chiếu màn hình mắt thường dẫn đến hàng chờ kéo dài, làm chậm tiến độ chương trình.

3. **Sự rời rạc trong xác thực dữ liệu:** Dữ liệu sinh viên trên hệ thống cũ của trường không được kết nối với danh sách đăng ký mới. Ban tổ chức không có cách nào tự động xác thực xem một người đăng ký có thực sự là sinh viên hợp lệ của trường hay không tại thời điểm họ điền form.

## Mục tiêu

Dự án nhằm xây dựng một nền tảng quản lý hội thảo tập trung (UniHub Workshop), số hóa toàn bộ quy trình từ khâu công bố sự kiện đến lúc điểm danh.

**Mục tiêu định lượng và hiệu năng:**

- **Khả năng chịu tải:** Hệ thống có khả năng tiếp nhận và xử lý ổn định 12.000 lượt truy cập trong 10 phút đầu tiên mở cổng đăng ký, trong đó đảm bảo phục vụ thông suốt 7.200 lượt yêu cầu dồn dập trong 3 phút đầu.
- **Tính nhất quán dữ liệu:** Cam kết 100% không xảy ra tình trạng cấp phát vượt quá số lượng chỗ ngồi quy định tại bất kỳ workshop nào.
- **Hiệu suất điểm danh:** Rút ngắn thời gian quét mã QR và phản hồi trạng thái "Đã check-in" xuống dưới 1 giây cho mỗi lượt kiểm tra tại cửa.

**Mục tiêu chức năng cốt lõi:**

- Cung cấp đầy đủ 6 nhóm tính năng nghiệp vụ: (1) Xem và đăng ký workshop, (2) Hệ thống thông báo đa kênh, (3) Quản trị nội dung sự kiện, (4) Tự động tóm tắt nội dung bằng AI, (5) Đồng bộ dữ liệu sinh viên từ hệ thống cũ, và (6) Ứng dụng di động để quét QR check-in.

## Người dùng và nhu cầu

Hệ thống được thiết kế để phục vụ 3 nhóm đối tượng chính, mỗi nhóm có các nhu cầu và ưu tiên riêng biệt:

1. **Sinh viên (End-User):**
   - _Họ cần làm gì:_ Xem lịch diễn ra các workshop, đọc tóm tắt nội dung nhanh, đăng ký giữ chỗ (miễn phí hoặc có phí) và nhận mã xác nhận (QR code).
   - _Điều gì quan trọng nhất:_ Trải nghiệm đăng ký phải cực kỳ mượt mà và công bằng. Thông tin về "số chỗ còn lại" phải chính xác tuyệt đối. Khi thanh toán có lỗi, họ cần biết rõ tiền của mình có bị trừ oan hay không.

2. **Ban tổ chức (Admin):**
   - _Họ cần làm gì:_ Tạo mới và chỉnh sửa thông tin workshop, thiết lập sức chứa phòng, tải lên tài liệu mô tả, chạy tiến trình nhập dữ liệu sinh viên và theo dõi báo cáo đăng ký.
   - _Điều gì quan trọng nhất:_ Giảm thiểu tối đa thao tác thủ công. Công cụ quản lý cần cung cấp cái nhìn tổng quan theo thời gian thực về tình trạng lấp đầy của các sự kiện.

3. **Nhân sự Check-in (Operator):**
   - _Họ cần làm gì:_ Sử dụng thiết bị di động quét mã QR của sinh viên tại cửa ra vào để ghi nhận sự có mặt.
   - _Điều gì quan trọng nhất:_ Ứng dụng quét mã phải hoạt động cực nhanh và đặc biệt là không bị gián đoạn hay mất dữ liệu khi mạng wifi/4G tại hội trường bị mất kết nối.

## Phạm vi

Với nguồn lực là 2 sinh viên (1 phụ trách Web/Backend, 1 phụ trách Mobile) thực hiện trong 14 ngày, việc xác định ranh giới dự án là yếu tố quyết định để nghiệm thu thành công.

**Thuộc phạm vi đồ án (In-Scope):**

- Phát triển Backend API cung cấp các dịch vụ xử lý logic đăng ký, đồng bộ dữ liệu và tích hợp dịch vụ tóm tắt AI.
- Xây dựng Web Portal phục vụ giao diện hiển thị cho Sinh viên và bảng điều khiển cho Ban tổ chức.
- Phát triển Mobile App với tính năng cốt lõi là quét QR code và lưu trữ trạng thái check-in.
- Thiết kế kiến trúc và luồng xử lý (trên lý thuyết và có cài đặt cơ bản) cho các bài toán: kiểm soát tranh chấp dữ liệu, giới hạn lưu lượng, và cơ chế bảo vệ khi thanh toán lỗi.

**KHÔNG thuộc phạm vi đồ án (Out-of-Scope):**

- **Tích hợp hạ tầng thực tế:** Không yêu cầu tích hợp cổng thanh toán (Payment Gateway) thực tế của ngân hàng/ví điện tử, cũng như không yêu cầu gửi Email/SMS thực tế. Các chức năng này sẽ được giả lập (Mock) hành vi thành công/thất bại để chứng minh tính đúng đắn của luồng thiết kế.
- **Triển khai quy mô lớn (Production Infrastructure):** Không yêu cầu thiết lập các hệ thống cân bằng tải (Load Balancer) vật lý, kiến trúc triển khai đa vùng (Multi-region) hay các cụm máy chủ phân tán. Hệ thống sẽ được đánh giá dựa trên kiến trúc phần mềm và mã nguồn.
- **Phát triển Model AI riêng:** Sử dụng các dịch vụ AI có sẵn thông qua API thay vì tự huấn luyện mô hình tóm tắt văn bản.

## Rủi ro và ràng buộc

Quá trình thiết kế và phát triển hệ thống phải đối mặt và đưa ra giải pháp cụ thể cho 5 vấn đề kỹ thuật lớn sau:

1. **Tranh chấp chỗ ngồi (Race Condition):**
   - **Vấn đề:** Một số workshop giới hạn chỉ 60 chỗ, nhưng dự kiến sẽ có hàng trăm sinh viên cố gắng nhấn nút đăng ký cùng một phần nghìn giây khi cổng vừa mở.
   - **Ràng buộc thiết kế:** Hệ thống bắt buộc phải có cơ chế kiểm soát đồng thời (Concurrency Control) tại tầng lưu trữ dữ liệu để đảm bảo tính nguyên tử (Atomicity). Không được phép xảy ra trường hợp hai sinh viên cùng nhận được xác nhận thành công cho slot cuối cùng.

2. **Tải trọng đột biến (Traffic Spikes):**
   - **Vấn đề:** Lưu lượng truy cập dồn dập (12.000 sinh viên/10 phút) có thể vắt kiệt tài nguyên xử lý của máy chủ, gây ra hiện tượng từ chối dịch vụ (DDoS tự nhiên).
   - **Ràng buộc thiết kế:** Kiến trúc phải bao gồm các cơ chế bảo vệ như giới hạn tốc độ truy cập (Rate Limiting) để từ chối các yêu cầu spam từ cùng một client, và thiết kế các lớp đệm (Caching) để giảm tải các truy vấn đọc dữ liệu lặp đi lặp lại.

3. **Thanh toán không ổn định và Trừ tiền hai lần:**
   - **Vấn đề:** Cổng thanh toán bên thứ ba có thể bị gián đoạn (timeout) do quá tải mạng. Sinh viên bấm F5 hoặc nhấn thanh toán lại khi chưa thấy thông báo.
   - **Ràng buộc thiết kế:** Luồng đăng ký phải áp dụng cơ chế tự phục hồi (Resilience). Các tính năng xem lịch và đăng ký miễn phí không được phép "chết" theo cổng thanh toán. Hệ thống phải sinh ra các mã định danh giao dịch duy nhất (Idempotency Key) để nhận diện yêu cầu lặp lại, tuyệt đối ngăn chặn việc trừ tiền hai lần.

4. **Check-in offline và Mất đồng bộ:**
   - **Vấn đề:** Hạ tầng mạng tại khu vực check-in có thể chập chờn hoặc rớt hoàn toàn.
   - **Ràng buộc thiết kế:** Ứng dụng di động phải có khả năng xác thực mã QR thông qua cơ sở dữ liệu lưu trữ cục bộ (Local Storage). Khi mạng phục hồi, dữ liệu đã check-in phải được đồng bộ hóa ngược lên máy chủ trung tâm thông qua các cơ chế giải quyết xung đột (Conflict Resolution), đảm bảo không ghi đè sai lệch dữ liệu mới nhất.

5. **Tích hợp một chiều với dữ liệu không sạch (CSV Sync):**
   - **Vấn đề:** Hệ thống quản lý sinh viên hiện hữu đóng kín, chỉ cung cấp file CSV xuất tự động vào ban đêm. File này có thể chứa dữ liệu trùng lặp, thiếu trường bắt buộc hoặc sai định dạng.
   - **Ràng buộc thiết kế:** Module đồng bộ không được làm treo hệ thống chính khi đang xử lý hàng chục ngàn dòng dữ liệu. Cần thiết kế một luồng xử lý theo lô (Batch Processing) có khả năng tự động xác thực tính hợp lệ của dữ liệu, bỏ qua các bản ghi lỗi (có lưu log) và tiến hành cập nhật/chèn mới (Upsert) một cách trơn tru.
