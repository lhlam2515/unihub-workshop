# Data — Seed & Setup

Thư mục này chứa dữ liệu mẫu và script hỗ trợ khởi tạo cơ sở dữ liệu.

## Khởi tạo database

### Bước 1 — Chạy migrations

```sh
# Từ thư mục gốc của repo
cd apps/server
pnpm db:migrate
```

> Nếu đây là lần đầu chạy, có thể dùng `pnpm db:push` thay thế (nhanh hơn cho môi trường dev).

### Bước 2 — Seed dữ liệu mẫu

```sh
# Từ thư mục gốc của repo
pnpm db:seed

# Hoặc từ apps/server
cd apps/server && pnpm db:seed
```

Script seed **xóa toàn bộ dữ liệu cũ** rồi tạo lại từ đầu (re-runnable).  
Kết quả sau khi seed:

| Loại | Số lượng |
|------|----------|
| Tài khoản staff | 3 (1 BTC + 2 Check-in) |
| Tài khoản sinh viên | 500 |
| Workshop | ~15 (kết hợp miễn phí / có phí, đã publish / draft) |
| Đăng ký | ~600 |
| Thanh toán | ~200 |
| Check-in record | ~400 |
| CSV sync job | 1 (SUCCESS, hôm qua) |

## Tài khoản mặc định

Mật khẩu tất cả tài khoản: **`123456789`**

| Vai trò | Email | Quyền hạn |
|---------|-------|-----------|
| BTC (Ban Tổ Chức) | `btc.admin@unihub.edu.vn` | Tạo/sửa/hủy workshop, xem thống kê, quản lý hệ thống |
| Check-in Staff | `checkin1@unihub.edu.vn` | Quét mã QR tại cửa (mobile app) |
| Check-in Staff | `checkin2@unihub.edu.vn` | Quét mã QR tại cửa (mobile app) |
| Sinh viên | `sv23127001@student.edu.vn` | Xem + đăng ký workshop |
| Sinh viên | `sv23127002@student.edu.vn` | Xem + đăng ký workshop |

> Sinh viên có MSSV từ `23127001` đến `23127500`, email tương ứng `sv{mssv}@student.edu.vn`.

## File CSV mẫu

`students_2025-05-17.csv` — file export mẫu mô phỏng hệ thống quản lý sinh viên của trường  
(xuất ra mỗi đêm theo lịch cố định).

Để test tính năng **CSV Sync**:

1. Đăng nhập BTC admin → **System Health → Student Sync**
2. Upload file CSV từ thư mục này
3. Quan sát quá trình import, xử lý lỗi và số liệu tổng kết

## Script nhanh

```sh
# Chạy từ thư mục gốc — tự động migrate + seed
bash data/setup.sh
```

## Schema SQL thủ công

`data/schema.sql` — DDL đầy đủ (enums + tables + indexes + constraints).  
Dùng khi cần khởi tạo schema mà không cần toolchain Node.js:

```sh
psql "$DATABASE_URL" -f data/schema.sql
```

> Ưu tiên dùng `pnpm db:migrate` (có versioning). Script SQL này dành cho review thủ công hoặc môi trường CI không có Node.
