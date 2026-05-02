# Hướng dẫn Debug AI Verify cho anh Thắng

> Tài liệu này em viết để anh tự debug khi đơn AI verify reject mà anh nghĩ bill là thật. Em hướng dẫn từ cách nhanh (1 phút) đến cách chi tiết (5 phút) — anh chọn theo tình huống.

---

## 1. Khi nào dùng tài liệu này

Anh dùng khi gặp tình huống sau:

- Khách up bill → AI verify chạy → **reject đơn**
- Anh nhìn bill → cảm thấy **bill thật**, khách không có dấu hiệu lừa đảo
- Anh muốn biết **tại sao AI reject** để:
  - Phê duyệt thủ công đơn (cho khách qua)
  - Hoặc fix bug trong code verify (nếu là false negative)
  - Hoặc nhắn khách up lại bill chuẩn hơn (nếu bill mờ/thiếu thông tin)

**Không dùng** khi:
- Bill rõ ràng fake (Photoshop, số tiền sai, recipient sai) → anh **reject thẳng**, không cần debug
- Đơn đã pass → không cần debug

---

## 2. Ba cách debug (theo độ chi tiết)

### Cách 1 — Manual override (1 phút)

**Khi nào dùng**: Anh đã tin tưởng khách, chỉ muốn cho đơn pass nhanh, không cần biết layer nào fail.

**Các bước**:
1. Vào trang `/thuythang` (admin dashboard)
2. Tìm đơn cần phê duyệt → click vào đơn
3. Click nút **"🛡️ Phê duyệt thủ công"**
4. Đơn chuyển status sang `PAID` → khách nhận được email confirm

**Ưu**: Nhanh nhất, không cần debug.
**Nhược**: Anh không biết layer nào fail → nếu là bug trong code, em không biết để fix.

---

### Cách 2 — Verify dry run UI (3 phút)

**Khi nào dùng**: Anh muốn biết **layer nào fail** mà không cần đọc Apps Script Logs.

**Các bước**:
1. Vào `/thuythang` → tab **"🧪 Test Bill"**
2. **Paste image URL** của bill (anh có thể lấy từ đơn của khách trong dashboard, hoặc upload bill lên Google Drive lấy URL)
3. **Nhập amount** (số tiền đơn hàng — phải khớp với bill)
4. Click nút **"Test"**
5. Đợi vài giây → UI hiện kết quả của **8 layers**

**Kết quả hiển thị**:
- Mỗi layer có icon: ✅ pass / ❌ fail / ⚠️ warning
- Layer fail sẽ có **lý do cụ thể** (ví dụ: "Layer 1 fail: amount mismatch — bill có 5000, đơn cần 5,000")

**Ưu**: Anh debug được mà không cần code, ngồi điện thoại cũng được.
**Nhược**: Một số bug sâu cần xem Logs trong Apps Script editor.

---

### Cách 3 — Apps Script editor (5 phút)

**Khi nào dùng**: Cách 2 không đủ chi tiết, anh cần xem **raw OCR text** mà Vertex AI trả về để hiểu tại sao AI parse sai.

**Các bước**:
1. Mở Google Apps Script editor (script gắn với Sheet `bep-thuy-japan-orders`)
2. Vào file chứa hàm `testVerifyBillDebug` (em đã viết sẵn)
3. Trong panel bên trái → chọn function `testVerifyBillDebug`
4. **Sửa 2 tham số** ở đầu hàm:
   ```js
   const url = 'PASTE_BILL_IMAGE_URL_HERE';
   const amount = 5000; // số tiền đơn cần verify
   ```
5. Click **Run** (icon ▶️)
6. Apps Script chạy → mở **View → Executions** hoặc **Logs**
7. Đọc output chi tiết của 8 layers + raw OCR text từ Vertex AI

**Ưu**: Chi tiết nhất, thấy được cả raw text mà OCR đọc được từ bill.
**Nhược**: Cần mở Apps Script editor (web), khó dùng trên điện thoại.

---

## 3. Hiểu 8 layers verify

Bảng dưới giải thích từng layer + lý do thường fail:

| Layer | Tên | Kiểm tra gì | Lý do thường fail |
|-------|-----|-------------|-------------------|
| **1** | **Amount** | Bill có số tiền đúng với đơn hàng? | Bill ghi `5,000` nhưng OCR đọc thành `5.000` hoặc `5000`. Full-width digits (`５０００`) cũng gây fail. Có dấu space trong số. |
| **2** | **Recipient** | Bill có ghi tên người nhận là **"Thanghoang"**? | OCR đọc sai tên (`Thang hoang`, `Thanghonag`). Bill mờ ở chỗ tên. |
| **3** | **Duplicate** | Bill này đã được dùng cho đơn khác chưa? | Khách up nhầm bill cũ. Hoặc khách thử gian lận dùng 1 bill cho nhiều đơn. |
| **4** | **Source** | Bill từ **PayPay hoặc ngân hàng hợp lệ**? | Bill không có logo PayPay/bank. Hoặc bill từ app lạ AI chưa biết. |
| **5** | **Completion** | Bill có chữ **"完了" / "送りました"** (= giao dịch thành công)? | Bill đang ở trạng thái pending/đang xử lý, chưa hoàn tất. |
| **6** | **Date** | Ngày giao dịch trên bill **≤ 72 giờ** so với lúc verify? | Bill cũ quá 72h. **Hoặc** AI nhầm ngày `有効期限` (hạn sử dụng) thành ngày giao dịch. |
| **7** | **Transaction ID** | Bill có **取引番号 / 受付番号**? | PayPay 2026 đổi format từ `取引ID` sang `取引番号` → AI không nhận ra. |
| **8** | **Editor** | Bill có dấu hiệu **bị Photoshop**? | False positive: bill thật bị nén/resize → AI nhầm là edited. |

