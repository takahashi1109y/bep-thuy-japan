# 🚀 BƯỚC 3: Redeploy Apps Script (5 phút)

> 🎯 **Mục đích**: Cập nhật code Web App của Apps Script lên version mới nhất chứa tất cả tính năng (Option B pay-first, 8-layer verify, 2-step verify, manual review, image fix).
> ⏱️ **Thời gian**: ~5 phút
> 🔥 **Mức độ**: BLOCKING — không redeploy → tất cả features mới KHÔNG hoạt động ở production.

---

## 🤔 Tại sao cần redeploy?

Apps Script Web App đang serve **OLD version** (cũ trước session 2026-04-30). Customer checkout sẽ hit code paths mới (Option B, verify_then_create_order, send_production_report...) nhưng Apps Script vẫn serve code cũ → **lỗi 404 / total invalid / không phản hồi**.

**~10 commit chưa deploy** (tích luỹ từ session V5 + V6):
- `510ffe1` — 2-step verify infrastructure + image display fix (LATEST)
- `3474484` — 10-agent hardening 8 layers + admin/customer UX
- `ca2b1f2` — Layer 6 picks transaction date, not expiry
- `762b7e1` — 5-agent parallel work (recovery + override + debug)
- `e866e77` — Layer 7 取引番号 + space-separated digits
- ... và các commit cũ hơn (Option B, 8-layer verify, deduct stock RPC, daily report email, auto-email TT/ship, campaign email)

---

## ✅ Trước khi bắt đầu

- [ ] Đã login Google account của anh (cùng account tạo Apps Script)
- [ ] Browser hiện đang mở (Chrome khuyến nghị)
- [ ] Đã có URL Apps Script project (em sẽ chỉ dưới)

---

## 📋 2 CÁCH LẤY CODE (chọn 1)

### 🅰️ Cách A — Copy từ GitHub raw URL (KHUYẾN NGHỊ)

URL này LUÔN trỏ tới version mới nhất trên main:

**https://raw.githubusercontent.com/takahashi1109y/bep-thuy-japan/main/google-apps-script.js**

Ưu điểm:
- Luôn nhất quán với GitHub (commit `510ffe1` mới nhất)
- Không lo file local đã bị edit lung tung
- Browser tự render plain text → Ctrl+A → Ctrl+C nhanh

### 🅱️ Cách B — Copy từ file local

Đường dẫn: **`K:\bep-thuy-japan\google-apps-script.js`**

Mở bằng Notepad / VS Code → Ctrl+A → Ctrl+C.

> ⚠️ Nếu anh đã edit file local mà chưa commit, code sẽ khác GitHub. Khuyến nghị Cách A cho an toàn.

---

## 🔵 Bước 3.1 — Mở Apps Script editor

1. Browser → vào **https://script.google.com**
2. Login Google account nếu chưa
3. Trang Apps Script chính hiện ra → tìm project tên **"Bep Thuy Japan"** (hoặc tên anh đặt)
4. Click vào project

**Anh sẽ thấy**: editor Apps Script với:
- Sidebar trái: list file (có file `Mã.gs` hoặc `Code.gs`)
- Editor chính ở giữa hiển thị code
- Toolbar trên có nút **Deploy** (góc trên phải)

---

## 🔵 Bước 3.2 — Mở file `Mã.gs`

1. Sidebar trái → click vào file **`Mã.gs`** (hoặc `Code.gs`)
2. Editor chính hiển thị code hiện tại

**Anh sẽ thấy**: hàng nghìn dòng code JavaScript, bắt đầu bằng `function doPost(e) { ... }` hoặc constants `const SHEET_ID = ...`

---

## 🔵 Bước 3.3 — Xoá toàn bộ code cũ

1. Click vào editor chính (con trỏ vào code)
2. **Ctrl+A** → highlight toàn bộ (text chuyển xanh)
3. **Delete** (hoặc Backspace)

**Anh sẽ thấy**: editor trống tinh.

> 😱 **Đừng panic** — code chưa mất, chỉ là local edit. Chưa save thì có thể Ctrl+Z hồi lại. Sau khi paste + save thì version cũ vẫn còn ở "Version history".

---

## 🔵 Bước 3.4 — Lấy code mới (chọn 1 cách)

### 🅰️ Nếu dùng Cách A (GitHub raw)
1. Mở tab mới browser
2. Vào URL: **https://raw.githubusercontent.com/takahashi1109y/bep-thuy-japan/main/google-apps-script.js**
3. **Anh sẽ thấy**: trang plain text với hàng nghìn dòng code (không có format đẹp, chỉ text thô)
4. Click vào trang → **Ctrl+A** → **Ctrl+C**

### 🅱️ Nếu dùng Cách B (file local)
1. File Explorer → vào `K:\bep-thuy-japan\`
2. Tìm `google-apps-script.js`
3. Click chuột phải → Open with → **Notepad** (hoặc VS Code)
4. **Ctrl+A** → **Ctrl+C**

---

## 🔵 Bước 3.5 — Paste vào Apps Script editor

1. Quay lại tab Apps Script (Alt+Tab)
2. Click vào editor chính trống
3. **Ctrl+V** → paste

**Anh sẽ thấy**: code mới hiện ra, scroll xuống thấy ~3500 dòng. File đầu có header comment `/** Bep Thuy Japan - Apps Script... */` hoặc `// === CONFIGURATION ===`.

