# REDEPLOY APPS SCRIPT NGAY BÂY GIỜ — Hướng Dẫn Click-by-Click

**Ngày**: 2026-05-02
**Khẩn cấp**: CAO — anh đã ship hôm nay nhưng `saveYamato` đang bị lỗi
**Thời gian cần**: 5–7 phút
**Người làm**: Anh Thắng (em đứng ngoài hỗ trợ)

---

## 1. TẠI SAO PHẢI REDEPLOY NGAY?

Code trên GitHub đã được sửa rồi, nhưng **Apps Script vẫn đang chạy code CŨ** (bị lỗi). Anh phải copy code mới lên Apps Script và bấm Deploy thì các tính năng dưới đây mới hoạt động:

- **saveYamato bug fix** (CRITICAL — vừa push xong) — đơn hàng mới sẽ tự động đẩy sang sheet Yamato
- **backfillYamatoOrders()** — anh sẽ chạy được hàm này để bù các đơn cũ bị thiếu trên sheet Yamato
- **Option B: verify_then_create_order endpoint** — flow xác minh trước khi tạo đơn
- **8-layer AI fraud verify** — chống đơn ảo / spam
- **send_production_report endpoint** — báo cáo sản xuất
- **admin_update_order_address RPC** — sửa địa chỉ đơn từ admin
- **Reports paid-only filter** — báo cáo chỉ tính đơn đã thanh toán
- **validatePayload_ ADMIN_TYPES expansion** — admin nhiều loại request hơn

**Quan trọng**: Nếu anh KHÔNG redeploy, đơn hàng mới hôm nay vẫn KHÔNG đẩy sang Yamato. Anh phải làm ngay.

---

## 2. CÁC BƯỚC REDEPLOY (CLICK-BY-CLICK)

### Bước 1: Mở Apps Script editor

1. Mở Chrome (hoặc trình duyệt anh hay dùng).
2. Gõ vào thanh địa chỉ: **`https://script.google.com`** rồi bấm **Enter**.
3. Đăng nhập bằng tài khoản Google của anh (nếu chưa đăng nhập).
4. Anh sẽ thấy một trang danh sách các project Apps Script.
5. Tìm project tên **"Bep Thuy Japan"** trong danh sách → **click vào tên project**.

**Anh sẽ thấy**: Trang editor mở ra, bên trái có cây file (sidebar), ở giữa là vùng code màu trắng/xám.

📸 *Nếu anh không thấy project "Bep Thuy Japan" trong danh sách, scroll xuống hoặc dùng ô search ở trên cùng. Nếu vẫn không thấy, chụp ảnh màn hình gửi em.*

---

### Bước 2: Mở file `Mã.gs`

1. Nhìn sang **bên trái** màn hình, anh sẽ thấy mục **"Files"** (hoặc "Tệp").
2. Trong đó có một file tên là **`Mã.gs`** (có thể có thêm dấu `< >` ở đầu).
3. **Click một lần** vào tên file `Mã.gs`.

**Anh sẽ thấy**: Vùng code ở giữa màn hình hiển thị code JavaScript hiện tại (code CŨ, có lỗi). Phía trên cùng có dòng số (1, 2, 3, …).

📸 *Nếu anh thấy nhiều file khác như `appsscript.json`, kệ chúng. Chỉ click vào `Mã.gs` thôi.*

---

### Bước 3: Xóa toàn bộ code cũ

1. **Click chuột vào vùng code** (bất kỳ chỗ nào trong vùng code màu trắng).
2. Bấm tổ hợp phím **`Ctrl`** + **`A`** (giữ Ctrl, sau đó bấm A) → toàn bộ code sẽ được bôi xanh (chọn hết).
3. Bấm phím **`Delete`** (hoặc **`Backspace`**) → toàn bộ code biến mất.

**Anh sẽ thấy**: Vùng code TRỐNG TRƠN, chỉ còn dòng số 1.

📸 *Nếu anh lỡ tay không bấm Ctrl+A đầy đủ, bấm `Ctrl+Z` để hoàn tác và làm lại.*

⚠️ **Đừng hoảng** — code cũ đã được lưu trên GitHub rồi, anh không mất gì cả.

---

### Bước 4: Mở tab mới để lấy code mới từ GitHub

1. Bấm **`Ctrl`** + **`T`** để mở tab Chrome mới (KHÔNG đóng tab Apps Script — phải giữ nguyên).
2. Gõ vào thanh địa chỉ tab mới:

   **`https://raw.githubusercontent.com/takahashi1109y/bep-thuy-japan/main/google-apps-script.js`**

