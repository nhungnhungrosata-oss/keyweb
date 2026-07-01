# Cập nhật khóa key theo thiết bị

Bản này đã chỉnh web kích hoạt key để phù hợp với cơ chế `1 key = 1 thiết bị`.

## Đã sửa trong web Next.js

- `/api/check` không chỉ gửi `device_key` nữa, mà chuyển tiếp toàn bộ thông tin thiết bị từ web khách sang Apps Script.
- `/api/activate` chuyển tiếp đủ payload và giữ cơ chế admin secret.
- Thêm `/api/reset-device` để reset thiết bị đã gắn với key.
- Giao diện admin có thêm nút **Reset thiết bị**.

## Cần sửa Apps Script

File `APPS_SCRIPT_DEVICE_LOCK.gs` là mẫu Apps Script đầy đủ. Dán vào Apps Script đang nối với Google Sheet.

Sheet sẽ tự thêm các cột cần thiết nếu thiếu:

```text
device_key | status | app_id | plan | device_id | device_fingerprint | device_name | platform | timezone | user_agent | activated_at | expires_at | note | updated_at
```

## Cơ chế hoạt động

1. Admin nhập `device_key` và bấm **Kích hoạt**.
2. Google Sheet lưu key ở trạng thái `ACTIVE`, nhưng chưa gắn thiết bị.
3. Khi khách mở web `veoday`, web gửi `device_key` + `device_id` lên `/api/check`.
4. Nếu key chưa có `device_id`, Apps Script tự lưu thiết bị đầu tiên.
5. Lần sau nếu mở đúng thiết bị, trả `ACTIVE`.
6. Nếu mở thiết bị khác, trả `DEVICE_MISMATCH` để web khách khóa lại.
7. Khi cần đổi máy cho khách, admin bấm **Reset thiết bị**.