---

## 🔵 Bước 3.6 — Lưu (Save)

1. **Ctrl+S** (hoặc click icon đĩa mềm 💾 trên toolbar)

**Anh sẽ thấy**: thông báo "Project saved" hoặc icon đĩa mềm chuyển màu (sáng → mờ).

> ⚠️ **CHƯA XONG** — Save chỉ lưu code, chưa deploy. Web App vẫn serve OLD version đến khi anh làm bước Deploy bên dưới.

---

## 🔵 Bước 3.7 — Mở "Manage deployments"

1. Góc trên phải → click nút **Deploy** (màu xanh)
2. Menu xổ xuống → chọn **"Manage deployments"**

**Anh sẽ thấy**: modal "Deployments" hiện danh sách deployments hiện tại. Sẽ có 1 (hoặc nhiều) row với type **"Web app"**.

---

## 🔵 Bước 3.8 — Edit deployment hiện tại

1. Tìm row Web app đang active (có URL `https://script.google.com/macros/s/.../exec`)
2. Bên phải row có icon **bút chì ✏️** (Edit)
3. Click vào ✏️

**Anh sẽ thấy**: modal "Edit deployment" với:
- Field **Version**: dropdown đang select "Version XX"
- Field **Description**: trống hoặc có text cũ
- Nút **Deploy** ở dưới

---

## 🔵 Bước 3.9 — Tạo version mới

1. Trong field **Version** → click dropdown
2. Trên cùng dropdown có option **"New version"** (hoặc icon ➕)
3. Click **"New version"**

**Anh sẽ thấy**: dropdown chuyển sang chế độ tạo version mới. Có ô input **"Description"** (optional).

---

## 🔵 Bước 3.10 — (Optional) Ghi description

Nếu anh muốn track version, gõ vào Description:
```
510ffe1: Option B + 2-step verify + image fix (2026-05-02)
```
Không gõ cũng OK.

---

## 🔵 Bước 3.11 — Click Deploy

1. Cuối modal có nút **Deploy** (màu xanh)
2. Click

**Anh sẽ thấy**: loading "Deploying..." vài giây → success message:
- "Deployment updated"
- Hiện lại URL Web app

---

## 🔵 Bước 3.12 — Verify deploy thành công

### Cách A — Check trong Apps Script
- Modal Deployments hiện row đã update với "Last deployed: just now"
- Version number tăng (vd: từ Version 14 → Version 15)

### Cách B — Test trực tiếp
1. Đóng modal
2. Mở tab mới → vào URL Web app: `https://script.google.com/macros/s/.../exec`
3. **Anh sẽ thấy**: trang trắng với text JSON `{"error":"Invalid request"}` hoặc tương tự (đó là OK — POST handler không có GET)

### Cách C — Test qua thuyjapan.com
1. Vào https://www.thuyjapan.com
2. Thêm 1 SP vào giỏ → checkout
3. Upload biên lai test
4. Nếu AI verify chạy + status đổi → deploy thành công ✅

---

## 🆘 Troubleshooting

| Vấn đề | Fix |
|---|---|
| Không tìm thấy project Bep Thuy Japan | Login đúng account tạo project (email anh dùng cho Google Sheet) |
| File `Mã.gs` không có | File có thể tên `Code.gs` — cùng nội dung, làm tương tự |
| Paste code vào → không hiện gì | Code quá lớn, đợi 5-10 giây cho editor render |
| Click Deploy báo lỗi quota | Apps Script có quota daily, đợi 24h hoặc dùng tài khoản khác |
| URL Web app trả lỗi 500 | Code có syntax error → click Apps Script → tab "Executions" → xem error log |
| Deploy xong mà thuyjapan.com vẫn lỗi cũ | Hard refresh Ctrl+Shift+R, clear cache |
| Lỡ paste code SAI và Save | Apps Script có "Version history" — Click File → Version history → restore version cũ |

---

## ⏭️ Sau khi xong BƯỚC 3 (Redeploy)

→ Sang **BƯỚC 4 (Test E2E)**: xem `HUONG-DAN-BUOC-4-TEST-E2E.md`
→ Test 6 cases để verify mọi feature hoạt động

Hoặc báo em **"xong redeploy"** → em surface bước test.

---

## 📌 Tổng kết roadmap

```
✅ BƯỚC 1: Storage public         (1 phút)
✅ BƯỚC 2: SQL 2-step verify     (3 phút)
✅ BƯỚC 3: SQL manual approve    (3 phút)
🔥 BƯỚC NÀY: Redeploy Apps Script (5 phút)  ← anh đang ở đây
🧪 BƯỚC CUỐI: Test 6 cases E2E   (15 phút)
```

> 💡 **Tip**: Sau khi redeploy, BẤT KỲ thay đổi code Apps Script nào trong tương lai cũng phải lặp lại Bước 3.7-3.11 (New version → Deploy). Save (Ctrl+S) thôi không đủ.