3. Bấm **`Enter`**.

**Anh sẽ thấy**: Một trang trắng đầy text code JavaScript (bắt đầu bằng `/**` hoặc `function doPost(e)` hoặc tương tự). KHÔNG có giao diện đẹp, chỉ là code thô.

📸 *Nếu anh thấy trang 404 "Not Found", có thể URL gõ sai. Copy lại URL trên rồi paste vào.*

---

### Bước 5: Copy toàn bộ code mới

1. Click chuột vào **bất kỳ chỗ nào trong vùng code** trên trang GitHub raw.
2. Bấm **`Ctrl`** + **`A`** → toàn bộ code được bôi xanh.
3. Bấm **`Ctrl`** + **`C`** → code đã được copy vào clipboard.

**Anh sẽ thấy**: Code vẫn được bôi xanh (không có thông báo gì cả, nhưng đã copy thành công).

📸 *Test thử: bấm Ctrl+V vào ô search Google → nếu hiện ra code thì copy thành công.*

---

### Bước 6: Quay lại tab Apps Script và paste code mới

1. Bấm **`Ctrl`** + **`Tab`** (hoặc click vào tab Apps Script ở trên cùng) để quay lại tab Apps Script editor.
2. **Click chuột vào vùng code TRỐNG** (chỗ hiện tại đang trống sau khi xóa ở Bước 3).
3. Bấm **`Ctrl`** + **`V`** → code mới sẽ được paste vào.

**Anh sẽ thấy**: Vùng code đầy code mới, hàng nghìn dòng. Ở góc dưới bên phải có thể hiện chữ "Saving..." hoặc "Unsaved changes".

📸 *Nếu code paste vào trông kỳ lạ (chỉ một dòng dài), bấm Ctrl+Z và làm lại Bước 5 + 6.*

---

### Bước 7: Lưu file

1. Bấm **`Ctrl`** + **`S`** → Apps Script sẽ lưu file.

**Anh sẽ thấy**: Phía trên có thông báo nhỏ "Saved" (hoặc "Đã lưu"). Tên file `Mã.gs` không còn dấu chấm vàng/đỏ nữa.

📸 *Nếu hiện lỗi đỏ "Syntax error" — STOP, chụp ảnh gửi em ngay. Đừng tiếp tục.*

---

### Bước 8: Mở menu Deploy

1. Nhìn **góc trên bên phải** màn hình, tìm nút **`Deploy`** (màu xanh dương, có icon mũi tên lên).
2. **Click vào nút `Deploy`** → menu xổ xuống.
3. Trong menu, click vào **`Manage deployments`** (Quản lý triển khai).

**Anh sẽ thấy**: Một popup mở ra, ở giữa màn hình. Trong popup hiện ra **deployment hiện tại** (có URL Web App, ngày tạo, version number).

📸 *Nếu popup không hiện ra, đóng và bấm lại Deploy → Manage deployments.*

---

### Bước 9: Chọn deployment để cập nhật

1. Trong popup **Manage deployments**, anh sẽ thấy **một deployment có icon Web App** (hình quả địa cầu).
2. Hover chuột vào deployment đó → bên phải sẽ hiện ra **icon hình bút chì ✏️** (Edit).
3. **Click vào icon ✏️** đó.

**Anh sẽ thấy**: Form cập nhật deployment hiện ra, có các ô:
- **Version**: dropdown (mặc định đang chọn version hiện tại, ví dụ "Version 12")
- **Description**: ô text
- **Execute as**: ai chạy script (mặc định là anh)
- **Who has access**: ai dùng được (mặc định là Anyone)

📸 *Nếu KHÔNG thấy icon bút chì, hover lại và đợi 1 giây.*

---

### Bước 10: Tạo version MỚI

1. Trong form Edit deployment, click vào **dropdown "Version"**.
2. Trong dropdown, chọn **`New version`** (Phiên bản mới — thường ở trên cùng).

**Anh sẽ thấy**: Dropdown đóng lại, ô Version giờ ghi "New version", và xuất hiện ô **Description** mới (trống).

3. (Tuỳ chọn) Trong ô **Description**, gõ: `saveYamato fix + backfill 2026-05-02`. Bước này không bắt buộc, chỉ để anh sau này nhớ là deploy gì.

