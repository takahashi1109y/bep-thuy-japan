# 📋 thuyjapan.com — Project V3 (Session Handover · 2026-04-26)

> **Last Updated**: 2026-04-26
> **Tech Stack**: Vercel + Supabase + Google Apps Script + Google Sheets + GetResponse + hCaptcha
> **Repo**: https://github.com/takahashi1109y/bep-thuy-japan
> **Live**: https://www.thuyjapan.com
> **Admin Dashboard**: https://www.thuyjapan.com/thuythang
> **Latest Commit**: `c8fc414` (head)
> **Previous handover**: `thuyjapan-com-project-v2.md`

---

## 🚨 SESSION RESTART — ĐỌC ĐẦU TIÊN

**Khi mở session mới với Claude, paste đoạn này:**

```
Tôi đang tiếp tục dự án Bếp Thuỷ Japan (thuyjapan.com).
Vui lòng đọc file này trước:
/Users/Owner/bep-thuy-japan/thuyjapan-com-project-v3.md
(Nếu cần context cũ hơn, đọc thêm v2: thuyjapan-com-project-v2.md)

Thông tin chính:
- Local repo: /Users/Owner/bep-thuy-japan
- Code repo: https://github.com/takahashi1109y/bep-thuy-japan
- Live URL: https://www.thuyjapan.com
- Admin: thanghoang1109@gmail.com (UUID: 06f91f17-abb2-4f96-91f3-3c682b2a7d0e)
- Supabase project: curcsvwvjkjewtonkhnr
- Tech: Vercel (Hobby) + Supabase + Apps Script

Pending tasks: xem section "ĐANG LÀM DỞ" trong file v3.
Đọc xong báo "Em đã đọc xong, sẵn sàng tiếp tục."
```

---

## 🔴 ĐANG LÀM DỞ (cần làm tiếp ngay)

### 1. ⚠️ Run SQL claim_welcome_bonus (BLOCKING — đang làm dở)

**File**: `/Users/Owner/bep-thuy-japan/supabase-claim-welcome-bonus.sql`

**Trạng thái**: Function cũ tồn tại trong DB với return type khác → cần `DROP FUNCTION IF EXISTS` trước `CREATE`.

**Run trong Supabase SQL Editor**: https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new

```sql
ALTER TABLE public.points_transactions
  ALTER COLUMN order_no DROP NOT NULL,
  ALTER COLUMN order_total DROP NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_claimed_at timestamptz;

DROP FUNCTION IF EXISTS public.claim_welcome_bonus();

CREATE FUNCTION public.claim_welcome_bonus()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_already timestamptz;
  v_points int := 100;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  INSERT INTO public.profiles (id) VALUES (v_user_id) ON CONFLICT (id) DO NOTHING;
  UPDATE public.profiles SET welcome_claimed_at = now()
   WHERE id = v_user_id AND welcome_claimed_at IS NULL;
  IF NOT FOUND THEN
    SELECT welcome_claimed_at INTO v_already FROM public.profiles WHERE id = v_user_id;
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed', 'claimed_at', v_already);
  END IF;
  INSERT INTO public.points_transactions (user_id, order_no, order_total, points, type, description)
  VALUES (v_user_id, NULL, NULL, v_points, 'welcome', 'Thưởng chào mừng đăng ký thành viên 🎁');
  RETURN jsonb_build_object('ok', true, 'points', v_points);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_welcome_bonus() TO authenticated;

SELECT
  count(*) FILTER (WHERE welcome_claimed_at IS NOT NULL) AS already_claimed,
  count(*) FILTER (WHERE welcome_claimed_at IS NULL)     AS pending_claim,
  count(*) AS total_profiles
FROM public.profiles;
```

**Sau khi run**: test bằng cách đăng ký account test → nhận email GetResponse → click link `?claim=welcome` → phải thấy banner "Đã nhận 100 điểm".

### 2. 📧 GetResponse autoresponder
- Anh đã setup tự động gửi welcome email khi customer đăng ký
- Email chứa link `/thanh-vien?claim=welcome`
- Sau khi RPC ở (1) hoạt động, flow sẽ hoàn chỉnh

---

## ✅ ĐÃ HOÀN THÀNH TRONG SESSION NÀY (2026-04-25/26)

### A. Admin Dashboard `/thuythang`

