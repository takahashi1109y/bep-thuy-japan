# KHẨN: Recovery cho đơn test ¥2,300 PayPay (16:56 ngày 02/05/2026)

> **Tình huống:** Anh vừa test checkout, đã chuyển PayPay ¥2,300 cho chính mình (Thanghoang),
> nhưng AI verify FAIL nên server (Apps Script) trả về `verify_failed` và **không tạo đơn**
> trên Supabase.
>
> Em (Claude main) đã fix xong **Layer 7 (regex 取引ID)** trong `google-apps-script.js`. Bill cũ
> sẽ KHÔNG tự động retry — anh cần làm theo các bước dưới để khôi phục đơn này.
>
> **Mục tiêu:** xác minh đơn có vào DB chưa, và quyết định 1 trong 3 hướng phục hồi.

---

## Bước 0: Redeploy Apps Script (bắt buộc làm trước)

Anh phải deploy bản fix mới trước khi mọi thứ khác:

1. Mở https://script.google.com
2. Project **Bep Thuy Japan**
3. Bấm **Deploy** (góc phải) → **Manage deployments**
4. Bấm bút chì (Edit) ở deployment hiện tại
5. **Version** → chọn **New version** (BẮT BUỘC, không để Test deployment)
6. Description: `Fix Layer 7 regex 取引ID`
7. **Deploy**
8. Copy lại URL deployment — phải GIỐNG URL cũ (cùng deployment ID, chỉ tăng version)

> Nếu URL đổi, anh phải update `APPS_SCRIPT_URL` trong code frontend rồi mới test tiếp.
> Em đã viết hướng dẫn redeploy chi tiết ở `REDEPLOY-APPS-SCRIPT-NOW.md` — anh xem lại nếu cần.

---

## Section A — Check xem đơn đã vào Supabase `orders` chưa

### A.1. Mở SQL editor

URL: https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new

### A.2. Chạy query (CHỈ ĐỌC, an toàn 100%)

```sql
SELECT
  order_no,
  status,
  customer_name,
  customer_email,
  total,
  ai_verify_passed,
  ai_detected_amount,
  created_at
FROM orders
WHERE customer_email = 'thanghoang1109@gmail.com'
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC;
```

> Query này chỉ `SELECT` — không UPDATE, không DELETE, an toàn tuyệt đối.

### A.3. Đọc kết quả

| Kết quả | Ý nghĩa | Đi tiếp đến |
|---|---|---|
| **0 rows** | Đơn KHÔNG được tạo (verify FAIL → return early) | **Section C — Option 1** |
| 1 row, `status = 'pending'`, `ai_verify_passed = NULL` hoặc `false` | Đơn vào DB nhưng chưa xác nhận thanh toán | **Section C — Option 2** |
| 1 row, `status = 'customer_paid'`, `ai_verify_passed = true` | Đơn OK rồi, không cần làm gì! | Skip phần dưới |
| Nhiều rows | Có thể anh đã thử nhiều lần — xem dòng nào `created_at` gần 16:56 nhất | Tuỳ trạng thái dòng đó, xem 3 case trên |

### A.4. (Bonus) Check thêm `payment_confirmations`

```sql
SELECT
  order_no,
  ai_match,
  ai_detected_amount,
  expected_amount,
  ai_reason,
  screenshot_hash,
  created_at
FROM payment_confirmations
WHERE created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC
LIMIT 10;
```

Nếu thấy `ai_match = false` với `ai_reason` chứa `取引ID` hoặc `mã giao dịch` → confirm là Layer 7
fail (đúng như em đoán).

---

## Section B — Check Apps Script Executions log

Để xem chính xác layer nào fail và error message gì.

### B.1. Mở log

1. https://script.google.com → project **Bep Thuy Japan**
2. Sidebar trái → **Executions** (biểu tượng đồng hồ)

### B.2. Tìm lần verify FAIL hôm nay 16:56

- Filter **Date** = today (02/05/2026)
- Filter **Function** = `doPost`
- Tìm row có **Start time** gần `16:56`
- Status sẽ là **Completed** (không phải Failed — vì doPost luôn return 200, FAIL nằm trong response body)

### B.3. Click vào row đó để xem log chi tiết

Cần tìm các dòng log:

- `verifyReceiptStandalone_ error: ...` — nếu có exception
- `Layer 7 ...` hoặc `取引ID ...` — confirm Layer 7 fail
- Dòng cuối có chữ `verify_failed` — confirm verify reject

### B.4. Ghi lại

- Timestamp chính xác (giờ:phút:giây JST)
- Reason text (Tiếng Việt từ `result.reason`)
- Detected amount (nếu có)

> Thông tin này hữu ích nếu cần debug thêm. Cứ gửi screenshot cho em nếu anh không chắc.

---

## Section C — Recovery options (chọn 1 theo Section A)

