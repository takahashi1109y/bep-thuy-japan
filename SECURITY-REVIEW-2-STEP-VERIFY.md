# SECURITY REVIEW — Hệ thống Xác Minh Thanh Toán 2 Bước + Receipt Image Storage

**Dự án:** Bếp Thuỷ Japan
**Phạm vi review:** Privacy + Security + Compliance
**Ngày audit:** 2026-05-02
**Reviewer:** Claude (read-only audit)
**Trạng thái:** Audit only — KHÔNG modify code
**Phiên bản phần mềm:** post-`supabase-2-step-verify.sql` (admin_audit_log + admin_confirm_payment + admin_reject_payment RPCs)

Severity: 🔴 critical · 🟡 medium · 🟢 low · INFO informational

---

## 0. EXECUTIVE SUMMARY (5 bullet findings)

1. **🔴 Receipt URL bypass — signed URLs không hết hạn:** Khách upload bill từ `thanh-vien.html` được gắn `createSignedUrl(path, 365 * 86400)` — tức 1 năm. Bất kỳ ai sao chép URL đầy đủ ra ngoài (qua DevTools, screenshot share, log file, browser history sync) đều có thể truy cập ảnh bill chứa số tiền + recipient name + có thể là số tài khoản trong 365 ngày kế tiếp, KHÔNG cần đăng nhập, KHÔNG cần là admin, KHÔNG có audit log.

2. **🔴 Apps Script / Vision API path không bị authenticate — replay + impersonation:** Endpoint `https://script.google.com/macros/s/AKfycbz38j2.../exec` chấp nhận `type='admin_force_approve_payment'` chỉ cần JSON body có field `admin_email`. Không có shared secret, không verify session JWT, không validate `admin_email` trùng với `admin_users` table. Attacker biết URL Apps Script (đã lộ trong source HTML) có thể force-approve bill nào cũng được bằng cách POST với `admin_email='thanghoang1109@gmail.com'`.

3. **🔴 Vision API call gửi ảnh bill (chứa PII Nhật) qua Google KHÔNG được disclose trong privacy.html:** `privacy.html` mục 4 "Bên thứ ba" liệt kê Supabase, Vercel, Google Analytics, hCaptcha, GetResponse, APNs/FCM, vận chuyển — KHÔNG có **Google Cloud Vision API**. Theo APPI Điều 24-25 (sửa đổi 2022), việc transfer dữ liệu cá nhân ra third-party processor BẮT BUỘC phải được disclose. Khách KHÔNG có cơ chế opt-out: bill upload sẽ tự động bị OCR.

4. **🟡 Admin audit log mới có nhưng các path cũ không log vào đó:** `admin_audit_log` table được tạo trong `supabase-2-step-verify.sql` và được populate bởi RPC `admin_confirm_payment` / `admin_reject_payment`. Nhưng path đang dùng trong production (`verify_payment_confirmation` từ `thuythang.html:3373`, `admin_force_approve_payment` từ Apps Script `forceApprovePayment_:2042`, `confirm_order_payment` từ `supabase-admin-migration.sql:54`) đều KHÔNG ghi audit log. Nghĩa là: nếu có dispute, anh chỉ có evidence cho các action đi qua RPC mới — không có evidence cho 90% action thực tế.

5. **🟡 Telegram bot token + Supabase service_role key tập trung trong Apps Script Properties (single point of failure):** Cả `TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_KEY`, `GOOGLE_VISION_KEY`, `GR_API_KEY` đều ở `PropertiesService.getScriptProperties()`. Nếu Google account của owner Apps Script bị compromise (phishing, OAuth hijack), toàn bộ chuỗi xác minh + database write + Telegram bot + email send đều rơi vào tay attacker. Không có rotation schedule, không có alert khi properties bị thay đổi.

---

## 1. RECEIPT IMAGE STORAGE — Findings chi tiết

### 1.1 [🔴 CRITICAL] Bucket `payment-proofs` cấu hình mơ hồ; signed URL có thời hạn 1 năm

**Files:** `K:\bep-thuy-japan\supabase-payment-proof.sql:188`, `K:\bep-thuy-japan\thanh-vien.html:2722`, `K:\bep-thuy-japan\google-apps-script.js:1780,1842`, `K:\bep-thuy-japan\AUDIT-STORAGE-RLS.md` (toàn file)

**Phát hiện:**
- Bucket `payment-proofs` được tạo qua Supabase Dashboard UI (không qua SQL migration), dự kiến `Public: NO` per comment line 188.
- KHÔNG có RLS policy nào trên `storage.objects` cho bucket này trong bất kỳ file `supabase-*.sql` nào (đã grep 24 file).
- `thanh-vien.html:2722` gọi `createSignedUrl(path, 365 * 86400)` → token JWT-signed valid **365 ngày**.
- `google-apps-script.js:1780, 1842` build URL kiểu `/storage/v1/object/public/payment-proofs/...` — chỉ work nếu bucket public. Tức là tồn tại sự MISMATCH: customer-side dùng signed URL (private), Apps Script-side dùng public URL (assume public).
- URL đầy đủ chứa cả filename (vd: `<userId>/<orderNo>-<ts>-<8charHash>.jpg`) — dễ guess theo userId nếu ai đó liệt kê được orders.