**Pagination**:
- 25 đơn/page cho 4 tab (Tổng Quan đã bỏ list, Đơn Hàng, Khách Hàng, Tin Nhắn)
- Smart ellipsis (max 7 page numbers): `1 ... 4 5 6 ... N`
- Pagination cả TOP và BOTTOM của bảng (sync với nhau)
- Click pagination → scroll về `top: 0` (dưới sticky header)

**Tab Tổng Quan refactor**:
- Bỏ "Đơn Cần Xử Lý" + "Đơn Mới Nhất" (di chuyển xuống Orders tab)
- Merge tab Thống Kê vào (4 stat cards: 7/30/90 ngày + Tổng khách)
- Stat cards clickable: "Đơn hôm nay" → Orders tab + filter today; "Chờ xử lý" → sub-tab Chờ TT
- Card "📊 Báo cáo chi tiết" với:
  - Tỷ suất lợi nhuận input (lưu localStorage)
  - Bảng tổng 5 chỉ số × 4 kỳ (30 ngày · 6 tháng · 12 tháng · Từ đầu)
  - Period selector (Năm + Tháng → stat cards filtered)
  - Bảng so sánh tháng (12 tháng)
  - Bảng so sánh năm (tất cả)
- Card "🧾 Giá vốn sản phẩm" với 10 sản phẩm cố định (từ catalog `[GT]`, `[GKT]`, etc.):
  - Cột: Sản phẩm | Giá bán | Giá vốn (input) | Lợi nhuận/unit | % Lợi nhuận | Lưu
  - Tự tính lợi nhuận khi nhập cost
  - Diagnostic note dưới bảng tổng (bao nhiêu đơn không có items detail)

**Tab Đơn Hàng**:
- 4 sub-tabs: 📊 Tổng | ⏳ Chờ TT | ✅ Đã TT | ❌ Đã huỷ (bỏ dropdown filter cũ)
- Mã đơn (`#TJxxxx`) clickable → modal chi tiết
- Bỏ nút 👁 (eye) thừa
- Checkbox + Bulk actions: Xác nhận TT, Đã gửi, Hủy đơn, Bỏ chọn
- Inline action buttons mỗi row: ✅ XN TT · 🚚 Đã gửi · 💬 Báo TT · ❌ Hủy
- 💬 Báo TT mở customer modal với template "Cảm ơn anh/chị! Bếp Thuỷ đã nhận được tiền chuyển..."
- Ship modal: ngày gửi · carrier (Japan Post/Yamato/Sagawa) · phương thức · per-order tracking number
- Date filter chip: "📅 Đơn hôm nay (YYYY/MM/DD) · ✕ Bỏ lọc"
- Hiển thị mã KH (R-XXXXXX hoặc Guest-XXXXXX) trên dòng tên khách

**Tab Khách Hàng**:
- Tên KH = link đỏ → mở customer detail modal
- 🔔 N badge nếu khách có tin nhắn chưa đọc
- Cột Liên Hệ hiện cả phone + email
- Cột "Tổng Đơn" clickable
- Cột Thao Tác: 💬 Nhắn tin
- Mã KH (R-XXXXXX) hiện trên dòng tên

**Customer Detail Modal**:
- Stats: Tổng đơn (+ N đã hủy nếu có) · Tổng chi · Điểm · Đơn gần nhất
- Card Liên hệ: phone + email + prefecture
- Section Tin nhắn: số chủ đề + chủ đề gần nhất + nút "Xem đầy đủ ở tab Tin Nhắn" (filter chỉ tin của khách đó) + input gửi tin nhắn
- Lịch sử đơn hàng: click mã đơn → mở order modal
- Mã KH hiện ở header

