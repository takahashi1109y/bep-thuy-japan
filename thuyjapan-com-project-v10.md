# 📋 thuyjapan.com — Project V10 (Marathon Session Handover · 2026-05-07/08)

> **Last Updated**: 2026-05-08 sáng (sau marathon ngày 2026-05-07 + sang ngày)
> **Previous handover**: `thuyjapan-com-project-v9.md` (V9 — byBox 6 locations + auth regression)
> **V10 work**: 41 commits qua 24h+ · Pro upgrade · Micro Compute · 8 SQL migrations · 25+ agents spawned · 7 critical breakthroughs
> **Repo**: https://github.com/takahashi1109y/bep-thuy-japan
> **Live**: https://www.thuyjapan.com · **Admin**: /thuythang
> **Latest commit on main**: `d7fc7fa`

---

## 🚨 SESSION RESTART — PASTE THIS

```
Tôi đang tiếp tục dự án Bếp Thuỷ Japan (thuyjapan.com).
Đọc file thuyjapan-com-project-v10.md trước (cùng folder repo).

Trạng thái hiện tại (2026-05-08):
- Supabase Pro $25/tháng + Micro Compute (1GB RAM, 2-core dedicated)
- Welcome bonus 100 điểm WORK (test verified)
- Email send via MailApp (GmailApp scope insufficient — đã swap)
- Block guest checkout + email confirm gate active
- Order flow: AI verify pass → customer_paid; AI fail + click button → pending_manual_review
- Tab admin gọn: chỉ "Cần xem xét" sub-tab (đã rename thành "📋 Check thủ công")
- Quên Email feature mới: nhập SĐT → recover masked email + reset password
- payment_confirmations.method dynamic (paypay vs bank_transfer)
- Auto-save profile từ checkout form (RLS UPDATE policy đã grant)

Pending: P3 security sprint, V8 Sagawa test khi có đơn thật.
Báo "Em đã đọc xong, sẵn sàng tiếp tục."
```

**Trên Mac**: `git clone https://github.com/takahashi1109y/bep-thuy-japan.git` rồi mở Claude Code, paste prompt trên.

---

## ✅ ĐÃ LÀM + ĐÃ TEST (Marathon 2026-05-07/08)

*41 commits qua 24h+, ~16 giờ work, 7 critical breakthroughs, 25+ agents*

### (a) byBox Bug Fix ⭐ (V9 carry-over, đã test)

| Feature | Commit | Trạng thái |
|---|---|---|
| Fix `buildProductSummary` (Yamato AB) + 5 chỗ khác | `1d186cc` | ✅ verified production "2 nem 2 pte" |
| Test fix expected value | `ee68b6b` | ✅ |

### (b) Auth Regression 3 Root Causes (V9 carry-over)

| Feature | Commit | Trạng thái |
|---|---|---|
| createClient config + dashboard timeout + showSection try/catch | `718cc81` | ✅ phone login + F5 OK |

### (c) Admin Image Display 4 Bugs

| Bug | Commit | Trạng thái |
|---|---|---|
| Schema violations (method, screenshot_hash, ai_status) | `2f7a581` | ✅ |
| `image_url` → `screenshot_url` column fix | `ccfc465` | ✅ |
| Signed URL `/storage/v1` segment + full error logging | `7621110` | ✅ |
| Always rebuild public URL từ receipt_path (signed token expire) | `3cb1f9c` | ✅ |

### (d) Admin Login Fix (commit 718cc81 omission)

| Feature | Commit | Trạng thái |
|---|---|---|
| `thuythang.html` createClient persistSession + storage:localStorage | `a18ee12` | ✅ admin F5 không thoát |

### (e) Phone + Email Login Timeout

| Feature | Commit | Trạng thái |
|---|---|---|
| Phone login RPC timeout wrapper (15s) | `2f0f3de` | ✅ |
| Email login signInWithPassword timeout wrapper (20s) | `e30a9b9` | ✅ |

### (f) Admin Dashboard Sub-tab Counter Bug

| Feature | Commit | Trạng thái |
|---|---|---|
| `updateSubTabCounts` thiếu key 'review' (badge luôn 0) | `354747a` | ✅ |
| RPC signature mismatch 4 params → 2 params | `4368a99` | ✅ admin click "Xác nhận" work |

