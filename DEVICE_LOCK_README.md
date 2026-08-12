# Khóa license theo tối đa 3 trình duyệt

## Cơ chế mới

- `device_key` cũ được giữ làm **mã license** để không làm mất khách đã kích hoạt.
- Mỗi trình duyệt tự tạo một `installation_id` ổn định; cập nhật Chrome/Edge không đổi mã này.
- Một license đăng ký tối đa 3 `installation_id`.
- Fingerprint, màn hình, múi giờ và user-agent chỉ dùng để chẩn đoán, không dùng để quyết định khóa.
- Trial 3 ngày được ghi vào Google Sheet.
- Nếu máy chủ license tạm lỗi, trình duyệt đã kiểm tra ACTIVE gần nhất tiếp tục dùng tối đa 48 giờ.
- Các thao tác kích hoạt, thu hồi và reset yêu cầu đăng nhập bằng `ADMIN_SECRET`.

## Cột Google Sheet

Apps Script tự bổ sung cột thiếu, không xóa dữ liệu cũ:

```text
device_key | status | app_id | plan | max_installations | installation_ids |
device_id | device_fingerprint | device_name | platform | timezone | user_agent |
activated_at | expires_at | trial_started_at | trial_expires_at | note | updated_at
```

`installation_ids` là mảng JSON, ví dụ:

```json
["WEB-AAA...", "WEB-BBB...", "WEB-CCC..."]
```

## Triển khai Apps Script

1. Mở Google Sheet đang quản lý key.
2. Chọn **Extensions → Apps Script**.
3. Thay toàn bộ `Code.gs` bằng nội dung `APPS_SCRIPT_DEVICE_LOCK.gs`.
4. Trong **Project Settings → Script Properties**, bảo đảm `ADMIN_SECRET` giống ENV trên Vercel.
5. Chọn **Deploy → New deployment → Web app**.
6. Đặt **Execute as: Me** và **Who has access: Anyone**.
7. Copy Web app URL mới vào ENV `APPS_SCRIPT_URL` của dự án `keyweb` trên Vercel nếu URL thay đổi.
8. Redeploy `keyweb` sau khi đổi ENV.

## Vận hành

1. Khách gửi mã license đang hiển thị trên Veoday.
2. Admin đăng nhập trang `keyweb`, nhập mã và bấm **Kích hoạt**.
3. Trình duyệt đầu tiên tự chiếm slot 1; trình duyệt khác nhập cùng mã để chiếm slot 2 hoặc 3.
4. Trình duyệt thứ tư nhận `DEVICE_LIMIT` và bị khóa.
5. Khi khách đổi máy, admin bấm **Reset trình duyệt**. Thời hạn license không thay đổi.

## Tương thích dữ liệu cũ

Nếu bản ghi cũ đang có `device_id` dạng fingerprint, lần kiểm tra đầu tiên từ client mới sẽ tự chuyển sang `installation_id` ổn định mà không tốn thêm slot. Không cần xóa hoặc sửa tay các hàng cũ.
