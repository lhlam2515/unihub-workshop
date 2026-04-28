# UniHub Web Portal — Tài liệu Đặc tả Triển khai Features (FSD)

Tài liệu này quy định cấu trúc và danh sách các Tính năng (Features) sẽ được cài đặt trong dự án UniHub Web Portal. Mọi feature phải tuân thủ nghiêm ngặt quy tắc của Feature-Sliced Design (FSD) để đảm bảo tính mở rộng và dễ bảo trì.

## 1. Quy chuẩn Cấu trúc Thư mục Feature

Mỗi feature nằm trong `src/features/[feature-name]` phải có cấu trúc nội bộ đồng nhất như sau:

```text
src/features/[feature-name]/
├── api/                # Tầng giao tiếp dữ liệu & logic nghiệp vụ
│   ├── *.service.ts    # Logic gọi API qua apiClient, trả về Result<T>
│   └── *.action.ts     # Next.js Server Action, xử lý revalidate và handleError
├── lib/                # Tầng bổ trợ (Utilities)
│   ├── *.schema.ts     # Zod Schema dùng cho validation (Client & Server)
│   └── *.types.ts      # Các kiểu dữ liệu nội bộ dành riêng cho feature
└── components/         # Tầng hiển thị (Components)
    ├── *.tsx           # Các Client/Server Components (Form, Button, Modal)
    └── index.ts        # Public API để export các Component chính
```

---

## 2. Danh sách Features & Đặc tả Triển khai

Dưới đây là các feature cốt lõi được phân rã từ 31 màn hình đặc tả:

### Nhóm A: Xác thực & Tài khoản (Auth Domain)

Phụ trách các luồng truy cập và bảo mật hệ thống.

| Feature Name | Mục đích | Thành phần chính |
| :--- | :--- | :--- |
| **`auth-login`** | Xử lý đăng nhập đa vai trò (Student/Organizer) | `api`: `login.service`, `login.action` (Dual-Token JWT).<br>`lib`: `login.schema` (Email/Pass).<br>`components`: `LoginForm`. |
| **`auth-logout`** | Thu hồi phiên làm việc khẩn cấp | `api`: `logout.service` (POST `/auth/logout`).<br>`components`: `LogoutButton` (Dùng trong W12, W08). |

### Nhóm B: Sinh viên — Tương tác & Giao dịch (Student Workshop Domain)

Tập trung vào luồng đăng ký và thanh toán thực tế của sinh viên.

| Feature Name | Mục đích | Thành phần chính |
| :--- | :--- | :--- |
| **`register-workshop`** | Luồng đăng ký Workshop (Free/Paid) | `api`: `register.service` (POST `/registrations`).<br>`components`: `RegisterButton` (Logic chuyển hướng Payment hoặc MyTickets). |
| **`process-payment`** | Hoàn tất giao dịch tài chính (W04) | `api`: `payment.service` (Idempotency Key).<br>`lib`: `countdown.ts` (SeatLock 15p).<br>`components`: `CheckoutForm` (VNPAY/MOMO). |
| **`cancel-registration`** | Hủy đơn đăng ký đang chờ hoặc đã xác nhận | `api`: `cancel.service` (DELETE `/registrations/[id]`).<br>`components`: `CancelConfirmModal`. |

### Nhóm C: Quản trị — Vòng đời Sự kiện (Admin Lifecycle Domain)

Công cụ dành cho Ban tổ chức (ORGANIZER) quản lý Workshop.

| Feature Name | Mục đích | Thành phần chính |
| :--- | :--- | :--- |
| **`create-workshop`** | Tạo Workshop nháp (W15) | `api`: `create.service`. `lib`: `workshop.schema` (check room conflict real-time).<br>`components`: `WorkshopForm`. |
| **`change-workshop-status`** | Quản lý trạng thái (DRAFT -> PUBLISHED) | `api`: `status.service` (POST `/publish`).<br>`components`: `StatusControlPanel` (Nút Publish/Cancel). |
| **`emergency-update`** | Cập nhật phòng/giờ khẩn cấp (W16) | `api`: `update.service` (PATCH `/emergency-update`).<br>`components`: `EmergencyUpdateModal`. |

### Nhóm D: Quản trị — Tài nguyên & Dữ liệu (Resources Domain)

Xử lý tài liệu PDF, AI Summary và dữ liệu nền.

| Feature Name | Mục đích | Thành phần chính |
| :--- | :--- | :--- |
| **`manage-workshop-ai`** | Quản lý tài liệu & AI Pipeline (W19) | `api`: `upload.service`, `poll-status.service`.<br>`components`: `DocumentUploader`, `AiSummaryViewer`. |
| **`manage-master-data`** | Quản lý Phòng & Diễn giả (W20-W23) | `api`: `master-data.service` (CRUD Rooms/Speakers).<br>`components`: `RoomForm`, `SpeakerForm`. |
| **`trigger-student-sync`** | Đồng bộ sinh viên từ CSV (W27-W28) | `api`: `sync.service` (Async Job Trigger).<br>`components`: `SyncJobManager`, `ErrorLogTable`. |

---

## 3. Quy trình Triển khai một Feature (Standard Workflow)

Khi cài đặt một feature mới (ví dụ: `register-workshop`), bạn PHẢI tuân thủ các bước sau:

1. **Thiết lập Schema (`lib/`):** Định nghĩa Zod Schema dựa trên DTO của NestJS.
2. **Viết Service (`api/`):**
    * Sử dụng `apiClient` từ `shared/api`.
    * Bọc hàm gọi trong `safeApiCall` để nhận về `Result<T>`.
    * Tuyệt đối không dùng `try/catch` tại đây (đã có Interceptor xử lý).
3. **Viết Server Action (`api/`):**
    * Gọi `action()` để xác thực quyền (authorize).
    * Gọi Service tương ứng.
    * Sử dụng `handleError(result.error)` nếu thất bại.
    * Gọi `revalidatePath()` hoặc `revalidateTag()` nếu thành công.
4. **Xây dựng Components (`components/`):**
    * Sử dụng React Hook Form kết hợp Zod Schema.
    * Hiển thị Loading state trong khi chờ Action.
    * Dùng `toast.error` hoặc `toast.success` dựa trên kết quả trả về từ Action.

---

## 4. Ràng buộc Kiến trúc (Boundaries)

* **No Cross-Imports:** Một feature không được import code từ feature khác. Nếu hai feature cần chia sẻ logic, hãy đẩy logic đó xuống tầng `entities` hoặc `shared`.
* **Encapsulation:** Mọi feature chỉ export những gì cần thiết qua file `index.ts` của thư mục `components/`. Các logic API và Lib nội bộ phải được giữ kín.
* **Error Handling:** Phải sử dụng chung lớp `ApiError` và hàm `handleError` để thống nhất trải nghiệm thông báo lỗi cho người dùng.
