# 📋 thuyjapan.com — Project V4 (Session Handover · 2026-04-27)

> **Last Updated**: 2026-04-27
> **Tech Stack**: Vercel + Supabase + Google Apps Script + Google Sheets + GetResponse + hCaptcha + GA4 + GTM + Meta Pixel + TikTok Pixel + Microsoft Clarity + Google Search Console + Google Vision API
> **Repo**: https://github.com/takahashi1109y/bep-thuy-japan
> **Live**: https://www.thuyjapan.com
> **Admin**: https://www.thuyjapan.com/thuythang
> **Latest Commit**: `a5ab20a` (head)
> **Previous handover**: `thuyjapan-com-project-v3.md`
> **iOS App**: `/Users/Owner/bep-thuy-app/` (Capacitor + iOS, builds on iPhone via Personal Team)

---

## 🚨 SESSION RESTART — ĐỌC ĐẦU TIÊN

**Khi mở session mới, paste:**

```
Tôi đang tiếp tục dự án Bếp Thuỷ Japan (thuyjapan.com).
Đọc file /Users/Owner/bep-thuy-japan/thuyjapan-com-project-v4.md trước
rồi báo "Em đã đọc xong, sẵn sàng tiếp tục."

Pending tasks: xem section "🔴 ĐANG LÀM DỞ" trong file v4.
```

---

## 🔴 ĐANG LÀM DỞ (cần làm tiếp ngay)

### 1. ⚠️ User chưa update Apps Script với code mới nhất (BLOCKING nhiều tính năng)
File code mới: https://raw.githubusercontent.com/takahashi1109y/bep-thuy-japan/main/google-apps-script.js

**Anh phải:**
1. Mở https://script.google.com → project Bếp Thuỷ Japan
2. Cmd+A → paste đè vào file `Mã.gs`
3. Cmd+S Save
4. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**

**Tại sao quan trọng:**
- AI verification biên lai → cần code mới với `verifyReceiptWithAI_`
- Email báo cáo sản xuất hàng ngày → cần `sendDailyProductionReport`
- Email tự động khi xác nhận TT / ship → cần `sendOrderConfirmedEmail_`, `sendOrderShippedEmail_`
- Email campaign hàng loạt → cần `sendCampaignEmail_`
- Bypass validation cho admin types (đã fix bug 71 email không gửi)

### 2. ⚠️ User chưa add daily trigger cho email báo cáo sản xuất
Sau khi Deploy code mới (Bước 1):
1. Apps Script → sidebar **⏰ Triggers** → **+ Add Trigger**
2. Function: `sendDailyProductionReport`
3. Time-driven · Day timer · **23:00-24:00 JST**
4. Save
- Hướng dẫn: `HUONG-DAN-SETUP-DAILY-REPORT.md`

### 3. 🆕 USER REQUEST mới (chưa làm): Tinh chỉnh email báo cáo sản xuất

**User muốn:**
- **Cấu hình** lại layout email báo cáo (anh có thể yêu cầu thay đổi cụ thể trong session sau)
- **Add link đến từng sản phẩm** trong bảng email — ví dụ click vào "Giò có tiêu" → mở https://www.thuyjapan.com/#products hoặc URL deep link tới sản phẩm cụ thể

**Em chưa làm** — chờ session sau user clarify exact layout muốn.

**Implementation hint** cho session sau:
- Edit `sendDailyProductionReport` trong `google-apps-script.js`
- Thêm cột "Link" trong table HTML, mỗi row có anchor `<a href="https://www.thuyjapan.com/#products">Xem</a>`
- Hoặc deep link tới Supabase admin order modal: `/thuythang?product=GT`

### 4. 📱 Apple Developer Program approval (đợi Apple — ngoài tầm kiểm soát)
- Anh đã đăng ký, đang chờ Apple xét duyệt 1-2 ngày
- Khi có **Team ID** (10 ký tự dạng `A1B2C3D4E5`) → báo em → em build IPA + TestFlight

