# 📧 Setup Email Báo Cáo Sản Xuất Cuối Ngày

App đã có sẵn code. Anh chỉ cần làm **2 bước** để Apps Script tự gửi email mỗi 23h JST.

---

## ✅ Bước 1: Update code Apps Script (1 phút)

1. Mở https://script.google.com → project Bếp Thuỷ Japan
2. Tìm file `Mã.gs` → Cmd+A → Cmd+V (paste đè code mới từ:
   https://raw.githubusercontent.com/takahashi1109y/bep-thuy-japan/main/google-apps-script.js)
3. **Cmd+S** Save
4. Bấm **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**

Verify: Cmd+F tìm `sendDailyProductionReport` — phải thấy.

---

## ✅ Bước 2: Add daily trigger (2 phút)

1. Trong Apps Script editor, sidebar trái → click **⏰ Triggers** (icon đồng hồ)
2. Bấm nút **+ Add Trigger** (góc dưới phải)
3. Cấu hình:
   - **Choose which function to run:** `sendDailyProductionReport`
   - **Choose which deployment should run:** `Head`
   - **Select event source:** `Time-driven`
   - **Select type of time based trigger:** `Day timer`
   - **Select time of day:** `11pm to midnight` (= 23h-0h JST)
   - **Failure notification settings:** `Notify me immediately`
4. Bấm **Save** → Allow permissions nếu hiện popup

---

## 🧪 Test trước khi đợi

Để chắc chắn email gửi được, anh chạy thử ngay:

1. Trong Apps Script editor, top dropdown chọn **`sendDailyProductionReport`**
2. Bấm nút **▶ Run**
3. Lần đầu sẽ xin permission MailApp → Allow
4. Check email **support@thuyjapan.com** sau ~1 phút

---

## 📊 Email mẫu

Mỗi đêm anh sẽ nhận email với:

- **Tiêu đề:** `🏭 Báo cáo sản xuất 2026-04-27 — 12 đơn (¥143,500)`
- **Nội dung:**
  - Banner đen-vàng có logo + ngày + tổng đơn + tổng doanh thu
  - Bảng 10 sản phẩm với tổng số lượng (kg/túi/hộp)
  - Tự động trừ đơn đã huỷ

---

## ⚠️ Lưu ý

- Email gửi từ Gmail của anh (account đăng nhập Apps Script). Quota: **100 emails/ngày** miễn phí — quá nhiều so với 1 email/ngày.
- Nếu muốn đổi giờ gửi: Triggers → Edit → đổi "Select time of day"
- Nếu muốn thêm người nhận: edit dòng `var PRODUCTION_REPORT_EMAIL = '...'` trong code, có thể dùng `'a@gmail.com,b@gmail.com'` để gửi nhiều người
- Nếu trigger fail (mất mạng, Supabase down) → Apps Script tự gửi email cảnh báo cho admin (anh đã chọn "Notify me immediately")

---

## 🆘 Nếu không nhận được email

1. Kiểm tra Apps Script → **⏱️ Executions** xem `sendDailyProductionReport` có chạy không
2. Click vào execution → đọc log
3. Common errors:
   - "Supabase creds missing" → `SUPABASE_URL` hoặc `SUPABASE_SERVICE_KEY` chưa add vào Script Properties
   - "Mail quota exceeded" → vượt 100 emails/ngày, hiếm
   - Email đi vào Spam → check thư mục Spam của support@thuyjapan.com

Anh setup xong báo em test cùng nhé!