📸 *Quan trọng: PHẢI chọn "New version", KHÔNG chọn version cũ. Nếu chọn version cũ, code mới sẽ KHÔNG được áp dụng.*

---

### Bước 11: Bấm Deploy

1. Ở **dưới cùng** form, bấm nút **`Deploy`** (màu xanh dương).
2. Đợi 5–15 giây — Apps Script đang publish phiên bản mới.

**Anh sẽ thấy**:
- Loading spinner xuất hiện một lúc.
- Sau đó hiện thông báo **"Deployment successfully updated"** (Đã cập nhật triển khai thành công).
- Bên dưới hiện ra **Web App URL** (giữ nguyên URL cũ, KHÔNG đổi).

3. Bấm nút **`Done`** (Xong) ở dưới cùng để đóng popup.

📸 *Nếu hiện lỗi đỏ "Deployment failed" — chụp ảnh gửi em ngay.*

---

## 3. KIỂM TRA SAU KHI DEPLOY (4 BƯỚC)

### Test 1: Web App URL còn sống

1. Mở tab Chrome mới (Ctrl+T).
2. Copy Web App URL của anh (URL kết thúc bằng `/exec`). Anh có thể tìm URL này trong:
   - Apps Script → Deploy → Manage deployments → copy "Web app" URL.
3. Paste vào thanh địa chỉ Chrome → Enter.

**Kết quả mong đợi**: Trang web hiện ra dòng JSON:

```json
{"status":"Bep Thuy Japan API OK"}
```

📸 *Nếu hiện lỗi "Sorry, unable to open the file" hoặc "Authorization required" — có thể quyền access bị lỗi. Xem mục 4 (Recovery) bên dưới.*

---

### Test 2: Chạy thử hàm testBackfillDryRun()

(Hàm này sẽ được agent song song thêm vào code — nếu chưa có, bỏ qua test này và làm Test 3 + 4 trước.)

1. Trong Apps Script editor, nhìn lên **thanh trên cùng**, tìm **dropdown chọn function** (bên cạnh nút Run, Debug).
2. Click vào dropdown → tìm và chọn **`testBackfillDryRun`**.
3. Bấm nút **`Run`** (icon ▶️).
4. Lần đầu chạy có thể hỏi quyền — bấm **`Review permissions`** → chọn tài khoản → **`Advanced`** → **`Go to Bep Thuy Japan (unsafe)`** → **`Allow`**.
5. Đợi hàm chạy xong (có thể 5–30 giây).

**Kết quả mong đợi**: Phía dưới editor xuất hiện **Execution log** với các dòng log như "Found N orders, would push to Yamato sheet" (không có lỗi đỏ).

📸 *Nếu function `testBackfillDryRun` không có trong dropdown — agent kia chưa thêm hàm. Bỏ qua test này.*

---

### Test 3: Kiểm tra Executions log

1. Trong Apps Script editor, nhìn **bên trái sidebar**, click vào icon **đồng hồ ⏰** (Executions).
2. Anh sẽ thấy danh sách lần chạy gần nhất (mỗi dòng có function name, thời gian, status).
3. Tìm dòng `doPost` mới nhất.

**Kết quả mong đợi**:
- Status là **`Completed`** (màu xanh) — KHÔNG phải `Failed` (màu đỏ).
- Click vào dòng đó để xem log chi tiết → KHÔNG có dòng lỗi đỏ "Error" hoặc "Exception".

📸 *Nếu Status là Failed màu đỏ, click vào để xem log → chụp ảnh dòng lỗi gửi em.*

---

### Test 4: Đặt đơn test trên thuyjapan.com

1. Mở tab mới → vào **`https://thuyjapan.com`**.
2. Đặt một đơn TEST nhỏ (ví dụ: 1 sản phẩm rẻ nhất, dùng tên "TEST 2026-05-02", địa chỉ giả nếu được).
3. Hoàn tất đặt đơn (có thể bỏ qua bước thanh toán nếu được, hoặc thanh toán xong).
4. Đợi **30–60 giây**.
5. Mở **Google Sheet Yamato** của anh (sheet mà em đã setup để chứa data Yamato).
6. Scroll xuống dòng cuối cùng.

**Kết quả mong đợi**: Dòng cuối cùng có đơn test vừa đặt (tên TEST 2026-05-02, ngày hôm nay).

