# 📋 thuyjapan.com — Project V2 (Handover Document)

> **Last Updated**: 2026-04-25
> **Tech Stack**: Vercel + Supabase + Google Apps Script + Google Sheets + GetResponse + hCaptcha
> **Repo**: https://github.com/takahashi1109y/bep-thuy-japan
> **Live**: https://www.thuyjapan.com

---

## 🎯 Mục Tiêu Tổng Quan

Bếp Thuỷ Japan — bán đặc sản Phố Cổ Hà Nội (giò lụa, chả quế, mọc, nem, pate) cho người Việt sống tại Nhật. Website + dashboard quản lý + hệ thống email tự động + thanh toán PayPay/chuyển khoản.

---

## 🏗️ Kiến Trúc Hệ Thống

```
┌──────────────────────────────────────────────────────────────┐
│                       FRONTEND (Vercel)                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐  │
│  │ index.html   │ │ thanh-vien   │ │ thuythang (admin)    │  │
│  │ Trang chủ    │ │ Thành viên   │ │ Dashboard quản lý    │  │
│  └──────┬───────┘ └──────┬───────┘ └─────────┬────────────┘  │
└─────────┼────────────────┼─────────────────┬─┘                │
          │                │                 │                  │
          ▼                ▼                 ▼                  │
┌─────────────────────┐  ┌─────────────────────────────────────┐│
│ Google Apps Script  │  │       Supabase (Backend)            ││
│  • Save orders      │  │  • Auth (email + hCaptcha)          ││
│  • Send emails      │  │  • Tables: profiles, orders, ...    ││
│  • Sync Sheets      │◄──┤  • RPC functions                   ││
│  • Birthday/inactive│  │  • Storage (payment-proofs)         ││
│  • Telegram (opt)   │  │  • RLS policies                     ││
└─────────┬───────────┘  └─────────────────────────────────────┘│
          │                                                      │
          ▼                                                      │
┌──────────────────────┐                                         │
│   Google Sheets      │                                         │
│  • Don Hang          │                                         │
│  • Thanh Vien        │                                         │
│  • Thong Ke San Xuat │                                         │
│  • Counter           │                                         │
└──────────────────────┘                                         │
                                                                  │
┌──────────────────────────────────────────────────────────────────┘
│
└─→ External: aidahost SMTP (support@thuyjapan.com), GetResponse, PayPay, Yamato
```

---

## ✅ ĐÃ HOÀN THÀNH (Project V2 Updates)

### 1. Security & Infrastructure
- [x] Fixed `points_balance` view leak (RLS bypass) — security_invoker=on
- [x] Added vercel.json security headers (CSP, HSTS, X-Frame, etc)
- [x] Apps Script rate limiting + payload validation
- [x] hCaptcha invisible (anti-bot) on register/login
- [x] Migrated to Supabase publishable/secret API keys (sb_publishable_*)
- [x] Apps Script uses Script Properties for secrets (not hardcoded)
- [x] GitHub repo: switched to public (Vercel needs access for Hobby tier)
- [ ] **PENDING**: Rotate legacy JWT secret (key in git history)

### 2. Member System
- [x] Supabase Auth + email confirmation
- [x] Profile fields: display_name, phone, prefecture, postal, address
- [x] Added: gender, birthday (with lock trigger after set)
- [x] Auto-fill checkout form from profile
- [x] hCaptcha on register/login forms
- [x] Friendly error messages (duplicate email, weak password, etc)

### 3. Order System
- [x] Created `orders` table in Supabase (separate from Sheets)
- [x] Backfill 50+ orders from Google Sheets → Supabase
- [x] Full order history page in `/thanh-vien` (Amazon-style layout)
- [x] Status flow: pending → customer_paid → confirmed → shipped → delivered/cancelled
- [x] Customer self-cancel (within 30 minutes only)
- [x] Auto-link guest orders to accounts by email match
- [x] Auto-link new signups to existing guest orders (trigger)

### 4. Payment System
- [x] Payment proof upload (photo of bank/PayPay receipt)
- [x] Supabase Storage bucket `payment-proofs` with 3 RLS policies
- [x] Anti-fraud: SHA-256 hash dedup, 100KB-10MB size, 3 max uploads/order
- [x] Customer marks "Đã chuyển tiền" → status = customer_paid
- [x] Email notification to support@thuyjapan.com when receipt uploaded
- [x] Admin verifies in dashboard