### 5. 🔥 Firebase project (USER ACTION cho push notification)
Khi sẵn sàng setup push notification cho app:
1. Tạo project tại https://console.firebase.google.com → free, ~5 phút
2. Add iOS app, bundle ID `com.bepthuyjapan.app` → download `GoogleService-Info.plist`
3. Save vào `/Users/Owner/bep-thuy-app/ios/App/App/GoogleService-Info.plist`
4. Báo em → em wire push code

---

## ✅ ĐÃ HOÀN THÀNH TRONG SESSION V4 (2026-04-26/27)

### A. iOS App (Capacitor) — `/Users/Owner/bep-thuy-app/`
- ✅ Capacitor 8 project init
- ✅ Bundle ID: `com.bepthuyjapan.app`
- ✅ App Name: `Bếp Thuỷ JP`
- ✅ Custom icon BT + nón lá Việt Nam (1254×1254 source) — auto-resize iOS sizes
- ✅ Splash screen
- ✅ 5 plugins: camera, push-notifications, share, splash-screen, status-bar
- ✅ server.url = https://www.thuyjapan.com (auto-update không cần build lại)
- ✅ Built thành công trên iPhone 14 Pro Max iOS 26.3.1 via Personal Team (free, expire 7 ngày)
- ✅ App icon "Bếp Thuỷ JP" hiện đẹp trên home screen
- 🟡 Đợi Apple Developer approve để build IPA + TestFlight + submit App Store

**Files:**
- `/Users/Owner/bep-thuy-app/README.md` — build/deploy guide
- `/Users/Owner/bep-thuy-app/APP-STORE-LISTING.md` — listing draft Vi/Jp/En
- `/Users/Owner/bep-thuy-app/screenshots/01-04.png` — 4 screenshots cho App Store

### B. Customer-facing pages (nhiều cải tiến)
- ✅ Privacy Policy `/privacy` — Vietnamese GDPR + APPI compliant
- ✅ Pull-to-refresh trên 5 trang khách (`/assets/pull-to-refresh.js`)
- ✅ Floating ✕ close button trên mọi trang (`/assets/back-button.js`)
- ✅ Trang chủ: 2 nút "Hướng Dẫn Đăng Ký" + "Hướng Dẫn Chuyển Tiền" trong button stack hero
- ✅ Trong giỏ hàng: 2 nút hướng dẫn ở dưới
- ✅ Tách `huong-dan-bao-quan` + `bang-phi-ship` thành trang riêng (xoá khỏi index, gọn hơn 278 dòng)
- ✅ Compact form đăng ký (collapsible) — 5 ô bắt buộc + ẩn ô tuỳ chọn
- ✅ Email-not-confirmed UX có nút "Gửi lại email xác thực"
- ✅ All `/huong-dan-*` internal links bỏ `target="_blank"` (stay in app)
- ✅ Logo đỏ Bếp Thuỷ + version mới trên header

### C. Admin Dashboard (`/thuythang`) — refactor lớn
- ✅ Header **🏪 Bếp Thuỷ — Quản Lý** clickable → về Tổng Quan
- ✅ Persist tab + sub-tab qua reload (localStorage)
- ✅ Tab "Tổng đơn hàng" giờ EXCLUDE đơn cancelled
- ✅ Pending payments banner (vàng) ở đầu tab Đơn Hàng + popup list
- ✅ Tên khách trong bảng đơn = link → mở customer modal (có cả guest)
- ✅ Mã code Guest tự gen `Guest-XXXXXX`
- ✅ Tab Đơn Hàng — flexible date range filter (6 presets + custom)
- ✅ Tổng Quan: 2 charts (Doanh thu line đỏ + Số đơn bar xanh) — 7/30/90 ngày
- ✅ Production Stats panel — 10 sản phẩm, đơn vị kg/túi/hộp, tự trừ cancelled
- ✅ AI verification biên lai (Google Vision OCR) — 4 badge states
- ✅ Excel export đơn hàng theo ngày (khớp template tay)
- ✅ Tab "📢 Gửi Tin" — bulk email + in-app message + 7 segments
- ✅ Giá vốn sản phẩm collapsible (`<details>`)
- ✅ Auto-email khách khi admin XN TT + ship (với tracking number)
- ✅ Parse legacy concatenated items cho đơn cũ 1-41 (`"1 GT 0.5 MKT 1 Pte"` → giá đầy đủ)