**Privacy risk:**
- Bill chứa: số tiền chuyển, recipient name (Thanghoang / Takahara Keiichiro), PayPay display name, có thể có địa chỉ MUFG/SMBC/Yucho 記号番号 12030-21684881 + 口座番号 2168488, transaction ID, timestamp.
- Một URL signed valid 1 năm = cookie không bao giờ expire trong vòng đời của lifecycle bình thường (đa số đơn hàng được resolve trong < 7 ngày).
- Token leak qua: client log (Sentry, Datadog), browser history, screenshot khi mở DevTools, share link cho support, email forward.

**Recommended fix:**
```js
// thanh-vien.html:2722 — giảm xuống 7 ngày
const { data: urlData } = await sb.storage.from('payment-proofs').createSignedUrl(path, 7 * 86400);
// Đồng thời: refresh signed URL khi admin mở modal thay vì lưu cứng
```
Hoặc tốt hơn: chuyển sang **path-based storage** (chỉ lưu `path` trong DB), `thuythang.html` modal gọi `createSignedUrl(path, 300)` (5 phút) on-demand mỗi lần render — token không bao giờ live-leak ra DB.

**Severity:** 🔴 critical (privacy + token longevity).

---

### 1.2 [🔴 CRITICAL] Storage RLS chưa có — phụ thuộc 100% vào "guess URL khó"

**File:** `K:\bep-thuy-japan\AUDIT-STORAGE-RLS.md:32-50`

**Phát hiện:**
- Nếu bucket `payment-proofs` đang ở state `public=true` (theo Apps Script assume), thì BẤT KỲ AI biết URL đều đọc được. URL pattern: `https://curcsvwvjkjewtonkhnr.supabase.co/storage/v1/object/public/payment-proofs/<userId>/<orderNo>-<timestamp>-<hash8>.<ext>`.
- Path entropy: `userId` (UUID 36 char ~ 122 bits) + `orderNo` (vd `TJ-20260502-001`, có thể enumerate) + `timestamp` (ms) + 8 char hash.
- Nếu bucket public, attacker biết 1 user_id (qua RLS leak hoặc social engineering) + biết order_no pattern → có thể spider Storage URL bằng cách đoán timestamp ranges.

**Recommended fix:**
- Run SQL trong `AUDIT-STORAGE-RLS.md` Section B để verify state thực của `storage.buckets`.
- Apply Option D.2 (private + admin-read RLS policy) thay vì public-read. Chuẩn hoá toàn bộ render về signed URLs.

**Severity:** 🔴 critical.

---

### 1.3 [🟡 MEDIUM] Retention không có upper bound — vi phạm nguyên tắc data minimization

**File:** `K:\bep-thuy-japan\privacy.html:223`

**Phát hiện:**
- `privacy.html` mục 5.2 ghi: "Ảnh biên lai chuyển tiền: giữ tối thiểu 1 năm phục vụ đối soát kế toán."
- Đây là MIN, không có MAX. Tức là theo policy hiện tại: shop có thể giữ ảnh bill VĨNH VIỄN.
- Theo APPI (個人情報保護法) Điều 19: dữ liệu không còn cần thiết cho mục đích thu thập phải bị xoá. Bill thanh toán chỉ cần cho:
  - Đối soát + tax (Nhật yêu cầu lưu chứng từ kế toán **7 năm** per 法人税法).
  - Dispute resolution (tối đa 5 năm theo 民法時効).
- Hiện tại không có cron job xoá ảnh cũ.

**Recommended fix:**
- Sửa `privacy.html` mục 5.2: "giữ **tối đa 7 năm** kể từ ngày đơn hoàn thành (theo yêu cầu lưu trữ chứng từ kế toán Nhật Bản); sau đó tự động xoá."
- Implement cron Apps Script xoá ảnh `payment-proofs/` cũ hơn 7 năm + soft-delete row trong `payment_confirmations`.
- Thực ra với business hiện tại (B2C, nhỏ), 1-2 năm là đủ — bàn lại với anh.

**Severity:** 🟡 medium (compliance + privacy-by-design).

---

### 1.4 [🟢 LOW] Customer name + bill content lưu trong Supabase database column (`ai_raw_text`) không mã hoá

**Files:** `K:\bep-thuy-japan\supabase-ai-payment-verify.sql:9`, `K:\bep-thuy-japan\google-apps-script.js:2017`

**Phát hiện:**
- Cột `ai_raw_text` lưu **toàn bộ OCR text** của bill, slice 5000 chars. Bill PayPay/Yucho thường chứa:
  - Tên người gửi (khách tự gửi từ tài khoản của họ — PII của khách).
  - Số tài khoản người nhận (Thanghoang / 2168488 / 12030-21684881).
  - Transaction ID (取引ID 17 ký tự).
  - Timestamp giao dịch.
- Supabase encrypts at rest (per Supabase docs) nhưng không client-side encrypt.

**Recommended fix:**
- Đối với bill PayPay/bank, redact sender name trước khi lưu (regex pattern: `/差出人:\s*[^\n]+/` → replace).
- Hoặc: chỉ lưu `ai_raw_text` cho rows có `ai_match=false` trong 30 ngày (debug); sau đó null out.

**Severity:** 🟢 low.

---

## 2. AI VERIFY (Google Vision API) — Findings chi tiết

### 2.1 [🔴 CRITICAL] Image bill được gửi sang Google Vision API mà KHÔNG có disclosure trong privacy.html

**File:** `K:\bep-thuy-japan\google-apps-script.js:917-928, 1910-1923`