### (g) AI Verify Fail Tracking + Tab Refactor (rất lằng nhằng)

| Feature | Commit | Trạng thái |
|---|---|---|
| AI fail tracking + tab "📋 Check thủ công" + customer pending | `60e4030` | ✅ then `182ee7d` revert auto-log |
| Button text "admin" → "Thuỷ" | `f93fc06` | ✅ |
| Block guest checkout + email confirm + RED prominent button | `45bdbea` | ✅ |
| AI tab → main tab + image load fix | `3022af7` | ✅ |
| Admin auto-create order from AI fail | `fa869f5` | ✅ |
| 3 critical bugs in admin handler | `000fb6e` | ✅ |
| Add to ADMIN_TYPES bypass validator | `dd06d2a` | ✅ |
| KHONG auto-log AI fail (anh request) | `182ee7d` | ✅ |
| Refactor: remove top tab + rename sub-tab "📋 Check thủ công" | `efb1305` | ✅ |

### (h) Email Send Fixes (CRITICAL chain)

| Feature | Commit | Trạng thái |
|---|---|---|
| Verbose logging email + frontend warning | `3d4e148` | ✅ |
| testEmailQuota direct in editor | `0d60129` | ✅ |
| Switch GmailApp → MailApp (scope `mail.google.com` insufficient) | `fb8b40a` | ✅ |
| Remove `from: thuyjapan1606@gmail.com` (MailApp không support alias) | `3dfa69a` | ✅ |
| testSendCustomerConfirmation isolated test | `9a734a0` | ✅ |

### (i) Orders CHECK Constraint Fix (CRITICAL — đơn không vào DB)

| Feature | Commit | Trạng thái |
|---|---|---|
| ⭐ Add `pending_manual_review` + `customer_paid` to status CHECK | `81b839f` | ✅ đơn vào DB |

### (j) Profile Auto-Save + RLS

| Feature | Commit | Trạng thái |
|---|---|---|
| Customer dashboard tab "Đơn Hàng" → "Lịch Sử Đơn Hàng" | `eeb4acc` | ✅ |
| 4 UX improvements (auto-save profile + button red + POST card vàng + dashboard mobile) | `7ed27ad` | ✅ |
| Remove Zalo + Messenger trong success page | `66c9096` | ✅ |
| Payment method dynamic PayPay vs Bank | `81b7ea8` | ✅ |
| RLS UPDATE policy + verify save success | `63dcd73` | ✅ |

### (k) Auth Improvements

| Feature | Commit | Trạng thái |
|---|---|---|
| Duplicate phone/email error rõ ràng + Quên Email feature | `eb867cf` | ✅ |

### (l) Welcome Bonus 100 Điểm

| Feature | Commit | Trạng thái |
|---|---|---|
| Auto-claim đầu tiên (REVERTED) | `d2a51d9` | reverted |
| Trigger update balance không dùng updated_at | `ddf57cb` | superseded |
| All-in-one diagnostic + auto-fix | `2f6e27f` | superseded |
| Revert auto-claim — khách phải click email | `75c946c` | ✅ |
| Cleanup wrong trigger (points_balance là VIEW) | `077f978` | ✅ |
| Add init logging | `3c9f732` | ✅ debug only |
| Force refresh balance từ DB + nuclear reset SQL | `a9134e6` | ✅ test101 verified |
| Cleanup minor TypeError prefetch | `d7fc7fa` | ✅ |

---

## 🔥 BREAKTHROUGHS — 7 lessons future Claude PHẢI đọc

### Breakthrough 1: `points_balance` là VIEW không phải TABLE ⚠️

**Wrong assumption** (em mất ~2 giờ debug): `points_balance` là physical table, cần trigger update sau INSERT vào `points_transactions`.

**Reality**: `points_balance` là VIEW computed từ `points_transactions` với GROUP BY:
```sql
-- Inferred view definition (em không tìm thấy CREATE TABLE):
CREATE VIEW points_balance AS
SELECT user_id, SUM(points)::int AS total_points
  FROM points_transactions
 GROUP BY user_id;
```

→ INSERT vào view fail với "cannot insert into view" + "Views containing GROUP BY are not automatically updatable".
→ View tự auto-compute → KHÔNG cần trigger.