### D. Apps Script (Backend) — many new functions
- ✅ `verifyReceiptWithAI_` — Google Vision OCR cho biên lai
- ✅ `sendDailyProductionReport(fromDate?, toDate?)` — email báo cáo sản xuất (default today, có thể truyền range)
- ✅ `testProductionReportRange()` — test wrapper với hardcoded dates
- ✅ `sendOrderConfirmedEmail_` + `sendOrderShippedEmail_` — auto email khách
- ✅ `sendCampaignEmail_` — bulk email với rate limit + branded HTML shell
- ✅ `aggregateOrderItemsForReport_` + `parseLegacyConcatenated_` — parse legacy items
- ✅ `extractCodeFromVietnamese_` + `canonicalizeCode_` — defensive matching
- ✅ `validatePayload_` — bypass cho admin types (fix bug 71 emails)
- 🟡 **CHƯA DEPLOY** — user cần copy-paste code mới + Deploy New Version

### E. Analytics + Marketing Stack (mới hoàn toàn)
- ✅ **GTM** container `GTM-MN5QPB6G` cài qua `/assets/gtm.js`
- ✅ **GA4** `G-VT9TKWT1YV` config qua GTM dashboard (user đã setup 5 tags trong UI)
- ✅ **Meta Pixel** `934052532836859` (4 tags: Base, AddToCart, Purchase, CompleteRegistration)
- ✅ **TikTok Pixel** `D7NB5O3C77U44OJIM0H0` (4 tags: Base, AddToCart, CompletePayment, CompleteRegistration)
- ✅ **Google Search Console** verified via HTML meta tag
- ✅ **sitemap.xml** + **robots.txt** (7 pages submitted)
- ✅ **Microsoft Clarity** `wi1wq231gf` (heatmap + recordings)
- ✅ **Google Vision API** + Cloud Billing (free tier 1000 ảnh/tháng)
- ✅ E-commerce dataLayer events: `add_to_cart`, `purchase`, `sign_up`, `login`
- ✅ CSP updated: connect.facebook.net, analytics.tiktok.com, *.tiktok.us, www.clarity.ms, googletagmanager (frame-src)

### F. Bug fixes lớn
- ✅ Validate payload bypass admin types → fix campaign email + auto emails + AI verify
- ✅ Tab "all" exclude cancelled orders (nháy mắt admin chỉ thấy đơn active)
- ✅ Persist admin tab qua reload (không bị nhảy về Tổng Quan)
- ✅ NEM uppercase → Nem lowercase (match cart format `[Nem]` thay vì `[NEM]`)
- ✅ Charts read from `statsOrders` (loaded by dashboard) thay vì `allOrders` (lazy)
- ✅ Legacy items parse cho orders 1-41 (concatenated `"1 GT 0.5 MKT 1 Pte"`)

---

## 🔐 SECRETS & CREDENTIALS (cập nhật)

### Supabase
- Project: curcsvwvjkjewtonkhnr.supabase.co
- Publishable: `sb_publishable_Y2Nqe7A0sgkJegX-aKAwIA_r27GzCjv` (safe to expose)
- Secret: In Apps Script Properties as `SUPABASE_SERVICE_KEY`
- Admin: thanghoang1109@gmail.com (UUID: `06f91f17-abb2-4f96-91f3-3c682b2a7d0e`)

### hCaptcha
- Sitekey: `37bc1d04-d54e-48c0-ac14-786ce46444f0`
- Secret: in Supabase Auth Settings

### GetResponse
- API Key: in Apps Script Properties (`GR_API_KEY`)
- Campaign ID: `fwvbg`

### Google Vision API
- Key: in Apps Script Properties (`GOOGLE_VISION_KEY = AIzaSyC_xxxxxxxxxxxxxxxxxxx`)
- Project: BepThuyJapan-AI
- Free tier: 1000 ảnh/tháng