**Phát hiện:**
- Mỗi lần khách upload bill, Apps Script gọi `https://vision.googleapis.com/v1/images:annotate?key=...` với base64 ảnh đầy đủ + `languageHints: ['ja','vi','en']`.
- Google Vision API privacy policy: "Google does not use these images to improve our products" (per Cloud documentation), nhưng default retention là **24h** trong Google's logs cho debugging purposes (per Cloud Vision SLA), và data flows qua US/EU regions.
- **KHÔNG có dòng nào trong `privacy.html` mục 4 "Bên thứ ba" đề cập Google Cloud Vision** — chỉ có Google Analytics. Đây là 2 dịch vụ khác nhau hoàn toàn.

**Compliance gap:**
- **APPI Điều 24** (越境移転): personal data transfer ra third country (Mỹ/EU) cần disclose tên dịch vụ, country, security measures.
- **APPI Điều 27** (third-party provision): cần consent hoặc opt-out, hoặc disclose trong notice.
- **GDPR Art. 13** nếu khách EU: tên data processor + legal basis cần ghi rõ.

**Recommended fix:**
1. Thêm vào `privacy.html` mục 4:
   ```html
   <li><strong>Google Cloud Vision API</strong> (OCR ảnh biên lai để xác minh số tiền tự động):
       <a href="https://cloud.google.com/vision/data-usage" target="_blank">cloud.google.com/vision/data-usage</a>.
       Ảnh được transfer sang Google US, retention 24h trong logs, không dùng để train AI.</li>
   ```
2. Thêm consent checkbox khi khách upload bill: "Tôi đồng ý ảnh biên lai được phân tích bằng AI (Google Cloud Vision) để xác minh số tiền tự động."
3. Bổ sung opt-out: button "Tôi muốn shop xác minh thủ công, không dùng AI" → set flag `skip_ai_verify=true` → đơn vào `pending_manual_review`.

**Severity:** 🔴 critical (legal compliance + transparency).

---

### 2.2 [🟡 MEDIUM] Vision API key hardcoded trong Script Properties — không có rate limit phía Google

**File:** `K:\bep-thuy-japan\google-apps-script.js:894, 1894`

**Phát hiện:**
- `_prop('GOOGLE_VISION_KEY', '')` — key đọc từ Script Properties.
- Nếu key bị leak (qua Apps Script revision history, share-script accident, OAuth scope abuse), attacker có thể spam Vision API mà bill thẳng vào account của anh.
- Free tier: 1000 ảnh/tháng. Beyond: $1.50/1000. Một attacker chạy 1M request → $1500 surprise bill.

**Recommended fix:**
- Trong Google Cloud Console, restrict API key:
  - HTTP referrers: `*.googleusercontent.com`, `*.script.google.com`
  - API restrictions: chỉ enable Cloud Vision API (không cho key access dịch vụ khác).
  - Quota: set max 5000 request/day.
- Setup billing alert ở $5, $20, $50.

**Severity:** 🟡 medium.

---

### 2.3 [🟢 LOW] Customer chưa được thông báo về AI verify result fail trong UI

**Files:** `K:\bep-thuy-japan\thanh-vien.html`, `K:\bep-thuy-japan\index.html`

**Phát hiện:**
- Khi AI verify fail, khách thấy generic message "Đã gửi hóa đơn — shop sẽ xác nhận trong 24h", không biết AI đang xử lý đằng sau lưng.
- Theo nguyên tắc transparency của APPI: khách cần biết quyết định automated nào đang affect họ.

**Recommended fix:**
- UI khách: thêm step indicator "🤖 AI đang xác minh ảnh... 30s" → "✓ AI verify pass — chờ shop confirm" hoặc "⚠️ AI không xác minh được — shop sẽ kiểm tra thủ công trong 24h".
- Cho khách quyền yêu cầu shop NOT dùng AI cho đơn của họ (link tới support@).

**Severity:** 🟢 low (UX + soft compliance).

---

## 3. ADMIN ACTIONS — Findings chi tiết

### 3.1 [🔴 CRITICAL] `admin_force_approve_payment` qua Apps Script KHÔNG verify caller is admin

**Files:** `K:\bep-thuy-japan\google-apps-script.js:88, 221-230, 2042-2133`, `K:\bep-thuy-japan\thuythang.html:3197-3208`

**Phát hiện:**
- Endpoint: `https://script.google.com/macros/s/AKfycbz38j2.../exec` (URL hardcoded trong `thanh-vien.html:2741`, `thuythang.html:?`).
- Apps Script `validatePayload_` line 86-89 explicitly bypass validation cho `ADMIN_TYPES = ['payment_received', 'verify_receipt', 'admin_force_approve_payment', ...]`.
- `forceApprovePayment_` chỉ kiểm tra:
  ```js
  var adminEmail = (data.admin_email || '').toString().slice(0, 200);
  if (!adminEmail) return { ok: false, error: 'Missing admin_email' };
  ```
  KHÔNG verify `admin_email` against `admin_users` table. KHÔNG verify session JWT. KHÔNG check shared secret.

**Attack scenario:**
```bash
curl -X POST 'https://script.google.com/macros/s/AKfycbz38j2.../exec' \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"type":"admin_force_approve_payment","confirmation_id":123,"order_no":"TJ-20260502-001","expected_amount":2300,"reason":"hacked","admin_email":"thanghoang1109@gmail.com"}'
```
→ Server marks payment as approved + bumps order to `customer_paid` + log shows admin approve. Attacker đã thành công impersonate anh.

