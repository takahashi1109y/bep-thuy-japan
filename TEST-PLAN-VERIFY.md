# TEST PLAN — 8-Layer AI Verify Pipeline

**System under test**: `verifyReceiptStandalone_` in `K:\bep-thuy-japan\google-apps-script.js` (line 831)
**Debug entry point**: `testVerifyBillDebug(imageUrl, expectedAmount)` (line 1010)
**Last updated**: 2026-05-02
**Owner**: anh Thắng (Bếp Thuỷ Japan)

---

## 0. Why this plan exists

Anh đã liên tiếp hit false negatives trong production:
- **Layer 7** rejected legit PayPay bills because regex chỉ tìm `取引ID` mà PayPay UI thực tế ghi `取引番号` (or split with spaces).
- **Layer 6** rejected legit PayPay bills because picker chọn `有効期限` (expiry, future date) thay vì `送信日` (transaction date).

Mỗi lần fix code mà không có test plan → khả năng tái phát bug rất cao. Document này:
1. Định nghĩa fixed test set với expected outcome.
2. Cho phép anh chạy 1 layer regression sweep < 5 phút trước mỗi redeploy.
3. Liệt kê past bugs để KHÔNG bao giờ reintroduce.

---

## 1. How to run tests (manual procedure)

### 1.1 Pre-requisites (one-time setup)
- Apps Script editor mở dự án `bep-thuy-japan` (script ID anh đã bookmark).
- Script Properties đã set: `GOOGLE_VISION_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
- Sample bills upload sẵn lên Supabase Storage public bucket (xem mục 5 — Fixture URLs).

### 1.2 Run a single test case
1. Mở Apps Script editor → file `google-apps-script.js`.
2. Cuộn xuống function `testVerifyDebugRunner` (~line 1336).
3. Edit hai biến này:
   ```js
   var imageUrl       = 'https://...supabase.co/storage/v1/object/public/test-fixtures/TC01-paypay-clean.jpg';
   var expectedAmount = 2300;
   ```
4. Save (Ctrl+S) → chọn function `testVerifyDebugRunner` ở dropdown trên cùng → click Run (▶).
5. Mở **View → Executions** → click execution mới nhất → đọc Logger output.

Mỗi test in ra:
- `── Layer N: <name> ──` block cho từng layer.
- `RESULT : ✓ PASS` hoặc `✗ FAIL` plus reason.
- `FINAL: ✓ MATCH` (8/8 pass) hoặc `summary.failed_layer = 'L<n>_<name>'`.

### 1.3 Re-test a past production failure
Nếu một bill thật fail trong production và đã lưu vào `payment_confirmations`:
1. Lấy `id` của row (từ Supabase dashboard hoặc URL email confirmation).
2. Trong `testVerifyDebugRunner`, set `var confirmationId = '<id>';`.
3. Run → output sẽ tự fetch image_url + amount từ row và re-verify.

---

## 2. Test cases (10 fixtures)

Mỗi case có: ID, mô tả, expected pass/fail per layer, expected final verdict, regression notes.

Layer legend: L1 amount · L2 recipient · L3 hash dup · L4 source · L5 completion · L6 date · L7 ref · L8 editor.

---

### TC01 — PayPay clean (golden path)

**Image**: Real PayPay screenshot, all fields visible, amount ¥2,300 to "Thanghoang さん", `取引番号` 17 digits, `送信日 2026/05/02`.
**Input**: `imageUrl = TC01-paypay-clean.jpg`, `expectedAmount = 2300`.

| Layer | Expected | Notes |
|---|---|---|
| L1 amount | PASS | Detect 2300 |
| L2 recipient | PASS | "Thanghoang さん" pattern |
| L3 dup | PASS | First time seen |
| L4 source | PASS | "PayPay" matched |
| L5 completion | PASS | "送金完了" or similar |
| L6 date | PASS | Today, near 送信日 keyword |
| L7 ref | PASS | 17-digit 取引番号 |
| L8 editor | PASS | No EXIF Software tag |

**Final**: `match: true` · `reason starts with "✓ Khớp ¥2,300"`.

---

### TC02 — PayPay cropped (missing recipient)

**Image**: PayPay screenshot cropped trên đầu — không thấy "Thanghoang", chỉ thấy amount + 取引番号.
**Input**: `expectedAmount = 2300`.

| Layer | Expected | Notes |
|---|---|---|
| L1 amount | PASS | Amount still visible |
| L2 recipient | **FAIL** | No "Thanghoang" / "タカハラ" / `2168488` |

**Final**: `match: false` · `failed_layer: L2_recipient`.

**Regression check**: Reason text Vietnamese phải mention "Thanghoang" — không được nói "Takahara only".

---

### TC03 — PayPay multi-date (送信日 + 有効期限)

**Image**: PayPay screenshot với cả `送信日 2026/05/02` (today) và `有効期限 2026/06/02` (future +30d).
**Input**: `expectedAmount = 5000`.

| Layer | Expected | Notes |
|---|---|---|
| L1–L5 | PASS | |
| L6 date | **PASS** | Picker phải pick 送信日 (today), KHÔNG pick 有効期限 |
| L7–L8 | PASS | |

**Final**: `match: true`.

**Regression check (CRITICAL)**: Đây là bug Layer 6 đã hit trong production. Logger phải in `picked date : 2026/05/02` — KHÔNG được pick 2026/06/02. Nếu fail → `checkRecentDate_` regression đã tái phát.

---

### TC04 — PayPay full-width digits ２,３００

**Image**: PayPay screenshot mà OCR trả về `２,３００円` (full-width digits do font rendering).
**Input**: `expectedAmount = 2300`.

| Layer | Expected | Notes |
|---|---|---|
| L1 amount | **PASS** | Layer 1 đã có `replace(/[０-９]/g, ...)` normalize trước khi match |
| L2–L8 | PASS (assume rest of bill OK) | |

**Final**: `match: true`.

**Regression check**: Nếu Layer 1 fail và `extracted: []` trong log → ai đó đã xoá normalize step. Restore lines 871–873.

---

### TC05 — OCR distortion "Thanghoarq"

**Image**: PayPay screenshot mà Vision OCR đọc nhầm "Thanghoang" → "Thanghoarq" (1 char off, common với font kerning hẹp).
**Input**: `expectedAmount = 3500`.

| Layer | Expected | Notes |
|---|---|---|
| L1 | PASS | |
| L2 recipient | **PASS** | Fuzzy regex `T[hH][a-z0-9]{1,2}n[a-z0-9]{0,2}h[a-z0-9]{0,2}o[a-z0-9]{1,3}n[gq]` (line 1368) phải catch |
| L3–L8 | PASS | |

**Final**: `match: true`.

**Regression check**: Nếu L2 fail → fuzzy regex đã bị xoá / sửa quá strict.

---

### TC06 — Yucho 振込明細 (PC web)

**Image**: ゆうちょダイレクト 振込明細 screenshot — `お振込先 タカハラ ケイイチロウ`, `受付番号 RT0M1234567`, amount `¥10,000`, `お振込日 2026/05/01`.
**Input**: `expectedAmount = 10000`.

| Layer | Expected | Notes |
|---|---|---|
| L1 | PASS | ¥10,000 |
| L2 | PASS | "タカハラ" or "ケイイチロウ" |
| L3 | PASS | |
| L4 source | PASS | "ゆうちょ" matched |
| L5 | PASS | "お振込" |
| L6 | PASS | お振込日 yesterday |
| L7 ref | PASS | 受付番号 alphanumeric `RT0M...` matched by alpha-prefix loose rule (line 1517) |
| L8 | PASS | |

**Final**: `match: true`.

---

### TC07 — Yucho mobile app

**Image**: ゆうちょ通帳アプリ screenshot — 取引明細 view, `タカハラ ケイイチロウ`, `8000円`, no explicit 受付番号 visible but a 12-digit numeric reference.
**Input**: `expectedAmount = 8000`.

| Layer | Expected | Notes |
|---|---|---|
| L1–L6 | PASS | |
| L7 ref | PASS | Loose 12+ digit fallback (line 1513) |
| L8 | PASS | |

**Final**: `match: true`.

---

### TC08 — Mizuho/SMBC bank transfer

**Image**: みずほダイレクト or SMBCダイレクト 振込結果 page, `お受取人 タカハラ ケイイチロウ`, `¥15,000`, `お取扱番号 1234567890123`, `お振込日 2026/05/02`.
**Input**: `expectedAmount = 15000`.

| Layer | Expected | Notes |
|---|---|---|
| L4 source | PASS | "みずほ" or "SMBC" matched |
| Others | PASS | |

**Final**: `match: true`.

---

### TC09 — Photoshopped bill (negative test)

**Image**: Bill JPEG export từ Photoshop (EXIF Software tag = "Adobe Photoshop 24.0").
**Input**: `expectedAmount = 2300`.

| Layer | Expected | Notes |
|---|---|---|
| L1–L7 | PASS (visually correct numbers) | |
| L8 editor | **FAIL** | EXIF Software contains "Adobe Photoshop" |

**Final**: `match: false` · `failed_layer: L8_editor` · reason mention "Adobe Photoshop".

**How to make fixture**: Mở 1 PayPay screenshot trong Photoshop → File → Export → JPEG. Không cần edit gì — chỉ export là EXIF đã có signature.

---

### TC10 — Old bill (>72h)

**Image**: PayPay bill screenshot 1 tuần trước (送信日 2026/04/25), amount ¥4,500, đầy đủ field khác.
**Input**: `expectedAmount = 4500`.

| Layer | Expected | Notes |
|---|---|---|
| L1–L5 | PASS | |
| L6 date | **FAIL** | 7 ngày > 72h cutoff |

**Final**: `match: false` · `failed_layer: L6_date` · reason mention "2026/04/25".

**Regression check**: Đảm bảo cutoff hiện tại = 72h (line 1433). Nếu ai relax thành 7 ngày → TC10 sẽ pass nhầm.

---

## 3. Quick smoke test (30 seconds, run before EVERY redeploy)

Mục tiêu: đảm bảo deploy mới không break golden path & 2 regression cases.

| Step | Action | Expected |
|---|---|---|
| 1 | Run TC01 (PayPay clean) | `match: true` |
| 2 | Run TC03 (multi-date) | `match: true`, picked date = today |
| 3 | Run TC10 (old bill) | `match: false`, failed_layer = L6_date |

Nếu cả 3 pass → deploy. Nếu bất cứ case nào fail → rollback ngay.

Toàn bộ 3 run mất ~30s vì mỗi run chỉ là 1 Vision API call + một ít regex.

---

## 4. Regression test list (NEVER reintroduce)

| # | Bug | Symptom | Root cause | Test that catches it |
|---|---|---|---|---|
| R1 | Layer 7 only matched `取引ID` | Legit PayPay rejected vì UI ghi `取引番号` | Regex chỉ có `取引ID`, không OR với `番号|No` | TC01 (PayPay 取引番号) |
| R2 | Layer 7 không tolerate spaces in ID | PayPay UI split ID làm 2-3 nhóm với space giữa → 12+ digit fallback fail | Cần `text.replace(/\s+/g, '')` trước khi match | TC01, TC07 |
| R3 | Layer 6 picked latest date | 有効期限 (future) bị chọn thay vì 送信日 → "future date" reject | Picker dùng `Math.max` hoặc latest. Phải skip expiry context và prefer txn context, fallback OLDEST | TC03 |
| R4 | Layer 1 không handle full-width digits | OCR trả `２,３００円` → 0 candidates → "không tìm thấy số tiền" | Thiếu `replace(/[０-９]/g, ...)` trước regex | TC04 |
| R5 | Layer 2 strict on Thanghoang spelling | OCR đọc "Thanghoarq" → fail | Thiếu fuzzy regex variant | TC05 |
| R6 | Layer 4 thiếu PayPay variant | "ペイぺイ" (mixed kana) không match | Thiếu OR pattern `ペイぺイ` | TC01, TC04 |
| R7 | Layer 6 cutoff bị nới quá rộng | Bill 7 ngày trước được pass | Ai đó đổi 72h → 7d hoặc xoá check | TC10 |
| R8 | Layer 8 fail-closed when EXIF absent | Mobile screenshot không có EXIF → reject nhầm | Phải fail-OPEN khi không tìm thấy editor sig | TC07 (mobile, ít EXIF) |

**Quy trình**: Trước mỗi PR/redeploy, cuộn qua bảng này. Với mỗi row, hỏi: "Test case nào catch bug này nếu ai vô tình reintroduce?" Nếu không có → thêm test case mới.

---

## 5. Fixture hosting (Supabase Storage)

**Bucket**: `test-fixtures` (public bucket — separate from `payment-proofs` để không lẫn với data thật).

**Folder layout**:
```
test-fixtures/
  TC01-paypay-clean.jpg
  TC02-paypay-cropped.jpg
  TC03-paypay-multidate.jpg
  TC04-paypay-fullwidth.jpg
  TC05-paypay-ocr-distortion.jpg
  TC06-yucho-web.jpg
  TC07-yucho-mobile.jpg
  TC08-mizuho-transfer.jpg
  TC09-photoshopped.jpg
  TC10-old-bill.jpg
  README.txt   ← mapping fixture → expected outcome (mirror this file)
