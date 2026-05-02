# TEST PLAN: 2-Step Verify Flow — Bếp Thuỷ Japan

**Version:** 1.0
**Date:** 2026-05-02
**Scope:** End-to-end QA cho luồng xác minh thanh toán 2 bước (AI + Admin)
**Tester:** Anh Thắng (manual) hoặc QA agent (semi-auto)
**Environment:** Production (https://bepthuyjapan.com) hoặc Staging
**Pre-requisites:**
- Supabase project với schema đã migrate (bảng `orders`, `admin_audit_log`, RLS bật)
- Edge function `verify-payment` đã deploy với 8 layers AI
- Apps Script email service đã chạy
- Telegram bot token + chat ID configured
- Admin account: `thanghoang1109@gmail.com`
- Customer test account riêng (Gmail khác)

---

## Status Legend

| Status | Meaning |
|---|---|
| `pending_payment` | Khách chưa upload bill |
| `customer_paid` | AI đã pass — chờ admin xác nhận lần 2 |
| `pending_manual_review` | AI fail 2 lần — khách bấm "Gửi admin xem" |
| `confirmed` | Admin đã xác nhận lần 2 |
| `cancelled` | Admin từ chối |

---

## Test Data Fixtures

**Bills hợp lệ (AI sẽ pass):**
- `K:\bep-thuy-japan\fixtures\paypay-valid-1.jpg` — số tiền khớp, mã giao dịch rõ
- `K:\bep-thuy-japan\fixtures\paypay-valid-2.jpg` — biến thể UI mới của PayPay

**Bills lỗi (AI sẽ reject):**
- `K:\bep-thuy-japan\fixtures\paypay-bad-amount.jpg` — sai số tiền (Layer 4 fail)
- `K:\bep-thuy-japan\fixtures\paypay-blurry.jpg` — mờ không đọc được (Layer 2 fail)
- `K:\bep-thuy-japan\fixtures\paypay-screenshot-of-screenshot.jpg` — ảnh chụp lại (Layer 7 fail)

**Test orders pre-seed:**
- Order A: amount=3500, status=`pending_payment`
- Order B: amount=5200, status=`pending_payment`
- Order C: amount=8000, status=`pending_payment`

---

## TC01 — Happy Path (AI pass + Admin confirm)

**Mục tiêu:** Verify luồng "thuận buồm xuôi gió" — khách upload bill chuẩn, AI pass tất cả 8 layers, admin xác nhận lần 2 trong modal.

### Setup
1. Tạo order test với `order_no=TEST-A-001`, `amount=3500`, `status=pending_payment`
2. Đảm bảo `payment_confirmation` field NULL
3. Mở 2 browser:
   - **Browser 1 (Customer):** incognito, đăng nhập tài khoản khách
   - **Browser 2 (Admin):** đăng nhập `thanghoang1109@gmail.com` vào trang admin

### Steps
1. **[Customer]** Vào trang đơn hàng, click "Upload xác nhận thanh toán"
2. **[Customer]** Chọn file `paypay-valid-1.jpg` → click Submit
3. **[Customer]** Chờ AI verify (~5-10s) — quan sát loading spinner
4. **[Customer]** Kiểm tra UI hiện thông báo "Đã xác nhận tự động — chờ admin xác nhận lần 2"
5. **[Admin]** Refresh trang admin → tìm order TEST-A-001 trong tab "Chờ xác nhận"
6. **[Admin]** Click vào order → modal mở
7. **[Admin]** Verify ảnh bill hiển thị trong modal (không bị broken)
8. **[Admin]** Click button "✅ Xác nhận lần 2"
9. **[Admin]** Prompt hiện ra → nhập notes: "Đã kiểm tra OK, khớp PayPay"
10. **[Admin]** Click OK

### Expected Results
- Sau Step 4: `orders.status='customer_paid'`, `payment_confirmation` chứa URL ảnh
- Sau Step 7: `<img>` element load thành công (network 200, không 404)
- Sau Step 10:
  - `orders.status='confirmed'`
  - `orders.confirmed_by='thanghoang1109@gmail.com'`
  - `orders.confirmed_at=<now>`
  - `orders.confirm_notes='Đã kiểm tra OK, khớp PayPay'`
  - 1 row mới trong `admin_audit_log` với `action='confirm_payment'`, `order_id=TEST-A-001`
- Modal close, order biến mất khỏi sub-tab "Chờ xác nhận", xuất hiện ở "Đã xác nhận"

### Screenshots
- [ ] `screenshots/tc01-customer-upload.png`
- [ ] `screenshots/tc01-admin-modal-image.png`
- [ ] `screenshots/tc01-confirm-prompt.png`
- [ ] `screenshots/tc01-audit-log-row.png`

### Common Pitfalls
- **Pitfall 1:** AI có thể fail random nếu Vision API rate-limited → retry sau 30s
- **Pitfall 2:** Modal không hiện ảnh nếu Storage RLS block → kiểm tra signed URL có hợp lệ không
- **Pitfall 3:** Audit log có thể không insert nếu RPC `confirm_payment_v2` chưa được deploy — verify bằng `SELECT * FROM admin_audit_log WHERE order_id='TEST-A-001'`
- **Pitfall 4:** Browser cache cũ — hard refresh Ctrl+Shift+R sau mỗi step

---

## TC02 — AI Fail Then Submit-Anyway

**Mục tiêu:** Verify luồng fallback khi AI từ chối — khách fail 2 lần thì button "Gửi admin xem" mới xuất hiện, đồng thời trigger email + Telegram + browser notification.

### Setup
1. Tạo order `TEST-B-002`, `amount=5200`, `status=pending_payment`
2. Admin browser tab phải đang focus (để test browser notification)
3. Telegram chat của anh phải subscribe bot

### Steps
1. **[Customer]** Upload `paypay-bad-amount.jpg` lần 1 → AI fail Layer 4 (số tiền không khớp)
2. **[Customer]** UI hiện error message + button "Thử lại"
3. **[Customer]** Verify button "Gửi admin xem" CHƯA xuất hiện (mới fail 1 lần)
4. **[Customer]** Upload lại `paypay-bad-amount.jpg` lần 2 → AI fail lại
5. **[Customer]** Verify button "📋 Gửi admin xem" XUẤT HIỆN
6. **[Customer]** Click "📋 Gửi admin xem"
7. **[Customer]** Confirm dialog → click OK
8. **[Admin]** Quan sát:
   - Telegram: tin nhắn alert đến bot
   - Email inbox `thanghoang1109@gmail.com`: email mới subject "[BTJ] Đơn cần xem xét: TEST-B-002"
   - Browser tab admin: notification popup (nếu permission đã grant)
9. **[Admin]** Vào sub-tab "🚨 Cần xem xét"

### Expected Results
- Sau Step 1-4: `orders.ai_attempt_count` increment từ 0 → 2
- Sau Step 7:
  - `orders.status='pending_manual_review'`
  - `orders.manual_review_requested_at=<now>`
  - `orders.payment_confirmation` chứa URL ảnh cuối cùng
- Telegram message format:
  ```
  🚨 Đơn TEST-B-002 cần xem xét
  Khách: <name>
  Số tiền: ¥5,200
  Lý do AI từ chối: Số tiền không khớp
  Link: https://bepthuyjapan.com/admin?order=TEST-B-002
  ```
- Email gửi đến admin trong vòng 60s (Apps Script)
- Browser notification fire khi tab focus
- Order TEST-B-002 xuất hiện trong sub-tab "🚨 Cần xem xét" với CSS class `row-red` + animation `pulse`

### Screenshots
- [ ] `screenshots/tc02-ai-fail-attempt-1.png`
- [ ] `screenshots/tc02-ai-fail-attempt-2-button-visible.png`
- [ ] `screenshots/tc02-telegram-alert.png`
- [ ] `screenshots/tc02-email-alert.png`
- [ ] `screenshots/tc02-browser-notification.png`
- [ ] `screenshots/tc02-red-row-pulse.png`

### Common Pitfalls
- **Pitfall 1:** Button "Gửi admin xem" có thể xuất hiện sai timing nếu state `ai_attempt_count` không lưu vào DB — verify bằng query
- **Pitfall 2:** Telegram fail im lặng nếu bot bị block hoặc token sai — check Edge function logs
- **Pitfall 3:** Browser notification chỉ hoạt động khi user đã grant permission — kiểm tra `Notification.permission === 'granted'`
- **Pitfall 4:** Email có thể bị Gmail filter vào Promotions — kiểm tra cả Spam folder
- **Pitfall 5:** Pulse animation bị tắt nếu user có `prefers-reduced-motion: reduce` — test thêm trên thiết bị khác

---

## TC03 — Admin Confirms manual_review

**Mục tiêu:** Sau khi đơn vào status `pending_manual_review`, admin xác nhận bằng tay → đơn chuyển thành `confirmed` và auto gửi email cho khách.

### Setup
1. Pre-seed order `TEST-C-003`, `status=pending_manual_review`, `manual_review_requested_at=<2 hours ago>`
2. Admin đăng nhập, mở sub-tab "🚨 Cần xem xét"

### Steps
1. **[Admin]** Click vào order TEST-C-003 → modal mở
2. **[Admin]** Verify ảnh bill hiển thị
3. **[Admin]** Click "✅ Xác nhận"
4. **[Admin]** Nhập notes (optional): "OK, đã chuyển khoản đúng"
5. **[Admin]** Click OK
6. **[Customer]** Check Gmail của khách

### Expected Results
- Sau Step 5:
  - `orders.status='confirmed'`
  - `orders.confirmed_by='thanghoang1109@gmail.com'`
  - `orders.confirmed_at=<now>`
  - 1 row mới trong `admin_audit_log` với `action='confirm_manual_review'`
- Email gửi đến khách trong 60s, subject: "[Bếp Thuỷ Japan] Đơn TEST-C-003 đã xác nhận — đang chuẩn bị giao"
- Email body có order details, số tiền, ETA giao
- Order biến mất khỏi sub-tab "🚨 Cần xem xét"

### Screenshots
- [ ] `screenshots/tc03-confirm-button.png`
- [ ] `screenshots/tc03-customer-email.png`
- [ ] `screenshots/tc03-status-confirmed.png`

### Common Pitfalls
- **Pitfall 1:** Customer email field có thể NULL → email send fail. Pre-validate trước khi confirm
- **Pitfall 2:** Apps Script quota hết (100/day free tier) → cron job send email có thể delay
- **Pitfall 3:** Race condition nếu khách đang upload bill mới ngay lúc admin confirm

---

## TC04 — Admin Rejects manual_review

**Mục tiêu:** Admin từ chối đơn với lý do, status chuyển `cancelled`, khách nhận email hướng dẫn refund.

### Setup
1. Pre-seed order `TEST-D-004`, `status=pending_manual_review`
2. Admin đăng nhập

### Steps
1. **[Admin]** Mở modal order TEST-D-004
2. **[Admin]** Click "❌ Từ chối"
3. **[Admin]** Prompt hiện ra: "Lý do từ chối?"
4. **[Admin]** Nhập: "Số tiền không khớp"
5. **[Admin]** Click OK
6. **[Customer]** Check Gmail

### Expected Results
- Sau Step 5:
  - `orders.status='cancelled'`
  - `orders.cancel_reason='Số tiền không khớp'`
  - `orders.cancelled_by='thanghoang1109@gmail.com'`
  - `orders.cancelled_at=<now>`
  - 1 row mới trong `admin_audit_log` với `action='reject_manual_review'`, `notes='Số tiền không khớp'`
- Email gửi đến khách subject: "[Bếp Thuỷ Japan] Đơn TEST-D-004 không thể xác nhận — hướng dẫn xử lý"
- Email body có:
  - Lý do từ chối
  - Hướng dẫn refund (hoặc upload lại bill đúng)
  - Contact LINE/Zalo của shop

### Screenshots
- [ ] `screenshots/tc04-reject-button.png`
- [ ] `screenshots/tc04-reason-prompt.png`
- [ ] `screenshots/tc04-customer-refund-email.png`

### Common Pitfalls
- **Pitfall 1:** Reason để trống → vẫn cancel được nhưng audit log thiếu thông tin. Validate non-empty trong RPC
- **Pitfall 2:** Khách có thể đã chuyển khoản thật nhưng upload sai bill → email refund phải có hotline để khách phản hồi
- **Pitfall 3:** Cancel rồi không thể rollback → cảnh báo admin trước khi confirm

---

## TC05 — Image Display in Modal

**Mục tiêu:** Verify ảnh bill load đúng cho cả 3 path scheme (cũ, mới, edge cases).

### Setup
- Order E1: `payment_confirmation='auto/2025/12/old-path-image.jpg'` (path cũ)
- Order E2: `payment_confirmation='https://<project>.supabase.co/storage/v1/object/public/bills/2026/05/new-path.jpg'` (full URL mới)
- Order E3: `payment_confirmation='bills/manual/2026/05/uploaded-by-admin.jpg'` (relative path mới)

### Steps
1. **[Admin]** Mở modal order E1 → verify ảnh load
2. **[Admin]** Click vào ảnh → lightbox mở (overlay full-screen)
3. **[Admin]** Press ESC → lightbox close
4. **[Admin]** Mở modal order E2 → verify ảnh load
5. **[Admin]** Click ảnh → lightbox
6. **[Admin]** Mở modal order E3 → verify ảnh load
7. **[Admin]** Right-click ảnh → "Open in new tab" → URL hợp lệ

### Expected Results
- Tất cả 3 ảnh đều load (network 200)
- Lightbox mở/đóng smooth
- Old `auto/*` path resolve qua signed URL helper
- New full URL render trực tiếp
- New relative path resolve qua bucket prefix

### Screenshots
- [ ] `screenshots/tc05-old-path-image.png`
- [ ] `screenshots/tc05-new-fullurl-image.png`
- [ ] `screenshots/tc05-lightbox-open.png`

### Common Pitfalls
- **Pitfall 1:** CORS error nếu bucket không public hoặc signed URL hết hạn — check console
- **Pitfall 2:** Lightbox z-index xung đột với modal — verify visual không bị che
- **Pitfall 3:** Mobile: pinch-zoom có thể bị disable trong lightbox — kiểm tra CSS `touch-action`
- **Pitfall 4:** ESC trong lightbox close cả modal lẫn lightbox — chỉ nên close lightbox

---

## TC06 — Status Filter Sub-tab

**Mục tiêu:** Sub-tab "🚨 Cần xem xét" chỉ filter `pending_manual_review`, count badge chính xác, animation pulse hoạt động.

### Setup
1. Pre-seed:
   - 3 orders status=`pending_manual_review`
   - 2 orders status=`customer_paid`
   - 1 order status=`confirmed`

### Steps
1. **[Admin]** Vào trang admin → quan sát badge cạnh tab "🚨 Cần xem xét"
2. **[Admin]** Click vào sub-tab
3. **[Admin]** Verify chỉ 3 orders hiển thị
4. **[Admin]** Verify mỗi row có CSS class red/pulse
5. **[Admin]** Confirm 1 order (TC03) → quay lại sub-tab
6. **[Admin]** Verify badge giảm 3 → 2

### Expected Results
- Badge số: 3 (initial), giảm về 2 sau confirm
- List view hiển thị đúng 3 orders, sort theo `manual_review_requested_at` DESC
- Mỗi row có CSS animation `pulse 2s infinite` (kiểm tra DevTools → Elements → Computed styles)
- Orders status khác KHÔNG hiển thị trong sub-tab này

### Screenshots
- [ ] `screenshots/tc06-badge-count.png`
- [ ] `screenshots/tc06-red-rows.png`
- [ ] `screenshots/tc06-after-confirm.png`

### Common Pitfalls
- **Pitfall 1:** Badge count không realtime — phải refresh hoặc dùng Supabase realtime subscription
- **Pitfall 2:** Pulse animation drain CPU nếu nhiều rows — limit max 50 rows visible
- **Pitfall 3:** Filter query có thể bỏ sót status nếu enum column thay đổi — sync với DB schema

---

## TC07 — Banner on Dashboard

**Mục tiêu:** Banner cảnh báo trên dashboard khi có đơn cần review, click "Xem ngay" navigate đến đúng tab, auto-refresh 30s.

### Setup
1. Pre-seed N=5 orders status=`pending_manual_review`
2. Admin login → vào trang dashboard (NOT trang orders)

### Steps
1. **[Admin]** Quan sát top banner trên dashboard
2. **[Admin]** Verify text: "🚨 Có 5 đơn cần xem xét"
3. **[Admin]** Click "Xem ngay" button
4. **[Admin]** Verify URL navigate sang trang orders, sub-tab "Cần xem xét" active
5. **[Admin]** Quay lại dashboard → trong vòng 30s, pre-seed thêm 1 order pending_manual_review
6. **[Admin]** Đợi auto-refresh (30s) → banner update thành 6

### Expected Results
- Banner hiển thị đúng số N=5
- Click "Xem ngay" → navigation đúng đích
- Auto-refresh interval 30s (verify trong DevTools → Network → Fetch tab)
- Khi N=0, banner ẩn hoàn toàn (display:none hoặc DOM removed)

### Screenshots
- [ ] `screenshots/tc07-banner-5.png`
- [ ] `screenshots/tc07-after-click.png`
- [ ] `screenshots/tc07-banner-6-after-refresh.png`

### Common Pitfalls
- **Pitfall 1:** Auto-refresh interval có thể accumulate nếu `setInterval` không clean up trên unmount — verify không có duplicate fetch
- **Pitfall 2:** Banner spam nếu N > 99 — clamp về "99+"
- **Pitfall 3:** Click "Xem ngay" trong khi đang ở trang orders → no-op? Phải scroll đến tab và highlight

---

## TC08 — Audit Log Integrity

**Mục tiêu:** Mọi confirm/reject đều có row trong `admin_audit_log`, không thể xoá (RLS), query history hoạt động.

### Setup
1. Tạo 5 orders, thực hiện 5 actions:
   - 2x confirm `customer_paid` → `confirmed`
   - 1x confirm `pending_manual_review` → `confirmed`
   - 1x reject `pending_manual_review` → `cancelled`
   - 1x edit notes (nếu có UI)
2. Admin đăng nhập Supabase SQL editor

### Steps
1. **[SQL]** Query: `SELECT COUNT(*) FROM admin_audit_log WHERE created_at > NOW() - INTERVAL '1 hour'`
2. **[SQL]** Query: `SELECT * FROM admin_audit_log WHERE order_id='TEST-A-001' ORDER BY created_at`
3. **[SQL]** Try DELETE: `DELETE FROM admin_audit_log WHERE id=<row_id>` (as authenticated user)
4. **[SQL]** Verify mỗi row có đủ: `id, order_id, action, actor_email, notes, created_at, payload (jsonb)`

### Expected Results
- Step 1: count >= 5
- Step 2: trả về full lịch sử order TEST-A-001 theo timeline
- Step 3: ERROR — RLS block DELETE (`new row violates row-level security policy`)
- Step 4: tất cả columns không NULL (trừ `notes` có thể NULL)

### Screenshots
- [ ] `screenshots/tc08-audit-rows.png`
- [ ] `screenshots/tc08-rls-deny.png`

### Common Pitfalls
- **Pitfall 1:** Service role key có thể bypass RLS — chỉ test với anon/authenticated key
- **Pitfall 2:** `payload` JSONB schema không consistent giữa các action types — chuẩn hoá schema
- **Pitfall 3:** Audit log có thể grow rất nhanh — cần partition theo tháng nếu > 100k rows

---

## TC09 — Edge: Order Older Than 7 Days in manual_review

**Mục tiêu:** Đơn quá hạn (>7 ngày) ở status `pending_manual_review` phải highlight cảnh báo và banner show breakdown by age.

### Setup
1. Pre-seed:
   - 2 orders `pending_manual_review`, `manual_review_requested_at = NOW() - INTERVAL '8 days'` (quá hạn)
   - 1 order `pending_manual_review`, `manual_review_requested_at = NOW() - INTERVAL '3 days'` (chưa quá)
   - 1 order `pending_manual_review`, `manual_review_requested_at = NOW() - INTERVAL '1 day'` (mới)

### Steps
1. **[Admin]** Vào sub-tab "🚨 Cần xem xét"
2. **[Admin]** Verify 2 orders quá hạn có CSS extra class (e.g. `row-overdue`) — màu đỏ đậm hơn
3. **[Admin]** Verify mỗi row overdue có badge "⚠️ Quá hạn xử lý" + số ngày
4. **[Admin]** Vào dashboard → quan sát banner

### Expected Results
- 2 orders quá hạn highlight đậm hơn (visual differentiation rõ)
- Tooltip/badge: "Quá hạn 1 ngày", "Quá hạn 1 ngày" (8-7=1)
- Banner trên dashboard breakdown:
  ```
  🚨 Có 4 đơn cần xem xét
     • 2 đơn quá hạn (>7 ngày)
     • 1 đơn chờ 3-7 ngày
     • 1 đơn mới (<3 ngày)
  ```

### Screenshots
- [ ] `screenshots/tc09-overdue-rows.png`
- [ ] `screenshots/tc09-banner-breakdown.png`

### Common Pitfalls
- **Pitfall 1:** Timezone mismatch — server UTC vs client JST có thể lệch tính ngày. Dùng `created_at AT TIME ZONE 'Asia/Tokyo'`
- **Pitfall 2:** Threshold 7 ngày nên configurable trong env, không hardcode
- **Pitfall 3:** Banner breakdown phải re-calc khi auto-refresh, nhưng cache 30s tránh spam DB

---

## TC10 — Edge: Race Condition (2 Admin Tabs)

**Mục tiêu:** 2 admin tabs cùng confirm 1 order — chỉ 1 thành công, tab thứ 2 hiện cảnh báo "Đã được xác nhận bởi X".

### Setup
1. Order `TEST-J-010`, `status=customer_paid`
2. Mở 2 browser tabs (cùng account hoặc 2 accounts admin khác nhau):
   - **Tab A:** thanghoang1109@gmail.com
   - **Tab B:** admin2@bepthuyjapan.com (nếu có)

### Steps
1. **[Tab A & B]** Cả 2 mở modal order TEST-J-010 ĐỒNG THỜI
2. **[Tab A]** Click "✅ Xác nhận lần 2" → nhập notes → OK
3. **[Tab B]** GẦN NHƯ ĐỒNG THỜI (trong 1-2s) click "✅ Xác nhận lần 2" → nhập notes → OK

### Expected Results
- Tab A: success, status → `confirmed`, modal close
- Tab B:
  - RPC `confirm_payment_v2` check `current_status = 'customer_paid'` trước UPDATE
  - Vì status đã thành `confirmed` → RPC raise exception hoặc return error code
  - Frontend catch error → hiện modal cảnh báo: "Đơn này đã được xác nhận bởi thanghoang1109@gmail.com lúc HH:MM:SS"
  - Tab B modal close, không có row duplicate trong `admin_audit_log`
- Audit log chỉ có 1 row `confirm_payment` cho order này

### Screenshots
- [ ] `screenshots/tc10-tab-a-success.png`
- [ ] `screenshots/tc10-tab-b-conflict-warning.png`
- [ ] `screenshots/tc10-audit-log-single-row.png`

### Common Pitfalls
- **Pitfall 1:** Nếu RPC dùng UPDATE thẳng không check status → cả 2 thành công, audit log có 2 rows (BAD)
- **Pitfall 2:** Optimistic locking dùng `updated_at` mismatch cũng OK, nhưng phải đồng bộ với UI state
- **Pitfall 3:** Tab B refresh sau khi Tab A confirm xong → status đã update, lúc này click confirm sẽ no-op (đã ở status confirmed) — UI nên disable button
- **Pitfall 4:** Test khó reproduce manual — cần script đồng thời gọi RPC qua `Promise.all([rpcA, rpcB])` để đảm bảo race thật sự

---

## Test Execution Checklist

| TC | Status | Tester | Date | Notes |
|---|---|---|---|---|
| TC01 | ☐ Pass / ☐ Fail | | | |
| TC02 | ☐ Pass / ☐ Fail | | | |
| TC03 | ☐ Pass / ☐ Fail | | | |
| TC04 | ☐ Pass / ☐ Fail | | | |
| TC05 | ☐ Pass / ☐ Fail | | | |
| TC06 | ☐ Pass / ☐ Fail | | | |
| TC07 | ☐ Pass / ☐ Fail | | | |
| TC08 | ☐ Pass / ☐ Fail | | | |
| TC09 | ☐ Pass / ☐ Fail | | | |
| TC10 | ☐ Pass / ☐ Fail | | | |

---

## Regression Triggers

Re-run full test plan khi có thay đổi:
- File `verify-payment` Edge function
- Bảng `orders` schema (status enum, columns mới)
- RPC `confirm_payment_v2`, `reject_payment`
- Bảng `admin_audit_log` schema hoặc RLS policy
- Email templates (Apps Script)
- Telegram notification logic
- Frontend admin page (modals, sub-tabs, banner)

---

## Sign-off

- [ ] Tester signature: ____________________
- [ ] Date completed: ____________________
- [ ] All 10 TCs pass: ☐ Yes ☐ No (block release nếu No)
- [ ] Known issues logged in `K:\bep-thuy-japan\KNOWN-ISSUES.md`

---

**End of Test Plan v1.0**