### Analytics IDs (cài đầy đủ)
- **GA4 Measurement ID**: `G-VT9TKWT1YV`
- **GTM Container ID**: `GTM-MN5QPB6G`
- **Meta Pixel ID**: `934052532836859` (Thuy Japan Pixel)
- **TikTok Pixel ID**: `D7NB5O3C77U44OJIM0H0`
- **Microsoft Clarity ID**: `wi1wq231gf`
- **Google Search Console**: verified via meta `j3kPnQLnNv6ljzjUW0rWAfTUrT18Vygbhc6jXlm8cbw`

### iOS App (Capacitor)
- Bundle ID: `com.bepthuyjapan.app`
- App Name: `Bếp Thuỷ JP`
- Repository: `/Users/Owner/bep-thuy-app/` (local, not on GitHub yet)
- Apple Developer: 🟡 đang chờ duyệt
- TestFlight emails: takahara88jp, takahashi1109y, support@thuyjapan, thanghoang1109

### Email automation
- Daily report recipient: `support@thuyjapan.com` (in Apps Script `PRODUCTION_REPORT_EMAIL`)

### PayPay
- Current QR URL: `https://qr.paypay.ne.jp/p2p01_qxomK6ZT3vnW9RHW` (hết hạn ~2026-05-24)

### Bank
- 支店名: 二〇八店 (208) · 口座番号: 2168488 · 記号番号: 12030-21684881
- 口座名義: タカハラ ケイイチロウ

---

## 📝 USER ACTIONS THEO ƯU TIÊN

### 🔥 Urgent (làm trong tuần này)

| # | Việc | Thời gian | Khó |
|---|---|---|---|
| 1 | Deploy Apps Script code mới (kích hoạt AI verify, email auto, campaign, daily report) | 5 phút | Easy |
| 2 | Add daily trigger `sendDailyProductionReport` lúc 23h JST | 2 phút | Easy |
| 3 | Test bằng `testProductionReportRange()` để verify email gửi được | 3 phút | Easy |

### 🟡 Khi sẵn sàng (không gấp)

| # | Việc | Thời gian | Khó |
|---|---|---|---|
| 4 | Tinh chỉnh email báo cáo sản xuất + add link sản phẩm (yêu cầu mới) | Discussion với em | Medium |
| 5 | Tạo Firebase project (cho push notification app) | 5 phút | Easy |
| 6 | Verify Microsoft Clarity sau ~1 tuần data | 2 phút | Easy |
| 7 | Wait Apple Developer approval (đợi Apple) | 1-2 ngày | - |
| 8 | Sau khi có Team ID → build IPA + upload TestFlight | em làm | - |

### 🔵 Tương lai (1-3 tháng)

| # | Việc | Tại sao |
|---|---|---|
| 9 | Đợi pixel "chín" 2-4 tuần data → chạy retargeting Meta/TikTok | ROI cao |
| 10 | Setup Conversions API (CAPI) cho Meta — bypass iOS 14.5+ ATT | Tracking accuracy +30% |
| 11 | Upload product feed Catalog → Dynamic Ads (như Shopee) | Auto-show từng sản phẩm |
| 12 | Submit App Store sau TestFlight stable 1-2 tuần | App Store presence |
| 13 | Add Android version (Capacitor) | Mở rộng |
| 14 | Conversions tracking từ FB/TikTok Ads → ROI report | Đo hiệu quả ads |

---

## 📂 FILES MAP (cập nhật v4)