**Recommended fix:**
1. Thêm shared secret header:
   ```js
   // Apps Script
   const ADMIN_SHARED_SECRET = _prop('ADMIN_SHARED_SECRET', '');
   if (data.type && data.type.startsWith('admin_')) {
     if ((e.parameter.admin_secret || '') !== ADMIN_SHARED_SECRET) {
       return buildResponse({ success: false, error: 'unauthorized' });
     }
   }
   ```
   Trong `thuythang.html`: load secret từ Supabase column trong `admin_users` table (read-only after auth). Nhưng cách này vẫn còn rủi ro client-side leak.
2. **Tốt hơn:** Bỏ Apps Script khỏi flow này. Thay bằng Supabase RPC `admin_force_approve_payment` (giống pattern `admin_confirm_payment` trong `supabase-2-step-verify.sql`) — RPC verify caller qua `auth.uid()` + check `admin_users`. Đây là cách RPC mới đang làm; chỉ cần migrate cũ sang.

**Severity:** 🔴 critical (impersonation + bypass admin auth).

---

### 3.2 [🟡 MEDIUM] Admin audit log có nhưng paths cũ chưa ghi vào — coverage gap

**Files:** `K:\bep-thuy-japan\supabase-2-step-verify.sql:50-110`, `K:\bep-thuy-japan\supabase-admin-migration.sql:54-92`, `K:\bep-thuy-japan\supabase-payment-proof.sql:140-181`

**Phát hiện:**
- `admin_audit_log` table được tạo trong `supabase-2-step-verify.sql:50` với immutable design (no UPDATE/DELETE policy line 102-109).
- RPCs MỚI ghi audit log:
  - `admin_confirm_payment` (line 195-207)
  - `admin_reject_payment` (line 308-320)
- RPCs CŨ KHÔNG ghi audit log:
  - `confirm_order_payment` (`supabase-admin-migration.sql:54-92`) — admin click "Xác nhận TT" trong dashboard.
  - `verify_payment_confirmation` (`supabase-payment-proof.sql:141-181`) — admin click verify/reject bill cũ.
  - `cancel_order` (`supabase-admin-migration.sql:155-195`) — admin huỷ đơn.
  - `mark_order_shipped` (line 95-152) — admin tick "đã ship".
  - `forceApprovePayment_` (Apps Script, line 2042) — manual override AI fail.
- Trong `thuythang.html:3373` đang gọi RPC CŨ (`verify_payment_confirmation`), không phải RPC mới.

**Compliance gap:**
- Nếu khách dispute "ai đã confirm đơn này?", anh chỉ có evidence cho 2 RPC mới.
- Theo 改正食品衛生法 (HACCP-based traceability since 2021-06): mặc dù chính cho food production, nhưng business operation log nên có cho tax + dispute.

**Recommended fix:**
1. Thêm INSERT vào `admin_audit_log` trong tất cả RPCs cũ (1 dòng SQL mỗi function).
2. Migrate `thuythang.html` gọi `admin_confirm_payment` thay vì `verify_payment_confirmation`.
3. Backfill log cho actions trong quá khứ qua truy vấn `payment_confirmations.verified_by` + `verified_at` (gần đúng).

**Severity:** 🟡 medium.

---

### 3.3 [🟡 MEDIUM] Multi-admin scenario — role differentiation chưa rõ

**Files:** `K:\bep-thuy-japan\supabase-admin-migration.sql:8-24`, `K:\bep-thuy-japan\supabase-2-step-verify.sql:82-100`

**Phát hiện:**
- `admin_users` table có cột `role` với check `('admin', 'super_admin')` nhưng **trong tracked SQL, chỉ `admin_audit_log` SELECT policy phân biệt 2 role**. Tất cả RPC khác (confirm, reject, cancel, ship) đều check `EXISTS (SELECT 1 FROM admin_users WHERE user_id=auth.uid())` — tức bất kỳ ai có row trong admin_users đều có full quyền.
- Hiện tại có thể chỉ mình anh là admin, nhưng nếu sau này thuê staff (nhân viên đóng hàng, kế toán):
  - Staff đóng hàng cần: read orders, mark shipped, không cần đụng payment confirm.
  - Kế toán cần: read orders + payment proof, không cần ship mark.
  - Anh cần: full access.
- Hiện tại không thể tạo admin "limited" — promote 1 nhân viên thành admin = give-all-keys.

**Recommended fix:**
- Đợi khi có nhu cầu thật, thêm cột `permissions jsonb` vào `admin_users`:
  ```sql
  ALTER TABLE admin_users ADD COLUMN permissions jsonb DEFAULT '{"all":true}';
  -- Staff đóng hàng: '{"orders.read":true, "orders.ship":true}'
  ```
- Update RPC checks: `WHERE permissions @> '{"orders.confirm":true}'`.

**Severity:** 🟡 medium (chưa critical vì single-admin, nhưng cần plan trước khi hire).

---

### 3.4 [🟢 LOW] Admin email field trong audit log không enforce uniqueness

**File:** `K:\bep-thuy-japan\supabase-2-step-verify.sql:52`

**Phát hiện:**
- `admin_email text NOT NULL` không có FK tới `auth.users(email)` hoặc `admin_users`.
- Trong `admin_confirm_payment:138`: `v_admin_email := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', '')`. Nếu JWT claim không có email (case Supabase rotation), default fallback là `'service_role'` (line 147-148).
- Nếu attacker bypass JWT (ví dụ qua RPC misuse), `admin_email` có thể bị spoof.

