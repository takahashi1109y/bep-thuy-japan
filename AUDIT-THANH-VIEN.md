# AUDIT REPORT — `thanh-vien.html`

**File:** `K:\bep-thuy-japan\thanh-vien.html`
**Lines:** 2,458
**Audit date:** 2026-05-02
**Auditor:** Claude (read-only audit, file unchanged)

Severity legend: 🔴 critical · 🟡 medium · 🟢 nice-to-have

---

## 1. Executive Summary — Top Issues

1. **🔴 BIG points-circle dominates dashboard top** (line 330) — 120×120px gold circle with "0 ĐIỂM" is the visual hero of the dashboard, pushing actual orders below the fold. This is exactly what anh wanted to remove (Amazon-style ordering experience instead).
2. **🔴 Duplicate Supabase request stack on slow connections** — RPC fast-path → fallback 5-query path → direct fetch fallback → cache fallback. ~280 lines of "just-in-case" code in `_loadDashboardImpl` (lines 1484–1796). Maintenance landmine.
3. **🔴 Form labels are NOT linked to inputs** — 25 `<label class="field-label">` exist, ZERO have `for=` attributes. Screen readers cannot associate labels with fields. Tap-on-label to focus also broken.
4. **🔴 ZERO accessibility attributes** — no `alt`, no `aria-label`, no `role`. Modals open without focus trap or `aria-modal`. Spinners are pure emoji.
5. **🟡 Dead `addr-mailbox` hidden input still wired up** (line 487, 1785, 1859, 1864, 1877) — comment says "removed" but read/write logic still runs. Cargo-cult code.
6. **🟡 Three full Japanese prefecture `<select>` blocks duplicated verbatim** (lines 173-183, 466-476, plus dropdowns elsewhere) — 47 prefectures × 2 = ~100 lines of duplicated markup. Should be templated/cloned in JS once.
7. **🟡 `target="_blank"` without `rel="noopener noreferrer"`** (line 552, PayPay link) — tabnabbing risk; also reduces mobile referer privacy.
8. **🟡 `alert()` / `confirm()` used 13 times** — blocking dialogs feel cheap on mobile, ignore the brand styling, can't be styled, and break flow.
9. **🟡 Hard-coded Apps Script URL appears twice** (lines 1308, 2165) — easy to forget to update one when rotating.
10. **🟢 Inline `<style>` + 50+ `style="…"` attributes** — Tailwind is already loaded; mix of inline CSS, inline styles, and utility classes makes the file hard to evolve.

---

## 2. Layout Issues

### 🔴 BIG points-circle dominates dashboard top — HIGHEST PRIORITY
- **Lines 330–333** (HTML) and **line 46** (CSS):
  ```html
  <div class="points-circle mb-3">
    <span class="text-white text-3xl font-bold" id="dash-points-big">0</span>
    <span class="text-white text-xs font-semibold opacity-80">ĐIỂM</span>
  </div>
  ```
  ```css
  .points-circle { width: 120px; height: 120px; border-radius: 50%; … }
  ```
- **Why it matters:** Anh đã nói rõ — anh muốn dashboard giống Amazon, đơn hàng (orders) phải nổi bật ngay khi user vào, không phải vòng tròn điểm to đùng. Hiện tại điểm đang chiếm "above the fold" của mobile.
- **Fix gợi ý:**
  - Thay welcome-banner thành 1 dòng mảnh: `Xin chào [Name] · 250 điểm` (chip nhỏ bên cạnh tên).
  - Đẩy thẳng tab "📦 Đơn Hàng" lên top thay vì sau welcome banner.
  - Hoặc: giữ điểm dạng pill 32×80px ở góc phải welcome bar, không phải vòng tròn 120×120 ở giữa.
- **Lines liên quan để xoá/chỉnh:** 327–335 (banner), 46 (CSS class), 769 (cache renderer cũng set element này), 1672 (live update).

### 🟡 Welcome banner chiếm 6+ dòng vertical space (line 327–335)
- Ba phần tử: "Xin chào", tên, vòng tròn điểm, chú thích "Cứ ¥100…". Trên iPhone SE (375×667) đẩy hết tabs xuống fold thứ 2.
- **Fix:** gộp thành 1 dòng `Xin chào [Name] · [points] điểm` + tooltip / `<details>` cho chú thích.