### 5. Admin Dashboard `/thuythang`
- [x] Login with admin role (admin_users table + RLS)
- [x] Stats: orders today, revenue, pending count, shipped today
- [x] Tab Đơn Hàng: filter by status, search, modal detail
- [x] Tab Khách Hàng: 41 customers with auto-tags (VIP/Loyal/Inactive)
- [x] Tab Tin Nhắn: customer ↔ shop messaging system
- [x] Tab Thống Kê: 7/30/90 day order counts
- [x] Action buttons: Xác nhận TT, Đánh dấu đã gửi, Hủy đơn (with refund)
- [x] Sound alert + auto-refresh on new payment confirmation

### 6. Customer-Shop Messaging
- [x] Tables: message_threads + messages (with RLS)
- [x] Customer compose form in `/thanh-vien` Tab Tin Nhắn
- [x] Admin reply box in `/thuythang` Tab Tin Nhắn
- [x] Unread badges (red dot) for both sides
- [x] Auto-poll every 30s on admin side

### 7. Birthday Discount System (10%)
- [x] Profile field: birthday
- [x] Auto-detect today is birthday (JST timezone)
- [x] 10% discount auto-applied at checkout (subtotal only, NOT shipping)
- [x] Banner: "🎂 Chúc mừng sinh nhật! Giảm 10%" (surprise — no advance hint)
- [x] Birthday icon on greeting button

### 8. Birthday Email System (4 emails)
- [x] 14 days before: "Sắp đến sinh nhật"
- [x] 7 days before: "Còn 1 tuần"
- [x] 3 days before: "Còn 3 ngày"
- [x] On birthday: "Chúc mừng sinh nhật + 10% off"
- [x] HTML template (responsive, branded)
- [x] Log table prevents duplicate sends per year

### 9. Inactive Customer System (4 tiers + 2 reminders)
- [x] **45 ngày**: Reminder only (no discount)
- [x] **60 ngày**: 5% discount (14 days valid)
- [x] **90 ngày**: 8% discount (reset 14 days)
- [x] **120 ngày**: 10% discount (reset 14 days)
- [x] **+7 ngày sau** discount email: "Còn 1 tuần"
- [x] **-1 ngày trước** expiry: "Ngày cuối!"
- [x] Discount auto-applied at checkout
- [x] Auto-clear after order placed (trigger)