**Recommended fix:**
- Cross-validate: `IF v_admin_email NOT IN (SELECT email FROM auth.users WHERE id=auth.uid()) THEN RAISE EXCEPTION 'email mismatch'`.

**Severity:** 🟢 low.

---

## 4. 2-STEP VERIFY FLOW — Findings chi tiết

### 4.1 [🟡 MEDIUM] Race condition: 2 admin click confirm/reject cùng lúc

**File:** `K:\bep-thuy-japan\supabase-2-step-verify.sql:151-216, 263-329`

**Phát hiện:**
- RPC `admin_confirm_payment` line 151-154 dùng `SELECT * FROM payment_confirmations WHERE id=p_confirmation_id FOR UPDATE` — TỐT. Đây là row-level lock, đảm bảo nếu 2 admin click cùng lúc, người sau sẽ phải đợi.
- Sau lock: line 161-169 check `IF v_conf.admin_action = 'confirmed'` → return early. Đây là idempotency check.
- **NHƯNG**: Order update line 187 KHÔNG có lock trước. Race window:
  - Admin A click confirm conf #100 (order_no=TJ-X) → row lock conf #100.
  - Admin B click reject conf #101 (cùng order TJ-X) → row lock conf #101 (KHÁC row, không bị block).
  - Cả 2 update orders.status concurrently → last write wins.
- Với `'customer_paid'` → `'confirmed'` (A) và `'pending'` → `'cancelled'` (B), nếu B chạy sau A, order = cancelled. Anh ship hàng cho khách → sau đó dashboard show cancelled → confusion.

**Recommended fix:**
- Trong `admin_confirm_payment` line 180-184: Thêm `FOR UPDATE` khi SELECT order:
  ```sql
  -- Already done line 184: FOR UPDATE
  ```
  Đã có rồi! Nhưng khi 2 conf khác nhau cùng order: vẫn race vì lock 2 conf khác nhau. Cần lock order ngay từ đầu nếu cả conf và order đều cùng update path.
- Hoặc: chỉ allow 1 confirm/reject per order trong 1 transaction. Constraint:
  ```sql
  CREATE UNIQUE INDEX one_decision_per_order ON payment_confirmations(order_no)
    WHERE admin_action IS NOT NULL;
  ```

**Severity:** 🟡 medium (single-admin hiện tại = no race, nhưng future-proof).

---

### 4.2 [🟡 MEDIUM] Replay attack: resubmit old payment screenshot

**Files:** `K:\bep-thuy-japan\supabase-payment-proof.sql:104-114, 30`, `K:\bep-thuy-japan\google-apps-script.js:984-994`

**Phát hiện:**
- Layer 3 fraud check (`checkScreenshotDuplicate_`): hash SHA-256 ảnh, query `WHERE screenshot_hash=hash AND order_no<>p_order_no`. Nếu hash đã dùng cho ORDER KHÁC → reject.
- Defense gap:
  - **Same order, multiple uploads**: cùng 1 ảnh upload 3 lần cho cùng 1 đơn → KHÔNG bị block bởi layer 3 (chỉ check khác order). Layer 4 (max 3 conf/order) sẽ block lần thứ 4.
  - **Slightly modified screenshot**: attacker mở ảnh trong Photoshop, save với 1 byte khác → SHA-256 khác hoàn toàn → bypass layer 3. Layer 8 (image editor signature) check vài editor signatures nhưng không bullet-proof.
  - **Screenshot từ user khác**: nếu 2 khách trade screenshot (vd phối hợp lừa), khách B upload bill khách A đã chuyển → layer 3 detects (cross-order), nhưng layer 2 (recipient name) cũng check.
- Layer 6 (date in last 48h) là defense chính chống replay BIL CŨ — nhưng nếu khách cũ giữ bill 1 tháng, retake screenshot với ngày mới (Photoshop ngày), bypass.

**Recommended fix:**
- Thêm **transaction reference dedup** (Layer 7 đang detect ID nhưng không dedup):
  ```sql
  ALTER TABLE payment_confirmations ADD COLUMN transaction_ref text;
  CREATE UNIQUE INDEX uniq_tx_ref ON payment_confirmations(transaction_ref) WHERE transaction_ref IS NOT NULL;
  ```
  Mỗi PayPay/bank transaction có ID duy nhất → reuse = duplicate.
- Strengthen layer 6 (date check): so sánh date trong bill với `orders.created_at` — nếu bill date < order create time → auto-reject (impossible).

**Severity:** 🟡 medium.

---

### 4.3 [🟢 LOW] Time-based attack: system clock manipulation

**File:** `K:\bep-thuy-japan\google-apps-script.js:992-1033, 1108`

**Phát hiện:**
- Layer 6 check date dùng `new Date()` server-side (Apps Script). Apps Script chạy trên Google infrastructure → không thể manipulate clock.
- **Tuy nhiên**: Date trong BILL được parse từ OCR text. Attacker có thể edit ảnh bill để show date "vừa rồi" — bypass.
- Cutoff hardcoded 48h (line 1109 `48 * 3600 * 1000`). Bill từ ngày khác giờ vẫn pass nếu < 48h.

**Recommended fix:**
- Cross-check: bill date PHẢI sau `orders.created_at` (impossible to pay before order).
- So sánh OCR date với upload time JST:
  ```js
  if (billDateMs > Date.now() + 60*60*1000) reject // > 1h future = clock skew alarm
  if (billDateMs < orderCreatedMs) reject // pay before order created = fake
  ```