### 🟡 Dashboard tabs wrap thành 3 hàng trên mobile (line 338–346)
- 7 tabs với emoji + text dài (`📘 Hướng Dẫn Thanh Toán`, `📊 Điểm Thưởng`) — `flex-wrap` xuống 3 hàng ở <375px.
- **Fix:** dùng horizontal scroll (`overflow-x-auto whitespace-nowrap`) hoặc rút gọn nhãn (`📘 HD TT`, `📊 Điểm`) khi viewport < 480px.

### 🟢 Modal payment có `max-width: 440px` cứng (line 525)
- OK trên hầu hết màn nhưng `padding: 24px` + 6 hàng bank info có thể bị tràn ngang trên iPhone SE (375 - 32 padding = 343px nội dung khả dụng, hàng `12030-21684881` + button copy + label dễ vỡ layout).

---

## 3. Mobile Responsiveness (<375px breakpoints)

### 🔴 Form labels không link với inputs (xem mục Accessibility) — vô tình ảnh hưởng mobile vì user không thể tap-on-label để focus.

### 🟡 Grid 2-column cứng không stack ở narrow viewport
- **Lines 129, 154, 438, 591:** `style="grid-template-columns: repeat(2, minmax(0, 1fr));"`
- Trên màn hình <360px (Galaxy Fold đóng), 2 cột "Mật khẩu / Xác nhận" + 2 cột "Giới tính / Sinh nhật" bị nén. `minmax(0, 1fr)` không đủ — nên có `@media (max-width: 360px) { grid-template-columns: 1fr; }`.

### 🟡 Header "Top Bar" co lại không đẹp (line 317–324)
- `← Trang Chủ` + `🚪 Đăng Xuất` đều `px-4 py-2` text-sm. Trên ngang viewport hẹp + email dài → nút co quá → text wrap. Không có `whitespace-nowrap`.

### 🟡 Auth tab buttons (line 94–95): `flex-1 py-4 text-center text-sm`
- Khi tiếng Việt dài "Đăng Ký Mới" có thể wrap ngắt. Nên `whitespace-nowrap` + giảm padding.

### 🟢 Modal `max-height: 90vh; overflow-y: auto` (line 525) — OK nhưng modal lồng `payment-modal` đã có `overflow-y` ở wrapper line 524 + ở inner div 525 → 2 lớp scroll. Trên iOS dễ "scroll trap".

### 🟢 Bank account number row (line 565–568) có inline `letter-spacing: 2px` — có thể gây overflow ngang trên 320px viewport.

---

## 4. Dead Code

### 🔴 `addr-mailbox` hidden input đã "removed" nhưng logic vẫn còn
- **Line 486:** `<!-- Mailbox field removed — can be confused with Mã Bưu Điện (郵便番号) -->`
- **Line 487:** `<input id="addr-mailbox" type="hidden" value="">` — vẫn tồn tại
- **Line 1785:** `document.getElementById('addr-mailbox').value = profile?.mailbox || '';` — read
- **Line 1859, 1864, 1877:** ghi `mailbox` vào DB và localStorage
- **Fix:** xoá hẳn input + cả 4 reference. DB column `mailbox` có thể giữ migration nhưng không nên ghi mới.

### 🟡 Dead comment `// 2. Warmup auth đã đủ wake-up Supabase ở (1) — bỏ HEAD ping vì sb_publishable_* keys reject HEAD method (401)…` (line 680–682)
- IIFE gọi `getSession()` rồi không làm gì. Function tên là `warmupAll()` nhưng chỉ làm 1 thứ. Refactor để clear intent hoặc đổi tên `warmupAuth()`.

### 🟡 `_dashboardPrefetch` dead path (line 687, 695, 1545–1551)
- 2 nơi set `window._dashboardPrefetch`: line 695 (page load) + line 1193 (after login). Trong `_loadDashboardImpl` chỉ check 1 lần (line 1545) và set null. Nếu login flow chạy trước page-load IIFE timing, prefetch dư.
- Logic hợp lý nhưng dễ race; đáng có comment giải thích thứ tự.

### 🟢 Debug panel inline trong production HTML (line 363)
- `<div id="order-debug" class="hidden bg-gray-900 text-green-300 …">` chỉ hiện khi `?debug=1`. OK, nhưng làm DOM nặng thêm. Cân nhắc inject động khi có flag.

### 🟢 Comment `// >>> THAY ĐỔI 2 DÒNG NÀY SAU KHI TẠO PROJECT SUPABASE <<<` (line 652) — đã setup xong rồi, comment chỉ dẫn này không còn relevant.

