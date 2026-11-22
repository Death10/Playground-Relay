# Hướng dẫn sử dụng

## 🛠️ Cài đặt

1. **Cài đặt Userscript:** Cài đặt tệp `userscript-playground-executor-en.user.js` vào trình duyệt của bạn (thông qua Tampermonkey hoặc công cụ quản lý userscript tương tự).
2. **Cài đặt thư viện:** Chạy tệp `INSTALL.bat` (lệnh này sẽ tự động chạy `npm install`).
3. **Khởi chạy máy chủ:** Chạy tệp `START.bat`.
   - `API_KEYS` mặc định: `my-secret-key`
   - *(Tùy chọn)* Bạn có thể mở và chỉnh sửa giá trị này trực tiếp bên trong tệp `START.bat`.
4. **Kết nối Google AI Studio:**
   - Truy cập [Google AI Studio](https://aistudio.google.com/).
   - Nhập `API_KEYS` của bạn và nhấn **Connect**.
   - Có thể thử prompt 'hi' trên trình duyệt xem có nhận không.
5. **Cấu hình trên SillyTavern:**
   - **Custom Endpoint (Base URL):** `http://0.0.0.0:8787/v1` (hoặc `http://localhost:8787/v1`)
   - **Custom API Key:** `my-secret-key` *(hoặc key bạn đã đổi ở Bước 3)*

---

## ⚠️ Tính năng chưa hỗ trợ

- **Thinking level:** Chưa hỗ trợ tùy chỉnh mức độ suy nghĩ (chưa hỗ trợ *Thinking* bằng tiếng Anh mặc định).

## ⚠ Lưu ý (Khuyên dùng)

- **Sử dụng Preset:** Nếu dùng Preset, quá trình suy nghĩ (*Thinking*) sẽ hoạt động dựa theo **Chuỗi tư duy (Chain of Thought)** được thiết lập sẵn trong Preset đó.