**Severity:** 🟢 low.

---

### 4.4 [🟢 LOW] Submit anyway path không có CAPTCHA / rate limit nghiêm ngặt

**File:** `K:\bep-thuy-japan\SPEC-2-STEP-VERIFY.md:380-385` (open question), `K:\bep-thuy-japan\index.html:?` (not yet implemented)

**Phát hiện:**
- Spec mention "Submit anyway" button khi AI fail → set `status='pending_manual_review'`. Khách bypass AI để force vào admin queue.
- Nếu không có rate limit, attacker spam submit anyway 100 lần → flood admin dashboard với fake reviews → social engineering anh approve nhầm.
- Apps Script có `checkRateLimit_` (line 60-79) — 10 req/60s/IP. Nhưng chỉ check trong Apps Script, không check khi insert `payment_confirmations` directly từ Supabase RPC.

**Recommended fix:**
- Thêm rate limit ở RPC `submit_payment_confirmation`:
  ```sql
  -- Max 1 submit/min/user
  IF EXISTS (SELECT 1 FROM payment_confirmations WHERE user_id=v_uid AND created_at > now() - interval '1 minute') THEN
    RETURN ...'too fast'...
  END IF;
  ```
- Submit-anyway flow: yêu cầu khách type lý do (free text 50+ chars), tăng friction.

**Severity:** 🟢 low.

---

## 5. CUSTOMER DISPUTE — Findings chi tiết

### 5.1 [🟡 MEDIUM] Evidence preservation: bill image + audit log → tốt; nhưng `verified_by`, `manual_approver` mix với fields cũ → confusing

**Files:** `K:\bep-thuy-japan\supabase-payment-proof.sql:11-26`, `K:\bep-thuy-japan\supabase-manual-approve-payment.sql:5-8`, `K:\bep-thuy-japan\supabase-2-step-verify.sql:13-17`

**Phát hiện:**
- Một row `payment_confirmations` có 8 audit-related columns spanning 3 migrations:
  - `verified_by` (uuid), `verified_at`, `rejected_reason` — từ migration đầu tiên.
  - `manual_approver` (text), `manual_approve_reason`, `manual_approved_at` — từ manual-approve migration.
  - `admin_confirmed_at`, `admin_confirmer`, `admin_notes`, `admin_action` — từ 2-step-verify migration.
- Nếu khách dispute, anh phải JOIN 8 cột này để hiểu happened gì → khó. Có khả năng inconsistency: `admin_action='confirmed'` nhưng `verified_by IS NULL`.

**Recommended fix:**
- Tạo view union các cột này thành `payment_audit_summary`:
  ```sql
  CREATE VIEW payment_audit_summary AS SELECT
    id, order_no,
    coalesce(admin_confirmed_at, manual_approved_at, verified_at) as decided_at,
    coalesce(admin_confirmer, manual_approver, verified_by::text) as decided_by,
    coalesce(admin_notes, manual_approve_reason, rejected_reason) as decision_reason,
    coalesce(admin_action,
             case when manual_approved_at is not null then 'manual_approved'
                  when verified_at is not null and status='verified' then 'verified'
                  when verified_at is not null and status='rejected' then 'rejected'
                  else null end) as final_action
  FROM payment_confirmations;
  ```
- Dispute UI cho anh: 1 query → thấy đầy đủ.

**Severity:** 🟡 medium.

---

### 5.2 [🟢 LOW] PCI DSS — không applicable cho hiện tại

**Phát hiện:**
- Bếp Thuỷ KHÔNG xử lý credit card data trực tiếp. Khách chuyển khoản qua PayPay / ngân hàng — anh chỉ lưu screenshot bill, KHÔNG lưu card number / CVV / track data.
- `privacy.html:155` xác nhận: "chúng tôi không lưu thông tin thẻ tín dụng / số tài khoản ngân hàng của khách."
- → PCI DSS không apply. Không có gap.

**Severity:** N/A.

---

### 5.3 [🟢 LOW] Refund process chưa có flow tự động + chưa có audit dedicated

**Phát hiện:**
- `cancel_order` (`supabase-admin-migration.sql:155-195`) có handle refund **points** nhưng không có refund **cash** flow.
- Nếu khách dispute "tôi đã trả ¥2,300, anh nhận chưa giao hàng, tôi muốn refund cash":
  - Anh phải Reach out PayPay/bank manually để refund.
  - Audit trail trong `cancel_order`: chỉ ghi `cancel_reason` text, không có amount, không có refund_method, không có refund_at.

**Recommended fix:**
- Khi nhu cầu thực sự xảy ra: thêm columns `refund_amount`, `refund_method`, `refund_completed_at`, `refund_proof_url`. Hoặc tạo bảng riêng `refunds`.

**Severity:** 🟢 low (chưa cần ngay, nhưng plan trước).

---

## 6. TELEGRAM ALERTS — Findings chi tiết

### 6.1 [🟡 MEDIUM] Telegram bot token leak risk + chat_id rebroadcast

**Files:** `K:\bep-thuy-japan\google-apps-script.js:1872, 2443, 3067, 3090`

**Phát hiện:**
- 4 functions dùng `_prop('TELEGRAM_BOT_TOKEN', '')` + `_prop('TELEGRAM_CHAT_ID', '')`.
- Token leak scenarios:
  - Apps Script revision history: nếu token TỪNG được hardcode rồi sau di chuyển vào Properties (cũ flow), revision cũ vẫn còn token.
  - OAuth scope: anyone có "Editor" access vào Apps Script project có thể đọc Properties qua editor UI.
  - Logs: `Logger.log` không log token (đã verify), nhưng log error có thể chứa request body — kiểm tra kỹ.