### 🟢 Function `escapeHtmlMsg` (line 2443) định nghĩa local, nhưng `index.html` chắc chắn cũng có hàm tương tự — duplicate logic giữa các trang.

---

## 5. Broken Links / URL Issues

### 🟢 Tất cả internal href (kiểm tra) đều resolve đúng:
- `/` ✓
- `/huong-dan-thanh-vien` → file `huong-dan-thanh-vien.html` tồn tại ✓
- `/huong-dan-thanh-toan` → file `huong-dan-thanh-toan.html` tồn tại ✓
- `/#products` → assume index.html có anchor (chưa verify)
- `mailto:support@thuyjapan.com` (line 1178) — assume domain hoạt động

### 🟡 PayPay link (line 552) có `target="_blank"` nhưng KHÔNG có `rel="noopener noreferrer"`
- **Risk:** tabnabbing — trang đích có thể chiếm `window.opener`. Modern browsers có default cho `target=_blank` nhưng vẫn nên thêm cho rõ.
- **Fix:** `rel="noopener noreferrer"` + cân nhắc `referrerpolicy="no-referrer"`.

### 🟢 PayPay QR URL (lines 552, 2083) hardcode 2 lần `https://qr.paypay.ne.jp/p2p01_qxomK6ZT3vnW9RHW` — nên define const.

### 🟢 Apps Script URL (lines 1308, 2165) duplicated — define const at top.

---

## 6. Accessibility

### 🔴 ZERO `alt`, `aria-*`, `role` attributes trong toàn file
- Verified: 0 matches cho `alt=`, `aria-`, `role=`.
- **Impact:**
  - Modal payment (line 524) không có `role="dialog"` `aria-modal="true"` `aria-labelledby="pm-title"`.
  - Modal cancel (line 2228–2240) tương tự.
  - Spinner emoji `<span class="spin">⏳</span>` — screen reader đọc "hourglass" thay vì "loading".
  - Image preview `<img id="pm-preview">` (line 607) không có `alt`.
  - Button "✕" close (line 531) không có `aria-label="Đóng"`.

### 🔴 Form labels KHÔNG có `for=` attribute (25 labels, 0 linked)
- Verified: `label.*for=` returns 0.
- **Example fix line 101–102:**
  ```html
  <label class="field-label" for="login-email">Email</label>
  <input id="login-email" type="email" …>
  ```
- **Impact:** screen reader không announce label khi focus input. Tap-on-label không focus input. Thuộc WCAG 2.1 Level A failure.