---

## 4. Common false-negative patterns (đã/đang fix)

Đây là những bug em đã gặp — anh cần biết để khỏi mất công debug lại:

### Layer 7 — `取引番号` (PayPay 2026 format) — ĐÃ FIX
- **Triệu chứng**: Bill PayPay mới (sau 2026) reject vì Layer 7 không tìm được transaction ID.
- **Nguyên nhân**: PayPay đổi label từ `取引ID` → `取引番号`. Code cũ chỉ check `取引ID`.
- **Fix**: Em đã update regex để chấp nhận cả 2 format.

### Layer 6 — `有効期限` future date — ĐÃ FIX
- **Triệu chứng**: Bill có ghi `有効期限: 2026-12-31` (hạn sử dụng) → AI dùng date này tính tuổi bill → bill "future" → fail.
- **Nguyên nhân**: AI không phân biệt `取引日時` (ngày giao dịch) với `有効期限` (hạn sử dụng).
- **Fix**: Em đã update parser để chỉ lấy ngày từ field `取引日時` / `送金日`.

### Layer 1 — Full-width digits, space — ĐANG FIX
- **Triệu chứng**: Bill ghi `５，０００円` (full-width Nhật) hoặc `5 000円` (có space) → Layer 1 fail.
- **Nguyên nhân**: Code chỉ normalize half-width, chưa xử lý full-width và space.
- **Trạng thái**: Em đang viết fix, sẽ update sau.

> Nếu anh gặp pattern nào KHÁC ngoài 3 cái trên → **báo em ngay**, em fix.

---

## 5. Khi nào KHÔNG nên phê duyệt thủ công

Anh **TUYỆT ĐỐI KHÔNG** phê duyệt thủ công nếu bill có dấu hiệu fraud sau:

- ❌ **Bill bị Photoshop**: pixel jagged, font lệch, vùng số tiền có vệt edit rõ ràng.
- ❌ **Số tiền sai rõ ràng**: đơn `5,000円` nhưng bill ghi `500円` hoặc `50円`.
- ❌ **Recipient sai**: bill ghi tên ngân hàng khác hoặc người nhận không phải `Thanghoang`.
- ❌ **Bill quá cũ**: ngày giao dịch > 7 ngày trước (khách giữ bill cũ định gian lận).
- ❌ **Bill duplicate**: Layer 3 fail → bill này đã dùng cho đơn khác → 99% là khách thử gian lận.

→ Trong các trường hợp trên: **reject đơn**, message khách hỏi rõ trước khi cho qua.

---

## 6. Workflow cho admin (theo đúng thứ tự)

Em recommend anh làm theo thứ tự này để **đỡ nhầm + đỡ tốn thời gian**:

### Bước 1 — Visual check bill (30 giây)
- Mở bill, nhìn nhanh: số tiền đúng? Tên `Thanghoang` có? Bill có vẻ thật không?
- **Nếu visual fail** → reject thẳng, không cần debug.
- **Nếu visual OK** → sang Bước 2.

### Bước 2 — Verify dry run (3 phút)
- Mở `/thuythang` tab **"🧪 Test Bill"**
- Paste URL + amount → Test
- Xem layer nào fail.
- **Nếu fail layer 3 (Duplicate) hoặc layer 8 (Editor)** → suspicious, sang Bước 4.
- **Nếu fail layer 1/6/7 (common false negatives)** → khả năng cao là bug, sang Bước 3.

### Bước 3 — Manual override (1 phút)
- Đã chắc là false negative → click **"🛡️ Phê duyệt thủ công"**.
- Đơn pass → khách nhận email.
- **Báo em** layer nào fail để em fix code (nếu là bug mới).

### Bước 4 — Reject + message khách (2 phút)
- Bill thật là fraud → reject đơn.
- Message khách: lịch sự hỏi rõ. Ví dụ:
  > "Em chào anh/chị, em xem lại bill thấy số tiền chưa khớp với đơn. Anh/chị check lại giúp em ạ. Nếu có nhầm lẫn thì gửi lại bill mới giúp em nhé."

---

## Tóm tắt nhanh (cho anh nhớ)

| Tình huống | Hành động |
|------------|-----------|
| Bill thật, anh tin khách | **Cách 1** — Manual override |
| Muốn biết layer nào fail | **Cách 2** — Verify dry run UI |
| Bug sâu, cần raw OCR | **Cách 3** — Apps Script editor |
| Bill có dấu hiệu fraud | **Reject + message khách** |
| Layer 1/6/7 fail mà bill thật | False negative — báo em fix |

---

> **File này em viết ngày 2026-05-02.** Nếu sau này có thêm layer mới hoặc đổi format, em sẽ update tài liệu này. Anh có gì không hiểu cứ hỏi em nhé.