**Lesson**: Trước khi assume schema, RUN `information_schema.tables` để check `table_type` ('BASE TABLE' vs 'VIEW'). Đặc biệt với production schema không có CREATE TABLE trong git history (created qua Supabase UI hoặc external migration).

### Breakthrough 2: Browser Cache Pollution Causes Test Inconsistency ⚠️

**Symptom**: Test102 (fresh account) → welcome bonus work. Test101 (created earlier) → fail.

**Reality**:
- `localStorage.bepthuy_points` (cộng 100 vào cache) từ test trước
- `localStorage.bepthuy_orders_cache` 60s TTL
- Frontend cộng dồn cache → wrong total → UI hiển thị sai
- DB reset ≠ frontend reset

**Solution** (commit `a9134e6`):
- Force refresh balance từ DB sau claim (KHÔNG cộng cache)
- Force `loadDashboard()` sau claim → render fresh data
- Anh test với incognito hoặc clear localStorage Application tab

**Lesson**: Frontend cache + DB state dễ desync. Sau khi modify DB qua SQL (debug/reset), browser MUST clear localStorage hoặc dùng incognito. Code KHÔNG nên cộng dồn cache — luôn refresh từ source of truth (DB).

### Breakthrough 3: GmailApp scope `mail.google.com` insufficient → MailApp ⭐

**Wrong assumption**: `GmailApp.sendEmail()` work cho mọi Apps Script project.

**Reality**:
- `GmailApp.sendEmail()` cần scope `https://mail.google.com/` (full Gmail RW)
- Apps Script editor execute as user. Nếu user chưa grant scope này → fail "Specified permissions are not sufficient"
- Email admin notification, customer confirmation, manual review alert đều dùng GmailApp → ALL fail silent

**Solution** (commit `fb8b40a`):
- Switch toàn bộ `GmailApp.sendEmail` → `MailApp.sendEmail` (scope nhẹ hơn `script.send_mail`, default grant)
- Remove `from: 'thuyjapan1606@gmail.com'` alias (MailApp không support — chỉ GmailApp)
- Trade-off: Email gửi từ account default (`takahashi1109y@gmail.com`) thay vì shop email
- Future: anh setup Gmail send-as alias trong takahashi → restore from='thuyjapan1606'

**Lesson**: Apps Script scope authorization tricky. Test bằng `testEmailQuota` function trong editor TRƯỚC khi assume. Default `MailApp` cho safer (auto-grant). `GmailApp` chỉ khi cần `from` alias customization.

### Breakthrough 4: Orders Status CHECK Constraint Missing Enum 🚨

**Symptom**: Khách đặt đơn → toast green "Đơn đã được nhận" → Apps Script Yamato sheet save → email admin gửi → NHƯNG admin dashboard rỗng.

**Root cause**: `orders.status` CHECK constraint:
```sql
CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled'))
```
KHÔNG có `'customer_paid'` (verify_then_create_order set) hoặc `'pending_manual_review'` (manual_pending_order set).

→ INSERT vào `orders` table fail HTTP 400.
→ `saveOrderToSupabase` wrapped trong try/catch silent → Apps Script return success.
→ Frontend nhận `{success: true}` → UI báo OK.
→ Đơn KHÔNG vào DB.

**Solution** (commit `81b839f`):
```sql
ALTER TABLE public.orders DROP CONSTRAINT <old_check>;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','customer_paid','pending_manual_review','confirmed','shipped','delivered','cancelled'));
```

Plus improve logging trong `saveOrderToSupabase` — log full response body khi HTTP >= 300.

**Lesson**: Khi feature mới add status enum mới (`customer_paid`, `pending_manual_review` được add cho 2-step verify + manual review flows), PHẢI verify CHECK constraint có cho phép value mới. Silent INSERT fail là worst-case bug — debug lâu nhất.

### Breakthrough 5: `_dashboardPrefetch` PostgrestBuilder không có `.catch`

**Symptom**: Console log error TypeError sau mỗi login (cosmetic, không block).

**Root cause**: `sb.rpc('get_member_dashboard')` trả `PostgrestBuilder` (thenable, có `.then` nhưng KHÔNG `.catch` standard). Code call `.catch` trực tiếp → throw.

**Solution** (commit `d7fc7fa`):
```js
window._dashboardPrefetch = Promise.resolve(sb.rpc('get_member_dashboard')).catch(() => null);
```