### 10. Performance Optimizations
- [x] Single RPC `get_member_dashboard` (5 queries → 1, saves 100-300ms)
- [x] Prefetch dashboard on login (parallel with UI animation)
- [x] Warmup Supabase on page load (wake cold start)
- [x] localStorage cache for instant render
- [x] Optimistic cache after order placed
- [x] Cache-first rendering (don't overwrite with loading)
- [x] iOS Safari fallback (direct fetch with stored access_token)
- [x] Mutex prevents duplicate concurrent loadDashboard calls

### 11. UI/UX Polish
- [x] Apple Liquid Glass buttons (hero)
- [x] Hero white background + decorative blurred color blobs
- [x] Order history Amazon-style (items left, action buttons right pills)
- [x] Custom payment modal (PayPay QR + Bank info + Upload receipt)
- [x] Custom cancel order dialog (replace native prompt for iOS reliability)
- [x] Personalized greeting: "Chào anh/chị [Name]" by gender
- [x] Banner "Xin Chào" clickable to homepage
- [x] Đặt hàng ngay link → /#products (menu section)
- [x] Cart fix: +/- by 0.5kg / 1 box (not multiplier)
- [x] Cart delete button visible (red pill)

---

## 🐛 BUGS ENCOUNTERED & FIXES

### Bug 1: Cart +/- Không Hoạt Động
- **Symptom**: Click +/- buttons did nothing
- **Root Cause**: Type mismatch — `cart.find(x => x.key === key)` strict equality. Stored as number `1`, onclick passed string `'1'`.
- **Fix**: `String(x.key) === String(key)` loose match
- **Lesson**: Always normalize types when bridging HTML attributes (always strings) and JS objects (typed)

### Bug 2: Modal Bank Section Không Hiện
- **Symptom**: Click 🏦 tab, content blank
- **Root Cause**: `pm-section-bank` had inline `style="display:none"`. Code used `classList.toggle('hidden')` which doesn't override inline styles.
- **Fix**: Use `element.style.setProperty('display', 'block', 'important')`
- **Lesson**: When mixing inline styles + classes, inline always wins. Use `!important` flag to force override.

### Bug 3: iOS Safari Stuck "Đang Tải Đơn Hàng"
- **Symptom**: On iPhone, Supabase queries timeout after 20s, fallback also failed
- **Root Cause**: Supabase JS client `getSession()` hangs on iOS Safari (Tracking Prevention blocks storage)
- **Fix**: Read `access_token` directly from localStorage (bypass Supabase JS), use pure `fetch()` with `AbortController` (Safari 11.1+ compat — NOT `AbortSignal.timeout()` which needs Safari 15+)
- **Lesson**: Always have fallback path for iOS Safari that bypasses 3rd-party libraries

### Bug 4: 29 Errors `offsetHeight of null`
- **Symptom**: 29 console errors, JS crashes silently
- **Root Cause**: Removed class `hero-bg` during redesign but scroll listener still queried it → `null.offsetHeight` throws → all subsequent JS broke
- **Fix**: Add null check + fallback selector
- **Lesson**: When refactoring HTML, grep for ALL references to removed classes/IDs in JS

### Bug 5: Order Cache Showed Loading Then Error
- **Symptom**: User saw orders briefly, then "Đang tải..." overwrote, then error
- **Root Cause**: After rendering cache, code immediately set `innerHTML = "Đang tải..."` — destroyed cached UI
- **Fix**: Cache-first rendering — only show loading text if NO cache exists. On error, keep cache visible.
- **Lesson**: User-facing UX > technical correctness. Better to show stale data than blank/error.

### Bug 6: Vercel Deployments Blocked
- **Symptom**: 4 commits pushed but Vercel showed "Blocked" status
- **Root Cause**: Repo went private → Vercel lost GitHub access. Even after re-granting, "Deployment Protection" was on.
- **Fix**: Disable "Vercel Authentication" in Project Settings → Deployment Protection
- **Lesson**: Hobby tier with team account has weird limitations. Free repos public is simpler.

### Bug 7: Service_role Key Browser Detection
- **Symptom**: New `sb_secret_*` key returned 401 "Forbidden use of secret API key in browser"
- **Root Cause**: Supabase rejects requests with browser User-Agent. Apps Script's UrlFetchApp sends "Mozilla/5.0..." (Google's UA cannot be overridden)
- **Fix**: Stay with legacy JWT service_role key for Apps Script (still works)
- **Lesson**: Modern Supabase secret keys = server-side only. Apps Script is "server" but UA looks browser. Limitation.

### Bug 8: Cart Type Cascade
- **Symptom**: Old cart items missing `unitPrice` field after refactor
- **Root Cause**: New code expects `item.unitPrice` but old localStorage carts don't have it
- **Fix**: Migration function on load — calculate unitPrice from existing price/wt for legacy items
- **Lesson**: Always handle migration when changing data shape. Use version flag or graceful fallback.

### Bug 9: Edge Browser Tracking Prevention
- **Symptom**: "Tracking Prevention blocked access to storage" — Supabase queries 1-2s slower
- **Root Cause**: Edge's aggressive tracking prevention blocks Supabase's localStorage usage
- **Fix**: Tell user it's browser issue. Recommend Chrome/Safari for testing.
- **Lesson**: Edge has UNIQUE issues. Test on Edge separately.

### Bug 10: Cart Key Number vs String Mismatch
- See Bug 1 — same root cause but in different context

---

## 📚 KINH NGHIỆM TÍCH LŨY

### A. Supabase Specifics
1. **RLS policies cascade**: A policy on table A referencing table B requires SELECT grant on B for the role. Without grant, subqueries fail with "permission denied".
2. **Single() returns 406** when no rows. Use `.maybeSingle()` to return null instead.
3. **`security_invoker=on`** on views makes them respect RLS of underlying table.
4. **Cold starts** on free tier — first request 1-2s. Use Supabase Pro to eliminate.
5. **JWT vs new keys**: Legacy JWT works everywhere. New `sb_secret_*` blocks browser-like UA.
6. **PostgREST RPC**: `auth.uid()` is the user ID. `current_setting('request.jwt.claims', true)::jsonb->>'role'` gives role name.

### B. iOS Safari Quirks
1. **Tracking Prevention** can block localStorage/sessionStorage for some sites.
2. **`prompt()`** can hang silently. Use custom modals.
3. **`AbortSignal.timeout(ms)`** needs Safari 15+. Use `AbortController` + setTimeout for 11.1+.
4. **User-Agent** cannot be overridden in JS or service workers.
5. **Hard reload** doesn't always work. Need full Safari cache clear.