- Token leak impact: attacker post Telegram message giả mạo bot. Chat_id leak: attacker có thể spam alerts vào chat của anh.
- Bot không sign messages → anh không phân biệt được message thật vs giả từ bot.

**Recommended fix:**
- Rotate `TELEGRAM_BOT_TOKEN` định kỳ (1-3 tháng).
- Restrict bot privacy mode: bot chỉ post vào chat đã được invite, không reply public.
- Log audit: mỗi `UrlFetchApp.fetch` to `api.telegram.org` log timestamp + payload hash → dấu hiệu nếu attacker spam.

**Severity:** 🟡 medium.

---

### 6.2 [🟢 LOW] Telegram payload chứa PII khách (tên, SĐT, đơn) — sent qua Telegram cloud

**File:** `K:\bep-thuy-japan\google-apps-script.js:1876-1883, 3113-3120`

**Phát hiện:**
- Manual review urgent alert (line 1876-1883):
  ```
  📦 Đơn: #TJ-20260502-001
  👤 Hoang Thi An
  💵 ¥2,300
  📞 080-1234-5678
  ```
- Telegram lưu message trên server cloud (Telegram has been criticized for not being end-to-end encrypted by default in regular chats — secret chats are E2E but bots cannot use secret chats).
- Tức: tên + SĐT khách Việt được lưu trên Telegram server (US/EU/Singapore) — outside business control.
- `privacy.html` không liệt kê Telegram là third-party processor.

**Recommended fix:**
- Add Telegram to `privacy.html` mục 4 (third party).
- Hoặc redact trong Telegram: chỉ gửi `📦 Đơn: #TJ-...001` + link, anh click link mở dashboard → sees full PII trong web app authenticated. Không leak qua Telegram.

**Severity:** 🟢 low.

---

## 7. COMPLIANCE — Findings chi tiết

### 7.1 [🔴 CRITICAL — Compliance Gap] APPI 2022 — không có disclosure cho Google Cloud Vision

(Đã cover ở mục 2.1 — same finding from compliance angle.)

**Reference:** 個人情報保護法 (APPI) Điều 24 (越境移転規制), Điều 27 (third-party provision).

---

### 7.2 [🟡 MEDIUM — Compliance] 改正食品衛生法 (HACCP) — payment proof retention not in scope

**Phát hiện:**
- 改正食品衛生法 (sửa đổi 2018, hiệu lực 2021-06) yêu cầu **food traceability**: nguyên liệu, quy trình sản xuất, lot number, ngày hết hạn. KHÔNG yêu cầu payment proof retention — đó là phạm vi tax law.
- Tax law (法人税法 và 消費税法): yêu cầu lưu chứng từ 7 năm.
- Bếp Thuỷ là sole proprietor (個人事業主) hay 法人? Nếu sole prop, lưu 5-7 năm. Nếu 法人, 7 năm.

**Recommended fix:**
- Confirm anh là 個人事業主 hay 株式会社 → xác định retention period chính xác.
- Update `privacy.html:223` "tối thiểu 1 năm" → "tối đa 7 năm theo yêu cầu lưu chứng từ thuế Nhật, sau đó tự động xoá".

**Severity:** 🟡 medium.

---

### 7.3 [🟡 MEDIUM — Compliance] 特定商取引法 — disclosure khi xác minh thanh toán bằng AI

**Phát hiện:**
- 特定商取引法 (Act on Specified Commercial Transactions) Điều 11 yêu cầu shop bán hàng online disclose:
  - Tên + địa chỉ doanh nghiệp.
  - Số điện thoại liên lạc.
  - Phương thức thanh toán + thời điểm trả tiền.
  - Thời gian giao hàng.
  - Điều kiện hoàn trả + huỷ đơn.
  - Nếu DỊCH VỤ tự động xử lý đơn (AI verify, instant approve): cần disclose.
- Bếp Thuỷ hiện có:
  - 特商法 page? Em chưa check (TODO: grep `tokushoho` / `特商` / `特定商取引`).
  - Hiện `privacy.html` có nhưng KHÔNG phải 特商法 page (2 cái khác nhau).
- AI verify auto-approve order → bypass shop manual review → khách có thể argue "tôi không biết AI đã quyết định".

**Recommended fix:**
1. Tạo page `/tokushoho.html` hoặc bổ sung vào `huong-dan-thanh-toan.html`:
   - Tên: Takahashi Keiichiro / Bếp Thuỷ Japan
   - Địa chỉ: (anh điền)
   - Phone: (anh điền)
   - Email: support@thuyjapan.com
   - Phương thức TT: PayPay (送金), bank transfer (ゆうちょ).
   - Quy trình xác minh: "Hệ thống xác minh ảnh biên lai bằng AI tự động (Google Cloud Vision); shop xác nhận thủ công lần 2 trong 24h."
   - Cancellation policy.
2. Link footer: thêm `<a href="/tokushoho">特定商取引法に基づく表記</a>`.

**Severity:** 🟡 medium.

---

### 7.4 [🟢 LOW] GDPR (Art. 22) — automated decision-making