**Lesson**: Supabase JS SDK builder pattern không phải Promise đầy đủ. Wrap `Promise.resolve()` để có `.catch` standard.

### Breakthrough 6: Pro Upgrade KHÔNG = Compute Upgrade ⚠️

**Anh frustration moment**: Đã upgrade Supabase Free → Pro $25/tháng nhưng dashboard vẫn lag.

**Reality**:
- Pro plan = billing tier upgrade (backup, log retention, support)
- Compute size = SEPARATE setting (Nano Shared CPU → Micro 2-core dedicated)
- Pro **paid for** Micro nhưng project vẫn ở Nano cho đến khi anh manually click upgrade
- Anh phải vào Settings → Compute and Disk → click "Upgrade to Micro Compute"

**Lesson**: Document Supabase pricing structure cho anh. Pro $25 = base. Compute upgrade = additional config bước riêng.

### Breakthrough 7: Welcome Bonus Manual Click Flow (KHÔNG auto-claim)

**Em initial assumption**: Khách signup + confirm email = auto-claim 100 điểm.

**Anh's spec**: Khách phải mở email từ GetResponse + click link `?claim=welcome` → mới được claim. Lý do: anh track open rate + click rate cho remarketing.

**Flow correct**:
1. Khách signup → Apps Script `addToGetResponse(tag='member')`
2. GetResponse autoresponder gửi email-1 "🎁 Click kích hoạt 100 điểm"
3. Anh tracking open + click trong GetResponse
4. Khách click link → `/thanh-vien?claim=welcome` → init() detect → tryClaimWelcomeBonus → 100 điểm

**Lesson**: KHÔNG được simplify business flow without verify với anh. Auto-claim convenient nhưng kill remarketing tracking.

### TL;DR cho future Claude

1. **Schema first**: Verify `table_type` (TABLE vs VIEW) before INSERT/trigger
2. **Browser cache pollution**: Frontend force refresh from DB, không cộng dồn cache
3. **MailApp not GmailApp** unless need `from` alias + send-as setup
4. **CHECK constraint enum**: Add new status TRƯỚC khi code use
5. **Promise.resolve(builder)** for Supabase RPC `.catch`
6. **Pro ≠ Compute upgrade** — separate setting
7. **KHÔNG simplify business flow** without verify với anh

---

## 🔴 PENDING USER ACTIONS

### P0 — Critical (None remaining)
- ✅ Tất cả critical bugs đã fix.

### P1 — Important
| # | Item | Why | Source |
|---|---|---|---|
| 1 | Setup Gmail send-as alias trong `takahashi1109y@gmail.com` cho `thuyjapan1606@gmail.com` | Email khách thấy "From: Bếp Thuỷ Japan <takahashi>" thay vì shop email chính thức | V10 breakthrough 3 |
| 2 | Test `scrapeSagawaTracking_` khi có đơn Sagawa thật | Function code OK, chưa production-tested | V7 carry-over |
| 3 | Verify weekly Yamato monitoring trigger active | Anh đã setup nhưng cần verify row trong Triggers panel | V7 carry-over |

### P2 — User decisions (carry-over)

| # | Item | Why | Source |
|---|---|---|---|
| 1 | Add daily trigger `sendDailyProductionReport` 23h JST | Email báo cáo sản xuất | V4 doc |
| 2 | Decide PayPay for Business application | 1.98% fee + bullet-proof | V6 doc |
| 3 | Update 定款 食品の販売 | Required PayPay Business | V6 doc |
| 4 | 食品衛生 license check | Legitimate food sales | V6 doc |
| 5 | Rotate JWT secret | Security | V3 doc |
| 6 | Apple Developer Team ID | iOS submission | V4 doc |
| 7 | Firebase project | Push notifications | V4 doc |
| 8 | Microsoft Clarity verify sau 1 tuần | Heatmap | V4 doc |
| 9 | TPCN site Shopify decision | New brand "Wellness Japan" | V6 doc |

### P3 — Security findings (carry-over từ V6)

5 critical findings chưa fix:
1. Signed URLs valid 1 năm — token leak = ai cũng access bill
2. `admin_force_approve_payment` KHÔNG verify caller is admin
3. Vision API không disclose trong privacy.html — vi phạm APPI 24/27
4. Audit log chỉ cover RPC mới
5. Telegram bot token + Supabase service_role + Vision key tập trung 1 chỗ