| File | Mục đích |
|---|---|
| `index.html` | Trang chủ |
| `thanh-vien.html` | Thành viên (login/register/dashboard) |
| `thuythang.html` | Admin (đã thêm tab Gửi Tin + Production Stats + Charts + Date filter) |
| `huong-dan-thanh-vien.html` | Guide đăng ký |
| `huong-dan-thanh-toan.html` | Guide thanh toán |
| `huong-dan-bao-quan.html` | Guide bảo quản (mới) |
| `bang-phi-ship.html` | Bảng phí ship Yamato (mới) |
| `privacy.html` | Privacy Policy (mới) |
| `sitemap.xml` | Sitemap cho Search Console (mới) |
| `robots.txt` | Robots cho crawler (mới) |
| `assets/pull-to-refresh.js` | Pull-to-refresh (mới) |
| `assets/back-button.js` | Floating ✕ button (mới) |
| `assets/gtm.js` | GTM + Clarity loader (mới) |
| `assets/tailwind.css` | Pre-built Tailwind |
| `vercel.json` | CSP đã update đầy đủ tất cả pixels |
| `google-apps-script.js` | Backend (1900+ lines) — **chưa deploy production** |

### 📚 Documentation (mới trong v4)
| File | Mục đích |
|---|---|
| `HUONG-DAN-SETUP-AI-VERIFY.md` | Setup Google Vision API |
| `HUONG-DAN-SETUP-DAILY-REPORT.md` | Setup daily email cron |
| `HUONG-DAN-EMAIL-CAMPAIGN.md` | Cách dùng tab Gửi Tin |
| `HUONG-DAN-SETUP-GTM.md` | Hướng dẫn config GTM dashboard |

### SQL Migrations
| File | Trạng thái |
|---|---|
| `supabase-ai-payment-verify.sql` | ✅ Đã chạy (thêm cột ai_*) |
| Các migrations cũ | ✅ Đã chạy từ session V3 |

---

## 🚀 DEPLOY WORKFLOW

```bash
cd /Users/Owner/bep-thuy-japan
# Edit files
git add <file>
git commit -m "feat/fix/ui: mô tả"
git push origin main
# Vercel auto-deploy ~1-2 phút
```

**Apps Script** không auto-deploy — phải manual:
1. https://script.google.com → project Bếp Thuỷ Japan
2. Copy code mới từ `https://raw.githubusercontent.com/takahashi1109y/bep-thuy-japan/main/google-apps-script.js`
3. Paste đè vào file `Mã.gs`
4. Cmd+S
5. Deploy → Manage deployments → ✏️ Edit → New version → Deploy

---

## 🎯 USER QUESTIONS / CONTEXT (cho session sau)

### Anh hay quên / cần nhắc lại
- Apps Script không tự sync GitHub → mỗi lần em update code, anh phải copy-paste manual
- App ký Personal Team chỉ chạy 7 ngày → mỗi 7 ngày anh phải cắm iPhone vào Mac, mở Xcode, bấm Run lại
- Khi Apple Developer được duyệt → cần Team ID (10 ký tự) gửi em

### Phong cách giao tiếp
- Em luôn xưng "em", anh xưng "anh"
- Tiếng Việt là chính, có insert tiếng Anh / Nhật khi cần technical terms
- Em luôn confirm trước khi làm action lớn (deploy, commit, etc.)
- Em chia nhỏ task để anh dễ follow

### Anh thường hỏi
- "Tôi ngu lắm" / "tôi không biết" → em hướng dẫn click-by-click với rất nhiều detail
- "Lưu lại tất cả" → cập nhật file project handover này
- Hay yêu cầu screenshot verify trước khi approve

---

## 💡 SESSION V4 STATS

- **30 commits** trong 2 ngày 26-27/04
- **6 analytics tools** mới (GA4, GTM, Meta, TikTok, Search Console, Clarity)
- **5 admin features** lớn (Production Stats, Charts, Date filter, Email Campaign, AI Verify)
- **iOS App** built thành công lên iPhone vật lý
- **3 documentation files** mới
- **2 customer-facing pages** mới (privacy, huong-dan-bao-quan, bang-phi-ship)
- **9 critical bugs** fixed (validate payload, NEM case, legacy items, charts data source, ...)

---

*End of v4 handover document. Lúc nào cần em pickup, anh đọc file này trước nhé!* 🍜✨

**Bếp Thuỷ Japan — Đặc Sản Phố Cổ Hà Nội Tại Nhật Bản**