### 🟡 Color contrast: `text-yellow-100` on red gradient (line 61)
- `text-yellow-100` (#FEF9C3) trên hero gradient `#2C1A0E → #C8102E` — tại điểm sáng nhất (right side, light red C8102E) contrast ratio ~3.2:1, dưới WCAG AA 4.5:1 cho normal text. OK cho large text (3:1) nhưng `text-base` không phải large.

### 🟡 Tab buttons không có `role="tab"` `aria-selected` (lines 94–95, 339–345)
- Khách dùng VoiceOver/TalkBack không biết đây là tabset.

### 🟡 `details/summary` (line 149–195) là native A11Y-friendly, nhưng inside chứa form fields — khi `<details>` đóng, inputs vẫn focusable bằng Tab nhưng invisible. Nên `tabindex="-1"` khi đóng (hoặc dùng JS).

### 🟢 Hero `<a href="/">` wrap cả `<section>` (line 52–64) — toàn bộ hero là link. Screen reader đọc rất dài "Bếp Thuỷ Japan Thành Viên Đăng nhập…" thành 1 link. Nên thu nhỏ link area.

### 🟢 Lang attribute `<html lang="vi">` (line 2) — OK, nhưng các đoạn tiếng Nhật (prefecture names line 173-183) nên có `<span lang="ja">` để screen reader đọc đúng phonetically.

---

## 7. Performance

### 🟡 Inline `<script>` ~1800 lines (lines 648–2453)
- Toàn bộ dashboard logic inline — không cache được giữa các page loads. `index.html` chắc cũng có code tương tự (auth state) → duplicate download.
- **Fix:** extract sang `/assets/thanh-vien.js` (defer load), share với `index.html` qua module nhỏ.

### 🟡 Blocking external scripts:
- **Line 633** `qrcode.min.js` — **không có `defer`**, blocks render. Chỉ cần khi mở payment modal → nên lazy load.
- **Line 645** `supabase-js@2` — không có `defer`/`async`, ở cuối body nên OK nhưng vẫn parse-blocks.
- **Fix:** thêm `defer` cho cả 2; hoặc dynamic-import QRCode khi mở modal.

### 🟢 Multiple `setTimeout` cascades (line 755, 690, 935 etc.) — micro-orchestration phức tạp; profile xem có giảm được không.

### 🟢 50 inline `style="…"` attributes — bytes wise nhỏ nhưng ngăn CSS caching và mid-flight CSP `style-src` whitelist.

### 🟢 No image optimization concerns vì page dùng emoji thay icon — tốt cho payload nhưng bad cho A11Y.

---

## 8. UX Issues

### 🟡 Empty state cho Orders không nổi bật
- **Line 800, 1723:** `<p class="text-gray-400 text-sm text-center py-4">Chưa có đơn hàng nào. <a href="/#products" class="text-brand-red underline">Đặt hàng ngay</a></p>`
- Anh muốn Amazon-style → empty state nên là card lớn với illustration + CTA "Bắt đầu mua sắm" thay vì 1 dòng text mờ.

### 🟡 Tab loading states không nhất quán
- Tab Orders có spinner (line 1443, 1505).
- Tab Messages: gọi `loadMessages()` (line 1447) nhưng không show loading state — `box.innerHTML` chỉ update khi có response → user thấy "Chưa có tin nhắn nào" rồi mới thấy data load → flicker.
- Tab Points: data load chung với Orders (RPC), nhưng nếu user switch sang trước khi `loadDashboard()` xong → empty state.
- **Fix:** mỗi panel có skeleton loader riêng.

### 🟡 Error handling visibility — `alert()` cho mọi lỗi (13 chỗ)
- Lines 1128, 1137, 1333, 1911, 1915, 1928, 1998, 2028, 2091, 2189, 2340, 2381 — `alert()` hoặc `confirm()`.
- Trên iOS, alert sheet che hero, không match brand. Lỗi về thanh toán cần copy-able để user gửi support.
- **Fix:** dùng toast/banner trong-page (đã có pattern ở `showWelcomeClaimError` line 1035 — nhân rộng pattern này).

### 🟡 Form validation feedback
- Lỗi hiện ở box ngay trên button (lines 108, 197, 295). OK nhưng:
  - **No live validation** — chỉ check khi click submit.
  - **No success indicator per-field** — password match check chỉ hiện sau submit.
  - **Phone validation thiếu** (line 1240) — chỉ check `!phone`, không validate format Japan (080-XXXX-XXXX).

### 🟡 Confusing copy / mixed terms
- "Tích điểm 1%" (line 81) vs "Cứ ¥100 mua hàng = 1 điểm" (line 334) — cùng nghĩa nhưng diễn đạt khác. User có thể confuse.
- "Bội số 50 (50, 100, 150…)" (line 334) vs `min="500"` ở redeem form (line 375) — text nói 50 OK nhưng UI ép 500.
- "📦 Đơn Hàng" tab vs "📦 Lịch Sử Mua Hàng" h4 (line 351) — nhất quán đặt tên.

### 🟡 Birthday lock UX (line 449, 1773–1778)
- Sau khi user nhập birthday lần đầu, field lock vĩnh viễn. Không có cảnh báo TRƯỚC KHI lưu — user có thể nhập sai và không sửa được.
- **Fix:** confirm dialog "Anh/chị chỉ được nhập sinh nhật 1 lần. Tiếp tục?" trước khi save.

### 🟢 "Đăng Xuất" xuất hiện 2 lần — top bar (line 321) và bottom (line 512). Redundant.

### 🟢 Resend confirm email button (line 1133): unlock sau 60s nhưng text vẫn "✅ Đã gửi! Kiểm tra email" → nếu click 2 lần user nghĩ không ăn.

### 🟢 PayPay "Mở App" button (line 552) chỉ hiện trên mobile có app cài; trên desktop link sẽ mở web → text "Mở PayPay App" misleading desktop user.

---

## 9. Security Concerns

### 🟡 SUPABASE_ANON key exposed (line 654)
- `const SUPABASE_ANON = 'sb_publishable_…'` — đây là **publishable key** nên được expose là OK theo design Supabase. Nhưng phụ thuộc 100% vào RLS policies ở DB. Nếu RLS policy có lỗ hổng (vd: `select *` không có user_id check) → ai cũng đọc được data.
- **Action:** verify RLS policies trong Supabase project — không phải vấn đề HTML, nhưng nhắc anh check.

### 🟡 hCaptcha sitekey exposed (line 655) — OK, là public key, không phải secret. Just FYI.

### 🟡 Apps Script URL exposed (lines 1308, 2165)
- `script.google.com/macros/s/AKfycbz38j2…/exec` — nếu script không validate request body / không có rate limit → attacker có thể spam endpoint với fake "member" registrations làm noise vào Google Sheet.
- **Action:** thêm shared-secret header trong Apps Script `doPost(e)`, reject nếu không có.

### 🔴 hCaptcha "fail open" (lines 736, 738)
- **Line 736:** `setTimeout(() => { if (_captchaResolve === resolve) { _captchaResolve = null; resolve(''); } }, 60000);`
- Nếu hCaptcha hang/fail, code resolve với token rỗng `''`. Comment line 728 nói "Supabase will reject" — đúng, nhưng nếu Supabase có bug hoặc captcha enforcement tắt → bot vào được.
- **Fix:** reject promise thay vì resolve(''), force user thấy error rõ ràng.

### 🟡 `localStorage` chứa PII (lines 1302, 1354, 1789–1794)
- Email, name, phone, address all stored unencrypted in localStorage.
- **Risk:** XSS attacker (nếu HTML có XSS hole) → exfiltrate hết trong 1 line JS.
- **Fix:** chỉ cache những trường tối thiểu cần cho UI; nhạy cảm như phone/address load on-demand từ Supabase.

### 🟡 `innerHTML` với user-controlled data
- **Line 1736:** `${h.description || (h.order_no ? 'Đơn #' + h.order_no : '')}` — `description` từ DB. Nếu DB bị compromise hoặc admin nhập HTML → XSS.
- **Line 1755:** `${c.code}`, `${c.value.toLocaleString()}` — code từ DB, nếu admin viết `<script>` code vào sẽ exec.
- **Line 815–816:** `${i.name}${i.size ? ' ('+i.size+')' : ''}` items render trực tiếp.
- **Fix:** dùng `textContent` hoặc escape — pattern `escapeHtmlMsg` (line 2443) đã có sẵn, nên áp cho mọi `innerHTML` chứa DB data.

### 🟢 No CSRF concern vì Supabase JWT là Authorization header (không cookie).

### 🟢 No exposed admin paths trong file này.

### 🟢 PayPay `target="_blank"` thiếu `rel="noopener"` — đã đề cập ở mục 5.

---

## 10. Code Smells

### 🟡 `_loadDashboardImpl` — 312 lines (line 1484–1796)
- Function quá dài, lẫn 4 paths (cache → RPC fast → fallback queries → direct fetch → cache fallback). Khó test, khó debug.
- **Fix:** tách thành:
  - `fetchDashboardData(uid)` — return data normalized
  - `renderDashboard(data)` — pure render
  - `cacheDashboard(data)` — persist

### 🟡 `submitPaymentProof` — 88 lines (line 2112–2199) — OK borderline.

### 🟡 `cancelMyOrder` — 113 lines (line 2220–2333), inline DOM creation với innerHTML khổng lồ
- HTML template inline, magic styles inline, 2 click handlers in JS. Tách ra `<template>` element hoặc utility function `createDialog(opts)`.

### 🟡 Magic numbers throughout
- `30 * 60 * 1000` (line 829) — 30-minute cancel window
- `8000`, `6000`, `20000` (lines 1615, 1632, 1516) — timeouts
- `100000`, `10000000` (lines 2123–2124) — file size limits 100KB/10MB
- `500`, `100` (line 375, 1676) — redeem minimum
- `60000` (line 736, 1133) — 60s captcha/resend cooldown
- **Fix:** hoist thành constants ở top: `const CANCEL_WINDOW_MS = 30 * 60 * 1000;`

### 🟡 Inconsistent naming — Vietnamese + English variables mixed
- `currentUser`, `currentProfile` (English), nhưng comments "BUOC 1: Render tu cache truoc" (Vietnamese unicode-stripped). Hard to grep.
- ID prefixes: `dash-`, `prof-`, `addr-`, `pw-`, `pm-`, `reg-`, `forgot-`, `reset-pw-` — 8 prefixes, không có pattern (single letter vs multi). Standardize.

### 🟡 Duplicate prefecture `<select>` blocks
- Lines 173-183 (registration) and 466-476 (address) — IDENTICAL 47-prefecture markup × 2. ~10 lines × 2 = 20 lines duplicated.
- **Fix:** define once as JS const + populate via `.innerHTML` on init.

### 🟡 Duplicate `?tab=` URL param handling (lines 935–940 và 1214–1219) — same code in `init()` và `doLogin()`.

### 🟡 Mixed CSS approach
- Tailwind classes (`bg-white rounded-2xl`)
- Custom CSS in `<style>` (`.points-circle`, `.dash-tab`)
- Inline `style="…"` (50 instances)
- 3 sources of truth → khó maintain. Choose 1 (Tailwind preferred).

### 🟢 81 instances of `getElementById('...')` — không cache, lookup mỗi lần. Cân nhắc cache hot elements.

### 🟢 Comments mix tiếng Việt unaccented (`THAY ĐỔI`, `BUOC 1`) và có dấu (`// 2. Warmup auth đã đủ wake-up`). Standardize charset.

---

## 11. Internationalization

### 🟢 Mixed Vietnamese / Japanese / English — **intentional for target audience**
- Vietnamese diaspora in Japan → cần thấy cả 3 ngôn ngữ:
  - VN UI text (Đăng Nhập, Lịch Sử Mua Hàng) ✓
  - JP system terms (郵便番号, 振込人名義, 普通) ✓
  - EN technical (Postal Code, Email) ✓
- Confirmed appropriate for product market.

### 🟡 Missing `lang` annotations on Japanese segments
- Prefecture names line 173-183: `<option value="北海道">北海道 - Hokkaido</option>` — no `lang="ja"`. Screen reader đọc kanji bằng giọng VN (gibberish).
- Bank info line 563-568: `支店名`, `口座番号` — same issue.
- **Fix:** wrap Japanese text trong `<span lang="ja">` hoặc set `lang="ja"` trên `<optgroup>` chứa kanji.

### 🟢 "Hạnh phúc là được ăn ngon" footer (line 638) trong italic yellow — no fallback nếu font không load. Browser fallback OK.

### 🟢 Date formatting dùng `'ja-JP'` locale (line 812, 1732, 1751, 2414) — nhất quán, hợp với target market (Vietnamese living in Japan).

---

## 12. Prioritized Fix Queue (Top 10)

| # | Severity | Description | Lines | Effort |
|---|----------|-------------|-------|--------|
| 1 | 🔴 | **Shrink/remove BIG points-circle**, promote orders panel to top of dashboard | 327-335, 46 | M |
| 2 | 🔴 | **Add `for=` attribute** to all 25 form labels (or wrap input inside label) | 101, 104, 126, 131, 135, 140, 144, 156, 165, 170, 186, 189, 248, 288, 292, 427, 431, 435, 440, 449, 463, 479, 482, 498, 502 | S |
| 3 | 🔴 | **Add ARIA to modals** — `role="dialog"`, `aria-modal="true"`, focus trap on payment-modal & cancel-dialog | 524, 2228 | M |
| 4 | 🔴 | **Escape DB data in innerHTML** — apply `escapeHtmlMsg` to order items, coupon codes, points history descriptions | 815-816, 818-822, 1736, 1754-1755 | S |
| 5 | 🔴 | **Tighten hCaptcha fail-open** — reject promise on timeout instead of resolving with empty token | 730-738 | S |
| 6 | 🟡 | **Remove dead `addr-mailbox`** input + read/write code | 487, 1785, 1859, 1864, 1877 | XS |
| 7 | 🟡 | **Replace `alert()` with toast pattern** already in `showWelcomeClaimError` | 13 sites | M |
| 8 | 🟡 | **Add `rel="noopener noreferrer"`** to PayPay external link | 552 | XS |
| 9 | 🟡 | **Hoist magic numbers** (30 min, 500 points, file sizes, timeouts) to constants block | scattered | S |
| 10 | 🟡 | **Extract `_loadDashboardImpl` 312-line function** into smaller pure functions for maintainability | 1484-1796 | L |

**Effort:** XS=10min, S=30min-1h, M=1-3h, L=half day+

---

## Appendix: Quick wins (<5 min each)

- Line 487: delete dead `addr-mailbox` input
- Line 552: add `rel="noopener noreferrer"`
- Line 654 comment: remove obsolete `>>> THAY ĐỔI 2 DÒNG NÀY <<<` instruction
- Lines 1308 & 2165: define `const APPS_SCRIPT_URL = '…'` once
- Line 633: add `defer` to qrcode CDN script
- Line 645: add `defer` to supabase CDN script
- Lines 174-183 & 467-476: extract prefecture options to JS const, populate dynamically

---

*End of audit. Total: 64 distinct findings across 10 categories.*