→ Recommend cluster thành **1 security sprint** (~½ ngày work).

---

## 📦 SQL MIGRATIONS đã chạy hôm nay

8 SQL migrations:
1. `supabase-orders-status-check-fix.sql` — orders status enum
2. `supabase-profile-update-policy.sql` — RLS UPDATE profiles
3. `supabase-ai-fail-tracking.sql` (legacy table — không còn auto-log)
4. `supabase-ai-fail-customer-view.sql` (RLS for ai_verify_attempts)
5. `supabase-ai-fail-cleanup.sql` (data pollution cleanup)
6. `supabase-points-balance-trigger.sql` (REJECTED — view không updatable)
7. `supabase-welcome-bonus-allinone-fix.sql` (auto-fix welcome bonus)
8. `supabase-welcome-bonus-cleanup.sql` (drop wrong trigger)
9. `supabase-test101-fix.sql` (nuclear reset cho test101)

---

## 🆕 NEW FEATURES SHIPPED

### Feature 1: Block Guest Checkout
- Frontend: `goToCheckout()` + `submitOrder()` check `!sbUser` || `!sbUser.email_confirmed_at`
- Backend: Apps Script `verify_then_create_order` + `manual_pending_order` reject `!data.userId`
- Cart preserve via localStorage khi redirect → restore khi login xong

### Feature 2: Quên Email
- Tab thứ 3 trong /thanh-vien (cạnh Đăng Nhập + Đăng Ký Mới)
- Input SĐT → RPC `find_email_by_phone` → masked email + button "Gửi link reset password"
- Reuse RPC từ phone login session

### Feature 3: AI Verify Fail Tracking (auto-log REMOVED)
- Initially: tự log mọi AI fail vào `ai_verify_attempts` table
- Anh request: chỉ log khi khách click button → REVERTED
- Tab "📋 Check thủ công" giờ chỉ là sub-tab trong Đơn Hàng (cho orders status `pending_manual_review`)

### Feature 4: Admin Auto-Create Order from AI Fail
- Click "Tạo đơn thủ công" → Apps Script handler `admin_create_order_from_ai_attempt`
- Tạo full order với status='confirmed' + email khách + trừ kho

### Feature 5: Customer Pending Visibility
- Card vàng pulse animation "⏳ Đang chờ Thuỷ xác nhận" trong /thanh-vien
- Khách thấy đơn đã upload bill nhưng chưa duyệt

### Feature 6: Dynamic Payment Method
- Frontend: `_selectedPayMethod` track tab paypay/bank
- Backend: `data.method` saved into `payment_confirmations.method`
- Email admin: dynamic text "khách báo đã thanh toán bằng PayPay/chuyển khoản ngân hàng"

### Feature 7: Auto-Save Profile from Checkout
- Khách lần đầu đặt hàng → form đầy đủ → save vào profile
- Lần sau auto-fill form
- RED toast nếu RLS block (anh chưa run migration)

### Feature 8: Welcome Bonus Click Flow
- GetResponse email với link `?claim=welcome`
- Khách click → init() detect → tryClaimWelcomeBonus → RPC → 100 điểm
- Force refresh balance từ DB (không cộng cache)

---

## 📊 V10 SESSION STATS (2026-05-07/08)

- **Commits**: 41 commits qua ~24 giờ marathon
- **Code delta**: ~1,200 insertions, ~150 deletions
- **Files chính**: 5 (`thanh-vien.html`, `thuythang.html`, `index.html`, `google-apps-script.js`, 9 SQL migration files)
- **Agents spawned**: 25+ across 8+ waves (5+5+4+5+4+4+3+1)
- **Breakthroughs**: 7 critical (VIEW vs TABLE, cache pollution, MailApp, CHECK constraint, Promise wrap, Pro vs Compute, manual flow)
- **Production verified**: 14 features (xem table trên)
- **Time to production**: same-day với multiple iterations (frustrate-prone — em đã miss bugs)
- **Highlight**: Welcome bonus 100 điểm WORK sau cả ngày debug; Pro upgrade + Micro Compute giải quyết lag chronic

---