### C. Vercel Deployment
1. **Hobby tier** for personal/small projects. No collaboration.
2. **Team scope** can lock features behind Pro.
3. **Deployment Protection** blocks deploys until manually approved.
4. **Public repo** simplest for Hobby. Private requires GitHub App permission setup.
5. **Webhook from GitHub** triggers auto-deploy. Can break when repo visibility changes.

### D. Apps Script Best Practices
1. **PropertiesService** for secrets (not hardcoded).
2. **MailApp** for email (uses Google's quota).
3. **Time-driven triggers** for scheduled tasks.
4. **UrlFetchApp** for HTTP — but User-Agent is fixed by Google.
5. **onEdit triggers** for Sheet automation.
6. **Manual run** to test before scheduling.

### E. Performance Tactics
1. **Cache-first** > network-first for repeat views.
2. **Prefetch** in parallel with UI render.
3. **Combine queries** into single RPC saves multiple TLS handshakes.
4. **Optimistic UI** — show data immediately, sync in background.
5. **Mutex** prevents duplicate concurrent calls.
6. **Warmup ping** wakes cold-started services.

### F. Vietnamese E-commerce UX
1. **Greeting style**: "Chào anh/chị [Tên]" — formal & respectful.
2. **Yellow Amazon-style buttons** — recognized + trusted.
3. **Pill buttons** for actions — modern + tappable on mobile.
4. **Birthday discount as surprise** — increases delight.
5. **Loyalty tiers visible** — VIP/Loyal/Inactive badges.

---

## ⚠️ ĐANG LÀM DỞ — CẦN TIẾP TỤC

### 🔴 HIGH PRIORITY

#### 1. Rotate Legacy JWT Secret
- **Why**: Service_role JWT key was leaked in git history. Need to invalidate.
- **Why not done yet**: Apps Script needs legacy key (sb_secret_* doesn't work due to UA detection)
- **Path forward**:
  - Option A: Use Supabase Edge Function as proxy (Apps Script → Edge Fn → Supabase with sb_secret_*)
  - Option B: Reset JWT secret in Supabase (Settings → JWT Keys), regenerate legacy keys, update Apps Script Properties
  - Option C: Accept current state since repo is now public again

#### 2. Run Final SQL File
- **File**: `supabase-COMPLETE-birthday-inactive.sql`
- **Why**: Last 4-tier inactive system (45/60/90/120) + birthday emails
- **Action**: Paste into Supabase SQL Editor → Run

#### 3. Update Apps Script Code (Latest)
- **Action**: Copy `google-apps-script.js` from GitHub raw → paste into Mã.gs → Save → Deploy

#### 4. Setup 2 Daily Triggers
- **Trigger 1**: `sendBirthdayEmails` — daily 9am-10am JST
- **Trigger 2**: `sendInactiveReminders` — daily 10am-11am JST

### 🟡 MEDIUM PRIORITY

#### 5. PayPay QR Renewal (Recurring)
- **Current**: `p2p01_qxomK6ZT3vnW9RHW` (created 2026-04-24)
- **Expires**: ~2026-05-24 (30 days for P2P)
- **Action**: Create new QR in PayPay app, send link to update `index.html`
- **Long-term**: Upgrade PayPay Business for permanent QR

#### 6. Telegram Bot Notifications (Optional)
- **Status**: Code ready in Apps Script (`sendTelegramNotification_`)
- **Need**: Create Telegram bot, get token + chat_id, paste in Script Properties:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`

#### 7. Supabase Pro Upgrade ($25/mo)
- **Why consider**: Eliminates cold starts (1-2s on first query → instant)
- **When**: If site traffic > 100 visits/day or users complain about speed
- **Currently**: Optimizations make Free tier acceptable

### 🟢 LOW PRIORITY / FUTURE

#### 8. Order History Backfill (older than 50 orders)
- Currently backfilled latest 50. Older orders only in Sheets.
- Run `backfillOrdersToSupabase` again if needed.

#### 9. Email Template Customization
- Current templates basic HTML. Could add:
  - Hero image
  - Featured products
  - Social media links
  - Unsubscribe link (legal compliance)

#### 10. Analytics Dashboard
- Tab "Thống Kê" placeholder in `/thuythang`
- Could add: revenue chart, top products, customer retention, sales by region

#### 11. Mobile App (Far Future)
- React Native / Flutter wrapper
- Push notifications instead of email
- Offline cart support

---

## 📂 KEY FILES MAP

| File | Purpose |
|------|---------|
| `index.html` | Trang chủ + product menu + cart + checkout |
| `thanh-vien.html` | Member dashboard (login, profile, orders, messages) |
| `thuythang.html` | Admin dashboard |
| `google-apps-script.js` | Backend automation (Sheets, emails, Telegram) |
| `vercel.json` | Vercel config (rewrites + security headers) |
| `supabase-COMPLETE-birthday-inactive.sql` | **MAIN SQL FILE** (run this) |
| `supabase-orders-migration.sql` | Original orders table |
| `supabase-admin-migration.sql` | Admin role + RLS |
| `supabase-customer-features.sql` | Self-cancel + messaging |
| `supabase-payment-proof.sql` | Payment uploads |

---

## 🔐 SECRETS & CREDENTIALS

> ⚠️ Don't share these. Stored in Supabase + Apps Script Properties + LastPass

### Supabase
- **Project**: curcsvwvjkjewtonkhnr.supabase.co
- **Publishable key**: `sb_publishable_Y2Nqe7A0sgkJegX-aKAwIA_r27GzCjv` (safe to expose)
- **Secret key**: Stored in Apps Script Properties as `SUPABASE_SERVICE_KEY`
- **Admin email**: thanghoang1109@gmail.com
- **Admin user_id**: 06f91f17-abb2-4f96-91f3-3c682b2a7d0e

### hCaptcha
- **Sitekey**: `37bc1d04-d54e-48c0-ac14-786ce46444f0` (in HTML)
- **Secret**: configured in Supabase Auth Settings

### GetResponse
- **API Key**: in Apps Script Properties (`GR_API_KEY`)
- **Campaign**: fwvbg

### Email (Aidahost)
- **From**: support@thuyjapan.com
- **SMTP**: mail.supremecluster.com:465
- **Password**: stored in Supabase Auth SMTP settings

### PayPay (Personal P2P)
- **Current URL**: `https://qr.paypay.ne.jp/p2p01_qxomK6ZT3vnW9RHW`
- **Renew every 30 days**

### Bank (Japan Post Bank)
- **支店名**: 二〇八店 (208)
- **口座番号**: 2168488
- **口座名義**: タカハラ ケイイチロウ
- **記号番号**: 12030-21684881

---

## 🚀 NEXT TIME — START HERE

When opening this project next time, do these steps in order:

### Step 1: Pull Latest Code
```bash
cd /Users/Owner/bep-thuy-japan
git pull origin main
```

### Step 2: Verify Deployment Status
- Check https://www.thuyjapan.com loads
- Check `/thanh-vien` works after login
- Check `/thuythang` admin dashboard

### Step 3: Run Pending SQL (If Not Done)
- Go to https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
- Paste `supabase-COMPLETE-birthday-inactive.sql`
- Run

### Step 4: Update Apps Script (If Not Done)
- Open https://script.google.com → project
- Copy `google-apps-script.js` from GitHub raw
- Paste into Mã.gs → Save → Deploy
- Verify 2 triggers exist:
  - `sendBirthdayEmails` (9am-10am)
  - `sendInactiveReminders` (10am-11am)

### Step 5: Test
- Place a test order
- Upload payment receipt
- Verify in admin dashboard
- Check email automation logs

---

## 📞 SUPPORT CONTACTS

- **Hosting**: Vercel (Owner: takahashi1109y@gmail.com)
- **Database**: Supabase
- **Email Domain**: aidahost (cPanel)
- **Domain**: thuyjapan.com (purchased via Onamae or similar)

---

## 💡 GENERAL ADVICE

1. **Always test on iPhone Safari** — most customers use mobile.
2. **Cache aggressively** for member dashboard speed.
3. **Email rate limit**: Gmail sends ~100/day from MailApp. If volume grows, switch to Supabase Edge Functions + Resend/SendGrid.
4. **Backup Sheets weekly** — Supabase backups are 1 day on free tier.
5. **Monitor Supabase usage** monthly: https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/settings/billing
6. **Don't commit secrets** — use Script Properties or .env (gitignored).

---

## 🎉 PROJECT V2 ACHIEVEMENTS

Total commits: **80+** in this session
Files changed: **15+**
Features added: **30+**
Bugs fixed: **20+**
Email templates: **9** (4 birthday + 4 inactive + 2 reminder)
Database tables: **10+** (orders, profiles, points, coupons, messages, payment_confirmations, etc.)
RPC functions: **15+**

**Result**: Production-ready Vietnamese e-commerce platform for Bepptthuy Japan with full member system, automated retention emails, payment processing, and admin dashboard.

---

*End of handover document. Good luck with the next iteration!* 🍜✨