📸 *Nếu KHÔNG thấy đơn test trong sheet Yamato sau 2 phút — saveYamato vẫn bị lỗi. Quay lại Test 3 (Executions log) để xem có error gì.*

---

## 4. NẾU CÓ LỖI — KHÔI PHỤC VỀ DEPLOYMENT CŨ

Nếu sau khi deploy mà mọi thứ HỎNG (web app không load, đơn không vào sheet, etc.), anh có thể quay về deployment CŨ để tạm thời cứu vãn:

### Cách revert:

1. Vào Apps Script editor → **`Deploy`** → **`Manage deployments`**.
2. Trong popup, click vào **icon ✏️ (Edit)** của deployment Web App.
3. Click dropdown **`Version`**.
4. Trong dropdown, anh sẽ thấy danh sách **các version cũ** (Version 1, Version 2, …, đến version trước version mới nhất).
5. Chọn **version cũ ngay trước version vừa deploy** (ví dụ: nếu version mới là 13, chọn Version 12).
6. Bấm **`Deploy`** → đợi thông báo "Deployment successfully updated".

**Anh sẽ có lại**: Web app chạy code CŨ, hoạt động như trước khi deploy hôm nay.

⚠️ **Sau khi revert**, đơn hàng vẫn KHÔNG đẩy sang Yamato (vì code cũ có bug). Anh cần báo em ngay để fix tiếp.

📸 *Chụp ảnh popup Manage deployments + Executions log + bất kỳ lỗi nào → gửi em ngay.*

---

## 5. SAU KHI DEPLOY THÀNH CÔNG — BƯỚC TIẾP THEO

Khi cả 4 test trên đều PASS (Web App OK, Executions không lỗi, đơn test vào sheet Yamato), anh làm tiếp:

### Bước 5.1: Chạy backfillYamatoOrders() để bù đơn cũ

(Hàm này được agent song song thêm vào code mới — nếu code mới chưa có, đợi em báo.)

1. Trong Apps Script editor → dropdown chọn function ở thanh trên.
2. Tìm và chọn **`backfillYamatoOrders`**.
3. Bấm **`Run`** (▶️).
4. Đợi hàm chạy — có thể mất **2–10 phút** tùy số đơn cũ cần bù.

**Anh sẽ thấy**: Execution log hiện ra các dòng "Pushed order #abc123 to Yamato sheet", "Pushed order #def456…". Khi xong, hiện "Backfill complete: pushed N orders".

5. Mở Google Sheet Yamato → kiểm tra các đơn cũ đã được thêm vào.

📸 *Nếu hàm chạy quá lâu (>10 phút) hoặc báo "Exceeded maximum execution time" — chụp ảnh gửi em, em sẽ chia nhỏ batch.*

---

### Bước 5.2: Báo em xác nhận

Sau khi xong hết, anh nhắn em:

> "Em ơi anh deploy xong rồi, test 4 cái ổn, backfill chạy được X đơn, sheet Yamato đã đầy đủ."

Em sẽ check lại lần cuối và đánh dấu task này HOÀN THÀNH trong pending list.

---

## 6. TÓM TẮT NHANH (CHEAT SHEET)

| Bước | Action | Phím tắt |
|------|--------|----------|
| 1 | Mở script.google.com → "Bep Thuy Japan" | — |
| 2 | Click file `Mã.gs` | — |
| 3 | Chọn hết và xóa | `Ctrl+A` → `Delete` |
| 4 | Mở tab mới → URL raw GitHub | `Ctrl+T` |
| 5 | Copy code | `Ctrl+A` → `Ctrl+C` |
| 6 | Về tab Apps Script → paste | `Ctrl+V` |
| 7 | Save | `Ctrl+S` |
| 8 | Deploy → Manage deployments | — |
| 9 | Click ✏️ (Edit) | — |
| 10 | Version → New version | — |
| 11 | Bấm Deploy → Done | — |

**4 Test sau deploy**:
1. Web App URL trả `{"status":"Bep Thuy Japan API OK"}`
2. Chạy `testBackfillDryRun()` không lỗi
3. Executions log không có Failed
4. Đặt đơn test → vào sheet Yamato trong 30–60s

**Sau cùng**: Chạy `backfillYamatoOrders()` để bù đơn cũ.

---

**Em đứng ngoài hỗ trợ realtime. Anh làm xong từng bước thì nhắn em "xong bước X" để em check tiếp. Có lỗi → chụp ảnh gửi ngay, đừng tự đoán.**

**GO! 🚀**