**Tab Tin Nhắn**:
- Pagination 25 thread/page (top + bottom)
- Filter banner khi sang từ customer modal: "📌 Đang xem tin của X · ✕ Xem tất cả"
- Persistent unread alert (banner đỏ vĩnh viễn khi có unread, có nút "✓ Đánh dấu tất cả đã đọc")
- Tên khách trong thread = link mở customer modal
- Email khách hiển thị nếu có
- Mã đơn trong body tin nhắn (TJxxxx, #0034) tự linkify → click mở order modal
- Reply tự động mark thread đó đã đọc
- Bỏ auto-mark all-as-read khi mở tab (admin chủ động click "Đã đọc")

**Order Detail Modal**:
- Thêm card xanh "🚚 Thông tin vận chuyển" (carrier, method, tracking number, ship date)
- Payment confirmations đã có sẵn

**Stats / Profit calculation**:
- 10 sản phẩm catalog cố định (`product_catalog` table) — Giò GT/GKT, Chả C/CKT, CLUA, Mọc M/MKT, Nem, Pte, CLUA TIEU
- Match orders.items theo `[CODE]` prefix
- Cost calc dùng `units = wt/0.5` (đơn vị 0.5kg / 1 hộp), KHÔNG dùng `qty` (luôn = 1)
- Profit semantics: Lợi nhuận ròng = Doanh thu (subtotal) − Chi phí giá vốn (phí ship NEUTRAL pass-through)
- Đơn không có items → fallback margin% trên subtotal

**Customer codes**:
- `R-000001 → R-999999` (6 chữ số) cho khách đăng ký, lex sort luôn đúng
- `Guest-000001` cho khách lẻ (compute trong JS từ email + first order date)
- Function `generate_customer_code()` trong DB, trigger `handle_new_user` tự gen

### B. Customer-facing pages

**Trang `/thanh-vien` (Member dashboard)**:
- Banner vàng "🎁 4 bước nhỏ — Nhận 100 điểm thưởng" trên đầu form đăng ký + link đến guide email
- Post-signup confirm box thêm link sang guide chi tiết
- Tab order: Đơn Hàng · Hướng Dẫn Thanh Toán (kem vàng, link external) · Tin Nhắn (xanh dương nhạt) · Thông Tin · Địa Chỉ · Mật Khẩu · Điểm Thưởng

**Trang `/huong-dan-thanh-vien`**:
- Trim còn 3 bước email (mở email → click xác thực → kích hoạt 100 điểm)
- 7 ảnh screenshot có pre-annotated vòng vàng (anh chụp + đánh dấu sẵn)
- Brand styling: Playfair Display headings, gradient hero, sparkles, ornaments
- Bước 1+2 (mở trang đăng ký + điền form) đã đưa vào inline ở `/thanh-vien`

**Trang `/huong-dan-thanh-toan` (NEW)**:
- 5 bước: Mở đơn · Thanh toán PayPay/Bank · Chụp biên lai · Gửi biên lai · Đợi xác nhận
- 5 ảnh screenshot pre-annotated
- Bước 5 (đợi xác nhận) tone xanh lá

**Trang chủ `/`**:
- Trang xác nhận đơn (#order-success) hiện card xanh upsell cho guest:
  - "🎁 Đăng ký nhận quà — chỉ 30 giây"
  - Lưu prefill data vào sessionStorage
  - Click → `/thanh-vien?prefill=1` → tự switch tab Đăng Ký + fill 6 trường (email/name/phone/prefecture/postal/address) → khách chỉ cần gõ password

### C. Database & Auth

**Migrations đã chạy** (theo thứ tự trong session):
1. `supabase-tracking-shipping.sql` — thêm `tracking_number/carrier/shipping_method`, update RPC `mark_order_shipped(text, text, text, text)`
2. `supabase-product-costs.sql` — DROPPED, replaced by `supabase-product-catalog.sql`
3. `supabase-product-catalog.sql` — bảng catalog cố định 10 sản phẩm
4. `supabase-admin-insert-thread.sql` — admin INSERT policy cho `message_threads` (fix nút 💬 Báo TT lỗi RLS)
5. `supabase-link-guest-orders.sql` — auto-link đơn guest qua email + backfill (kết quả: 82/112 đơn đã link)
6. `supabase-customer-code.sql` — `customer_code` 6 chữ số R-000001, trigger auto-gen, backfill cho profiles cũ

**Migration đang chờ chạy**:
- `supabase-claim-welcome-bonus.sql` — RPC welcome bonus 100 điểm (lỗi return type → cần DROP trước, xem section "ĐANG LÀM DỞ")

**Auth fixes**:
- `submitForgotPassword`: thêm captchaToken (Supabase reject reset password không có captcha)
- Recovery URL: capture `_IS_RECOVERY_URL` flag TRƯỚC `createClient` (Supabase auto-clear hash với detectSessionInUrl:true)
- HEAD warmup ping `/rest/v1/`: bỏ vì sb_publishable_* keys reject HEAD với 401

**Apps Script**:
- File: `google-apps-script.js` (1818 lines)
- Functions: `sendBirthdayEmails`, `sendInactiveReminders`, `sendTelegramNotification_`, `backfillOrdersToSupabase`
- 2 daily triggers đã setup: birthday 9-10am JST, inactive 10-11am JST
- Welcome email: anh đã setup qua **GetResponse autoresponder** (không qua Apps Script)

### D. Bug fixes quan trọng

| # | Bug | Fix |
|---|-----|-----|
| 1 | Cost calc dùng `qty=1` | Dùng `units = wt/0.5` |
| 2 | Profit gồm cả phí ship | Tách ra: Lợi nhuận ròng = Doanh thu − Chi phí giá vốn |
| 3 | Đơn không có items → cost=0 → profit ảo | Fallback margin% trên subtotal |
| 4 | Tailwind CDN bị CSP chặn | Thêm `cdn.tailwindcss.com` vào script-src |
| 5 | Forgot password: "captcha verification process failed" | Pass captchaToken vào resetPasswordForEmail |
| 6 | Click reset link → tự đăng nhập (không hiện form) | Capture recovery flag trước Supabase clear hash |
| 7 | HEAD `/rest/v1/` → 401 | Bỏ warmup ping |
| 8 | Nút 💬 Báo TT → RLS error | Thêm policy "Admin inserts threads" |
| 9 | 82 khách không thấy lịch sử đơn | Trigger handle_new_user tự link đơn cũ qua email + backfill |
| 10 | Customer code R-? cho Orders tab | loadCustomers song song với loadDashboard |
| 11 | `shipPref is not defined` ở showSuccess | Dùng đúng tên biến scope (`pref/postal/address`) |
| 12 | Upsell banner không hiện | Show/hide trong showStep('order-success') không phải placeOrder |
| 13 | claim_welcome_bonus RPC không tồn tại | (đang làm dở — cần run SQL) |

---

## 🔐 BẢO MẬT — CỰC KỲ QUAN TRỌNG

### 🚨 Việc anh CẦN LÀM ngay

1. **Rotate legacy JWT secret** ⚠️
   - service_role JWT đã từng commit vào git history (lúc đầu khi setup repo)
   - Tuy đã xoá khỏi code hiện tại nhưng vẫn còn trong git history
   - **Action**: Vào https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/settings/api → Click **"Reset JWT Secret"** (warning: invalidate cả anon + service keys)
   - Sau khi reset, update Apps Script Properties `SUPABASE_SERVICE_KEY` với key mới

2. **Đổi Github repo từ public → private** (nếu có thể)
   - Hiện public vì Vercel Hobby cần access
   - Có thể cấp GitHub App permission rồi đổi private (Vercel Pro mới support trực tiếp)
   - Hoặc accept current state — code public OK miễn không có secrets trong code

3. **Bỏ secrets trong git history** (nếu rotate JWT chưa đủ an tâm)
   - Dùng `git filter-repo` hoặc BFG Repo-Cleaner để xoá các commit có secret
   - Phức tạp, chỉ làm nếu thật cần

4. **Backup database định kỳ**
   - Supabase Free tier chỉ backup 1 ngày
   - Dùng `supabase db dump` weekly hoặc upgrade Pro
   - Hoặc chạy Apps Script function export Supabase → Sheets weekly

### ✅ Đã có sẵn (đừng đụng)

- **CSP headers** trong `vercel.json`: chặt chẽ với allowlist cho Tailwind/Supabase/hCaptcha/Google Analytics
- **HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy**: đã set
- **hCaptcha invisible** trên signup/login/forgot password
- **RLS policies**: đầy đủ cho orders/profiles/messages/points_transactions/admin_users/payment_confirmations
- **Auth**: Supabase với email confirmation bắt buộc
- **Apps Script Properties**: secrets không nằm trong code
- **Rate limiting** trong Apps Script (10 req/60s/IP)
- **Anti-fraud payment proof**: SHA-256 dedup, file size limits, 3 max uploads/order

### 🟡 Cần để ý

- **Admin login**: hiện chỉ 1 account (`thanghoang1109@gmail.com`). Đặt mật khẩu mạnh + 2FA Supabase nếu có
- **Apps Script triggers**: nếu Google quota hết (~100 emails/day) thì birthday/inactive sẽ skip. Monitor execution logs
- **PayPay QR**: hết hạn ~30 ngày. Hiện tại `p2p01_qxomK6ZT3vnW9RHW` (tạo 2026-04-24, hết hạn ~2026-05-24). Đổi QR mới trong `index.html` line 1116, 1028 trước khi hết hạn
- **30 đơn guest còn lại**: chưa link với account → khách không xem được lịch sử (không phải bug, chỉ là khách chưa đăng ký)
- **Tin nhắn không có lock**: admin và customer có thể nhắn nhau không giới hạn → dễ spam. Có thể thêm rate limit nếu cần

---

## 🎯 DỰ ĐỊNH CẦN LÀM

### Tuần này (high priority)

1. **Run SQL claim_welcome_bonus** + test welcome flow (xem section "ĐANG LÀM DỞ" #1)
2. **Rotate JWT secret** trên Supabase Dashboard
3. **Backup database** thủ công (download SQL dump 1 lần để có ảnh)

### 1-2 tuần tới (medium)

4. **Email re-marketing 30 guest cũ** — gửi 1 email blast: "Anh/chị có đơn cũ ở Bếp Thuỷ. Đăng ký bằng email này → tự khôi phục lịch sử + nhận 200 điểm bonus"
5. **Admin: tag Guest VIP** — khách guest có ≥3 đơn / chi tiêu ≥¥30k → highlight để focus marketing convert
6. **Apps Script daily reminder gửi email cho guest sau N ngày đặt đơn** (nếu chưa đăng ký)
7. **Mobile app (xem section bên dưới)**

### 1-2 tháng tới (lớn)

8. **Coupons management** trong admin — tạo/xem/cấp coupon code, % giảm
9. **Email campaign manual** trong admin — compose + send to segment (VIP/inactive/birthday)
10. **Inventory tracking** — track tồn kho, cảnh báo sắp hết
11. **Charts trong stats** — Chart.js cho doanh thu 7/30/90 ngày, top sản phẩm
12. **Multi-admin** — thêm role "staff" với quyền hạn chế hơn super_admin
13. **Order export CSV/PDF** — bulk export đơn hàng cho kế toán
14. **Print delivery label Yamato** — tự sinh label từ thông tin đơn

---

## 📱 MOBILE APP — ĐỀ XUẤT

Anh muốn làm app cho khách tải về. Em đề xuất 3 hướng theo độ phức tạp:

### Option A — PWA (Progressive Web App) — KHUYẾN NGHỊ ⭐
**1-2 ngày dev, $0 cost**

Web app hiện tại đã gần như là PWA. Chỉ cần thêm:
- `manifest.json` (icon, theme color, display: standalone)
- Service Worker (offline cache, push notifications)
- "Add to Home Screen" prompt

**Pros**:
- Khách bookmark trên home screen → trông như app
- Hoạt động offline cơ bản (xem đơn cũ, sản phẩm)
- Push notifications (cần setup backend)
- Update tức thì (không cần App Store review)
- Cùng codebase với web

**Cons**:
- iOS hạn chế nhiều (push notifications giới hạn)
- Không có App Store badge / discoverability

### Option B — Capacitor (wrap web → native shell)
**1 tuần dev, ~$99 Apple Dev + $25 Google Play**

Bọc website trong native container, publish lên App Store / Google Play.

**Pros**:
- Trên App Store / Google Play → discoverability cao
- Cùng codebase web (chỉ cần wrapper)
- Push notifications native
- Camera/file access tốt hơn PWA

**Cons**:
- Phải maintain build pipeline (Xcode/Android Studio)
- Apple review 1-7 ngày mỗi lần update
- Update phải qua store

### Option C — React Native rewrite
**2-3 tháng dev, hoặc $5k-15k thuê ngoài**

Viết lại app native bằng React Native (hoặc Flutter).

**Pros**:
- Performance native thật
- UX cao cấp nhất
- Tận dụng được mọi tính năng OS

**Cons**:
- Tốn thời gian/tiền nhất
- Maintain 2 codebase (web + app)
- Overkill cho shop nhỏ

### 🎯 Em đề xuất

**Bắt đầu với Option A (PWA)** vì:
- Dev nhanh (1-2 ngày), em có thể làm trong 1 session
- Khách dùng ngay không cần install
- Test thị trường trước khi đầu tư app store

Sau 3-6 tháng nếu khách hài lòng + cần discoverability → upgrade lên **Option B (Capacitor)**.

**Skip Option C** trừ khi shop scale lên 1000+ đơn/ngày.

---

## 🚀 DEPLOY WORKFLOW (Quan Trọng)

### Setup Tự Động (Đã Có Sẵn):
- **GitHub** push → **Vercel** auto-deploy (~1-2 phút)

### Deploy 1 Thay Đổi:

```bash
cd /Users/Owner/bep-thuy-japan
# Edit files
git add <file>
git commit -m "feat/fix/ui: mô tả"
git push origin main
# Đợi 1-2 phút → check live
curl -I https://www.thuyjapan.com/
```

### Force Deploy:
```bash
git commit --allow-empty -m "chore: force redeploy"
git push origin main
```

### Update Apps Script:
1. https://script.google.com → project
2. Copy file `google-apps-script.js` từ GitHub raw
3. Paste vào `Mã.gs` → Cmd+S → **Deploy → Manage deployments → Edit (✏️) → New version → Deploy**

### Run Pending SQL:
1. https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
2. Paste SQL → Run

---

## 📂 KEY FILES MAP (cập nhật)

| File | Purpose |
|------|---------|
| `index.html` | Trang chủ + cart + checkout + order success (có guest upsell) |
| `thanh-vien.html` | Member dashboard (login, profile, orders, messages, payment guide tab) |
| `thuythang.html` | Admin dashboard (1500+ lines) — đã refactor lớn trong session này |
| `huong-dan-thanh-vien.html` | Customer guide: 3 bước email xác thực + 100 điểm |
| `huong-dan-thanh-toan.html` | Customer guide: 5 bước thanh toán + gửi biên lai |
| `google-apps-script.js` | Backend automation (Sheets, emails, Telegram) |
| `vercel.json` | Vercel rewrites + security headers (CSP cho phép Tailwind CDN) |
| `assets/tailwind.css` | Pre-built Tailwind cho index/thanh-vien |
| `assets/huong-dan/*.png` | 7 screenshots cho guide email |
| `assets/huong-dan/buoc{1-5}-*.png/.jpeg` | 5 screenshots cho guide payment |
| **SQL files (đã chạy / đang chờ)** | |
| `supabase-COMPLETE-birthday-inactive.sql` | Birthday + inactive emails (đã chạy) |
| `supabase-orders-migration.sql` | Bảng orders + RPC (đã chạy) |
| `supabase-admin-migration.sql` | Admin RLS (đã chạy) |
| `supabase-customer-features.sql` | Self-cancel + messaging (đã chạy) |
| `supabase-payment-proof.sql` | Payment uploads (đã chạy) |
| `supabase-tracking-shipping.sql` | Tracking columns + RPC update (đã chạy) |
| `supabase-product-catalog.sql` | 10 sản phẩm cố định (đã chạy) |
| `supabase-admin-insert-thread.sql` | Admin INSERT message_threads (đã chạy) |
| `supabase-link-guest-orders.sql` | Auto-link guest orders + backfill (đã chạy: 82/112) |
| `supabase-customer-code.sql` | Customer code R-XXXXXX (đã chạy) |
| `supabase-claim-welcome-bonus.sql` | **🔴 ĐANG CHỜ RUN — cần DROP FUNCTION trước** |

---

## 📋 READY-TO-PASTE COMMANDS

### A. Push Changes
```bash
cd /Users/Owner/bep-thuy-japan && git add -A && git commit -m "feat: <description>" && git push origin main
```

### B. Check Deployment
```bash
curl -sI "https://www.thuyjapan.com/?_$(date +%s)" | grep -iE "last-modified|age"
```

### C. Add New Admin
```sql
-- Step 1: Find UUID
SELECT id, email FROM auth.users WHERE email = 'newadmin@gmail.com';
-- Step 2: Add to admin_users
INSERT INTO public.admin_users (user_id, display_name, role)
VALUES ('<UUID>', 'Display Name', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
```

### D. Verify customer codes
```sql
SELECT count(*) AS profiles_with_code, min(customer_code) AS first, max(customer_code) AS last
FROM profiles WHERE customer_code IS NOT NULL;
```

### E. Check guest orders
```sql
SELECT
  count(*) FILTER (WHERE user_id IS NULL)     AS guest_orders,
  count(*) FILTER (WHERE user_id IS NOT NULL) AS linked_orders,
  count(*)                                    AS total
FROM public.orders;
```

---

## 🔐 SECRETS & CREDENTIALS (cập nhật)

> ⚠️ Don't share. Stored in Supabase + Apps Script Properties + LastPass

### Supabase
- **Project**: curcsvwvjkjewtonkhnr.supabase.co
- **Publishable**: `sb_publishable_Y2Nqe7A0sgkJegX-aKAwIA_r27GzCjv` (safe to expose)
- **Secret**: In Apps Script Properties as `SUPABASE_SERVICE_KEY` (legacy JWT — ⚠️ ROTATE!)
- **Admin**: thanghoang1109@gmail.com (UUID: `06f91f17-abb2-4f96-91f3-3c682b2a7d0e`)

### hCaptcha
- **Sitekey**: `37bc1d04-d54e-48c0-ac14-786ce46444f0` (in HTML)
- **Secret**: in Supabase Auth Settings

### GetResponse
- **API Key**: in Apps Script Properties (`GR_API_KEY`)
- **Campaign ID**: `fwvbg`
- **Welcome autoresponder**: setup tự động khi contact mới

### Email (Aidahost cPanel)
- **From**: support@thuyjapan.com
- **SMTP**: mail.supremecluster.com:465

### PayPay (Personal P2P)
- **Current URL**: `https://qr.paypay.ne.jp/p2p01_qxomK6ZT3vnW9RHW` (hết hạn ~2026-05-24)

### Bank (Japan Post Bank)
- **支店名**: 二〇八店 (208) · **口座番号**: 2168488 · **記号番号**: 12030-21684881
- **口座名義**: タカハラ ケイイチロウ

---

## 🐛 KINH NGHIỆM (lessons learned trong session này)

1. **Cart `qty` luôn = 1**: số lượng thực ở `wt`. Mọi cost/price calc phải dùng `wt/0.5` làm units.

2. **Tailwind CDN cần CSP allowlist**: thêm `cdn.tailwindcss.com` vào script-src. Hoặc dùng pre-built CSS.

3. **Supabase auto-process URL hash**: với `detectSessionInUrl:true`, hash bị clear ngay khi `createClient`. Phải capture hash flags TRƯỚC.

4. **Auth captcha bắt buộc cho mọi endpoint**: signUp, signIn, resetPasswordForEmail. Không có captchaToken → fail.

5. **PostgreSQL RPC conflicts**: nếu function tồn tại với return type khác → CREATE OR REPLACE fail. Phải DROP FUNCTION first.

6. **RLS guest orders**: orders với `user_id=NULL` không ai thấy được. Cần trigger auto-link khi user đăng ký bằng cùng email.

7. **Customer code padding**: 6 chữ số cho lex sort luôn đúng (4 chữ số sẽ break sau 9999).

8. **Admin INSERT policies**: admin_users SELECT/UPDATE thường có sẵn nhưng INSERT thì không. Cần explicit policy mới INSERT được.

9. **HEAD method với sb_publishable_***: 401 với endpoint root. Dùng GET hoặc bỏ.

10. **Function scope JS**: cẩn thận biến local vs param destructure (`shipPref` ở submitOrder vs `pref` ở showSuccess).

---

## 📞 SUPPORT CONTACTS

- **Hosting**: Vercel (Owner: takahashi1109y@gmail.com)
- **Database**: Supabase
- **Email Domain**: aidahost (cPanel)
- **GetResponse**: campaign `fwvbg`

---

## 💡 GENERAL ADVICE

1. **Test trên iPhone Safari** trước khi deploy (đa số khách dùng mobile)
2. **Hard reload sau deploy** (Cmd+Shift+R) để bypass cache
3. **Backup Sheets weekly** — Supabase Free chỉ backup 1 ngày
4. **Monitor Supabase usage**: https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/settings/billing
5. **Đừng commit secrets** — luôn dùng Script Properties hoặc env vars
6. **Run SQL trước, push code sau** — nếu code tham chiếu RPC mới chưa có → app crash

---

## 🎉 SESSION V3 STATS

- **~50 commits** trong session 2026-04-25/26
- **5 SQL migrations** mới (4 đã chạy, 1 đang chờ)
- **3 trang HTML mới**: huong-dan-thanh-vien, huong-dan-thanh-toan
- **30+ tính năng admin dashboard mới**: pagination, sub-tabs, bulk actions, ship modal, customer modal, stats report, product catalog, customer codes, etc.
- **15+ bug fixes**: auth, RLS, profit calc, cart units, CSP, recovery URL, etc.
- **82/112 đơn guest đã được link** với user accounts (qua email backfill)

---

*End of v3 handover document. Good luck with the next iteration!* 🍜✨

**Bếp Thuỷ Japan — Đặc Sản Phố Cổ Hà Nội Tại Nhật Bản**