### Option 1 — Đơn KHÔNG vào DB (kết quả A.3 = 0 rows) ⭐ Khả năng cao nhất

**Nguyên nhân:** `verify_then_create_order` return early ở line ~209 khi `verifyRes.match = false`,
trước khi gọi `saveOrder` / `saveOrderToSupabase`. Bill cũ không có cơ chế retry.

**Cách phục hồi (DỄ NHẤT):**

1. Anh **đã làm Bước 0** (redeploy Apps Script) — confirm version mới đang chạy
2. Mở lại site Bếp Thuỷ → checkout đơn ¥2,300 với cùng cart
3. Ở bước upload bill PayPay:
   - **Có thể upload lại screenshot ¥2,300 cũ** (cùng giao dịch PayPay đã chuyển — không cần chuyển lại tiền!)
   - **Lý do an toàn:** verify hash duplicate (Layer 3) check trên `payment_confirmations`. Vì đơn cũ
     KHÔNG được tạo → không có hash record → screenshot cũ pass duplicate check.
4. Submit → verify lần này phải PASS (Layer 7 đã fix)
5. Đơn được tạo, status = `customer_paid`, `ai_verify_passed = true`

**Thời gian dự kiến:** ~3 phút sau khi redeploy.

> ⚠ Nếu re-upload mà vẫn FAIL với lý do khác → Section B đọc log để xem layer nào còn vấn đề.

---

### Option 2 — Đơn vào DB nhưng `customer_paid = false` / status `pending`

**Trường hợp:** Có 1 row trong `orders` nhưng chưa xác nhận thanh toán (rất khó xảy ra với
`verify_then_create_order` flow vì nó chỉ tạo đơn KHI verify pass — nhưng có thể anh đã
checkout bằng flow cũ "báo TT thủ công").

**Cách phục hồi:**

1. Login `/thuythang` (admin panel)
2. Tab **Đơn hàng** → tìm đơn của `thanghoang1109@gmail.com`
3. Bấm vào đơn → đổi status thành `customer_paid` hoặc `confirmed` (tuỳ anh đã verify thủ công chưa)
4. (Optional) Note lại: "AI verify fail do Layer 7 regex bug — đã fix sau"

**Thời gian dự kiến:** ~2 phút.

---

### Option 3 — Có row `payment_confirmations` với `ai_match = false`

**Trường hợp:** Đơn vào DB + có record verify FAIL trong `payment_confirmations`. Cần override thủ công.

**Tính năng "manual approve" hiện chưa có sẵn** — Agent 2 đang build (theo plan). Tạm thời:

**Cách phục hồi tạm:**

1. Mở Supabase SQL editor
2. Update đơn về `customer_paid` (KHÔNG anh chạy lệnh này nếu chưa chắc — gọi em check trước):

   ```sql
   -- CHỈ CHẠY KHI ANH ĐÃ CONFIRM giao dịch PayPay là thật
   -- Em (Claude) sẽ review trước khi anh execute
   UPDATE orders
   SET status = 'customer_paid',
       ai_verify_passed = true,
       ai_detected_amount = 2300
   WHERE order_no = '<ORDER_NO_CỦA_ANH>'
     AND customer_email = 'thanghoang1109@gmail.com';
   ```

3. Hoặc đợi Agent 2 ship feature "manual approve override" rồi click trong UI cho gọn.

**Thời gian dự kiến:** ~5 phút (manual SQL) hoặc đợi feature (1 ngày).

---

## Helper: chạy `findRecentOrdersForEmail` từ Apps Script editor

Em đã thêm function `findRecentOrdersForEmail(email, hoursBack)` vào `google-apps-script.js`
để anh check nhanh từ editor mà không cần mở Supabase SQL.

### Cách dùng

1. https://script.google.com → project **Bep Thuy Japan** → file `google-apps-script.js`
2. Tìm function `findRecentOrdersForEmail` (Ctrl+F)
3. Cập nhật 2 dòng test ở dưới (em đã viết sẵn) hoặc gọi qua dropdown:
   - Chọn function `testFindMyTestOrder` từ dropdown
   - Bấm **Run**
4. Bấm **Executions** xem log → sẽ thấy danh sách đơn (nếu có)

---

## Tóm tắt 3 bước nhanh nhất

1. **Bước 0** — Redeploy Apps Script (5 phút)
2. **Section A.2** — Chạy SQL query xem có đơn không (1 phút)
3. **Section C** — Chọn option theo kết quả:
   - 0 rows → Option 1: re-checkout với bill cũ (~3 phút)
   - Có rows pending → Option 2: update status trong /thuythang (~2 phút)
   - Có rows + payment_confirmations fail → Option 3: SQL update có em review (~5 phút)

**Tổng thời gian dự kiến: 8–12 phút.**

---

*Tài liệu này em viết riêng cho tình huống ¥2,300 16:56 ngày 02/05/2026. Nếu sau này gặp case
tương tự, anh có thể tham khảo lại.*