```

**Public URL pattern**:
```
https://<project-ref>.supabase.co/storage/v1/object/public/test-fixtures/TC01-paypay-clean.jpg
```

**Setup steps (one-time)**:
1. Supabase Dashboard → Storage → New bucket → name `test-fixtures` → Public bucket: ON.
2. Upload 10 fixture files (anh chuẩn bị từ bills thật + 1 photoshopped).
3. RLS: bucket public-read là đủ. Không cần RLS policy thêm vì không write từ web client.
4. Note URL pattern → paste vào `testVerifyDebugRunner` khi cần.

**Why Supabase Storage (not Drive/Imgur)**:
- Same domain pattern with production payment-proofs → URL fetch path đã được Apps Script test.
- Public-read không cần auth header trong UrlFetchApp.
- Anh đã quen Supabase dashboard.

**Privacy note**: Fixtures TC01–TC08 dùng bills thật → MUST blackout customer name / bank account number của đối tác (giữ lại Thanghoang / Takahara / 2168488 vì đó là field cần test). TC09, TC10 có thể tự dựng bằng template bills cũ (1 tuần trước).

---

## 6. Adding a new test case

Khi production hit một false negative/positive mới, em recommend anh:

1. Lấy ngay `image_url` từ payment_confirmations row (RLS query bằng confirmation id).
2. Download image về máy → upload lên `test-fixtures/` với tên `TC<NN>-<short-desc>.jpg`.
3. Append 1 mục vào section 2 của file này:
   - Image description (cái gì khác biệt so với bill thường).
   - Expected per-layer outcome.
   - Regression check note (1 dòng nói root cause của bug).
4. Append row tương ứng vào section 4 (regression list).
5. Run mới qua 30s smoke test → confirm không break gì khác.

---

## 7. CI considerations (nice-to-have, NOT blocking)

Apps Script không có CI runner native. Lựa chọn nếu sau này muốn auto-run:
- **Option A**: Time-driven trigger trong Apps Script chạy `runSmokeSuite_()` mỗi sáng 6:00 JST → email anh nếu fail.
- **Option B**: Webhook từ Vercel/GitHub Actions gọi 1 endpoint trong doPost (need to add `type: 'run_smoke'` branch).
- **Option C**: Hand-run trước mỗi redeploy (current state — fine cho team 1 người).

Em recommend Option A nếu deploy frequency > 1 lần/tuần.

---

## 8. References

- `K:\bep-thuy-japan\google-apps-script.js` — pipeline source (line 831 `verifyReceiptStandalone_`, line 1010 `testVerifyBillDebug`).
- `K:\bep-thuy-japan\AUDIT-VERIFY-LAYERS.md` — per-layer regex audit và known blind spots.
- `K:\bep-thuy-japan\HUONG-DAN-SETUP-AI-VERIFY.md` — original setup doc, useful cho onboarding người mới.
- `K:\bep-thuy-japan\URGENT-RECOVER-FAILED-ORDER.md` — recovery playbook khi false negative đã xảy ra trong production.