## 💡 Communication Style (carry-over từ V9 + V10 lessons)

- **Pronoun**: Em ↔ anh (giữ nguyên)
- **Ngôn ngữ**: Vietnamese first
- **Click-by-click TỪNG BƯỚC** — anh prefer 1 step 1 lúc, không list nhiều bước cùng lúc
- **Confirm trước action lớn** — Deploy production, force-push, schema change
- **Trigger phrase "lưu lại tất cả"** → em update file handover hiện tại
- **Agent spawning**: 4-5 agents per task khi anh request "spawn nhiều agent" hoặc task có >3 file cần khảo sát
- **Spec-first workflow**: Research → spec → anh review → build → verify
- **Handover discipline**: Cuối session em tự draft handover doc
- **Khi anh frustrated** ("cứ để anh phải sửa mãi", "em định thử độ kiên nhẫn của anh à") → em STOP hỏi từng bước, spawn agents song song, fix dứt điểm 1 commit lớn
- **🆕 V10**: Verify schema (TABLE vs VIEW) TRƯỚC khi assume — tránh waste cycles trên trigger sai object type
- **🆕 V10**: Frontend cache + DB state dễ desync → KHÔNG cộng dồn cache, luôn refresh from DB
- **🆕 V10**: Khách hàng business decisions (auto-claim vs manual click) phải verify với anh — không simplify

---

## 🔧 KEY LOCATIONS — Future Claude reference

- **Apps Script handlers** (google-apps-script.js):
  - `verify_then_create_order` line ~253 (AI verify pass → customer_paid)
  - `manual_pending_order` line ~334 (khách click button → pending_manual_review)
  - `admin_create_order_from_ai_attempt` line ~412 (admin tạo đơn thủ công)
  - `addToGetResponse` line ~3521 (sync contact qua GetResponse)
  - `saveOrderToSupabase` line ~3137 (CRITICAL: log full response body for debug)
  - `MailApp.sendEmail` (đã swap từ GmailApp) — search `MailApp.sendEmail`

- **Frontend** (thanh-vien.html):
  - `init()` line ~1491 (URL claim detection + welcome bonus)
  - `tryClaimWelcomeBonus` line ~1584 (force refresh balance from DB)
  - `doRegister` line ~1873 (improved error handling cho duplicate phone/email)
  - `submitForgotEmail` (Quên Email feature)
  - `createClient` line ~1014 (config: persistSession, storage, autoRefreshToken)

- **Frontend** (index.html):
  - `submitOrder` line ~1480 (block guest + email confirm gate)
  - `goToCheckout` line ~1256 (block guest + cart preserve)
  - `autoSaveProfileFromCheckout` line ~1530 (force refresh sbProfile from DB)
  - `_selectedPayMethod` (track payment method)
  - Manual review button line ~1721 (RED + auto-scroll)

- **Admin** (thuythang.html):
  - `createClient` line ~1036 (matches thanh-vien.html config)
  - `resolveAIAttempt` line ~2528 (call Apps Script handler `admin_create_order_from_ai_attempt`)
  - `updateSubTabCounts` line ~2401 (now includes 'review' key)
  - Sub-tab "📋 Check thủ công" (renamed from "🚨 Cần xem xét")

---

## 🚨 IMPORTANT REMINDERS cho future Claude

1. **`points_balance` là VIEW** — KHÔNG INSERT trigger, view auto-compute
2. **MailApp NOT GmailApp** — `from` alias không support trong MailApp
3. **CHECK constraint orders.status** — đầy đủ 7 enum: pending, customer_paid, pending_manual_review, confirmed, shipped, delivered, cancelled
4. **Frontend cache pollution** — clear localStorage khi reset DB
5. **GetResponse manual click flow** — KHÔNG auto-claim 100 điểm
6. **payment_confirmations.method** — chỉ accept 'paypay' hoặc 'bank_transfer'
7. **Pro upgrade ≠ Compute upgrade** — phải click separately

---

*End of v10 handover. Marathon ngày dài 2026-05-07/08 đã ship 41 commits + 7 breakthroughs. Future Claude: đọc kỹ section breakthroughs để tránh waste cycles.* 🍜🛡️

**Bếp Thuỷ Japan — Đặc Sản Phố Cổ Hà Nội Tại Nhật Bản**