**Phát hiện:**
- AI verify quyết định auto-approve order = automated decision per GDPR Art. 22.
- Nếu Bếp Thuỷ có khách EU (Việt kiều ở EU đặt hàng giao Nhật) → cần:
  - Right to human review (đã có via 2-step verify with admin).
  - Right to contest (qua email support@).
  - Disclosure: "We use AI to automatically verify your payment receipt".
- Hiện tại `privacy.html:182` mention "Cải thiện trải nghiệm mua sắm dựa trên dữ liệu sử dụng" — quá vague.

**Recommended fix:**
- Thêm mục "AI Decision-Making" vào privacy.html disclosure rõ AI verify, opt-out path.

**Severity:** 🟢 low (target market chính là Việt kiều ở Nhật, không phải EU).

---

## 8. RECOMMENDED FIXES — Tổng hợp

### 8.1. Critical fixes (làm trong 1 tuần)

| # | Fix | Files | Effort |
|---|-----|-------|--------|
| C1 | Giảm signed URL từ 365 ngày → 7 ngày + on-demand refresh trong admin modal | `thanh-vien.html:2722`, `thuythang.html:render-modal` | M (2-3h) |
| C2 | Thêm shared secret cho Apps Script `admin_*` types | `google-apps-script.js:88, 221`, `thuythang.html:3197` | M (2h) |
| C3 | Update `privacy.html` mục 4: thêm Google Cloud Vision + Telegram | `privacy.html:194-212` | S (30m) |
| C4 | Verify storage.buckets state (run SQL trong AUDIT-STORAGE-RLS.md) | Supabase SQL Editor | XS (5m) |
| C5 | Migrate `verify_payment_confirmation` → `admin_confirm_payment`/`admin_reject_payment` | `thuythang.html:3373` | M (2h) |

### 8.2. Medium fixes (làm trong 1 tháng)

| # | Fix | Files | Effort |
|---|-----|-------|--------|
| M1 | Thêm INSERT `admin_audit_log` vào tất cả RPC admin cũ | `supabase-admin-migration.sql`, `supabase-payment-proof.sql` | S (1h) |
| M2 | Update retention policy: max 7 năm → cron auto-delete | `privacy.html:223`, new Apps Script trigger | M (3h) |
| M3 | Tạo `/tokushoho.html` (特定商取引法) | new file | S (1h) |
| M4 | Restrict Google Vision API key (HTTP referrers + quota) | Google Cloud Console UI | XS (15m) — anh tự click |
| M5 | Add `transaction_ref` unique index trong payment_confirmations | new migration `supabase-tx-ref-dedup.sql` | S (30m) |
| M6 | View `payment_audit_summary` để dispute query 1 row | new migration | S (30m) |

### 8.3. Low priority (nice-to-have)

| # | Fix | Notes |
|---|-----|-------|
| L1 | Redact `ai_raw_text` sender name | Regex |
| L2 | UI khách: indicator AI đang verify | UX |
| L3 | Cross-check bill date vs orders.created_at | 1 if condition |
| L4 | Telegram message redact PII (chỉ link + order #) | UX |
| L5 | Multi-admin permissions jsonb | future-proofing |

---

## 9. PRIORITIZED ACTION ITEMS — Tóm tắt cho anh

**Tuần này (CRITICAL — em recommend làm ngay):**
1. **Tạo issue trong tracking để fix C1-C5** — em có thể code Pull Request sẵn, anh review.
2. **Anh chạy SQL trong AUDIT-STORAGE-RLS.md Section B** để verify state thực của bucket `payment-proofs` → biết bucket public hay private → quyết định Option D.1 vs D.2.
3. **Anh add disclosure Google Cloud Vision vào privacy.html** (em sẽ viết draft, anh paste).

**Tháng này (MEDIUM):**
4. Migrate audit log coverage qua tất cả RPC.
5. Tạo 特定商取引法 page (法的要件 cho EC tại Nhật).
6. Restrict Vision API key trong Google Cloud Console.

**Long-term:**
7. Implement retention auto-delete (cron Apps Script chạy hàng tháng).
8. Plan multi-admin permissions trước khi hire staff đầu tiên.
9. Refund flow standardization.

---

## 10. APPENDIX — Files Audited

- `K:\bep-thuy-japan\SPEC-2-STEP-VERIFY.md`
- `K:\bep-thuy-japan\AUDIT-VERIFY-LAYERS.md`
- `K:\bep-thuy-japan\AUDIT-STORAGE-RLS.md`
- `K:\bep-thuy-japan\AUDIT-THANH-VIEN.md`
- `K:\bep-thuy-japan\AUDIT-IMAGE-DISPLAY.md`
- `K:\bep-thuy-japan\supabase-2-step-verify.sql`
- `K:\bep-thuy-japan\supabase-payment-proof.sql`
- `K:\bep-thuy-japan\supabase-ai-payment-verify.sql`
- `K:\bep-thuy-japan\supabase-admin-migration.sql`
- `K:\bep-thuy-japan\supabase-manual-approve-payment.sql`
- `K:\bep-thuy-japan\google-apps-script.js` (lines 1-200, 770-1058, 1860-2133, 2400-2460, 3050-3160)
- `K:\bep-thuy-japan\thuythang.html` (admin paths)
- `K:\bep-thuy-japan\thanh-vien.html` (lines 2680-2770)
- `K:\bep-thuy-japan\privacy.html`

**Audit method:** read-only file inspection + grep + cross-reference. Không SQL query thực + không HTTP probe (per safety: code chưa modify, schema chưa verify; recommendations đề xuất verification SQL để anh chạy).

**End of report.**
