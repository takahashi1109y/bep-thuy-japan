# 📋 thuyjapan.com — Project V5 (Mac Handover · 2026-04-30)

> **Last Updated**: 2026-04-30
> **Previous handover**: `thuyjapan-com-project-v4.md` (2026-04-27, Mac)
> **Session V5 work** (Windows side, 2026-04-29 → 2026-04-30): inventory feature, Option B pay-first, 8-layer fraud verify, on-demand production report, edit shipping address, paid-only reports, PayPay Business research, Shopify research
> **Repo**: https://github.com/takahashi1109y/bep-thuy-japan
> **Live**: https://www.thuyjapan.com
> **Admin**: https://www.thuyjapan.com/thuythang
> **iOS App**: `/Users/Owner/bep-thuy-app/` (Mac — Capacitor + iOS)
> **Latest commit on main**: `4e5a2d9` (sẽ pull trên Mac)

---

## 🚨 SESSION RESTART ON MAC — PASTE THIS

```
Tôi đang tiếp tục dự án Bếp Thuỷ Japan (thuyjapan.com).
Tôi vừa chuyển từ Windows sang Mac vì Apple đã approve Apple Developer
program — tôi muốn build IPA + TestFlight + App Store.

Đọc file ~/bep-thuy-japan/thuyjapan-com-project-v5.md trước,
sau đó báo "Em đã đọc xong, sẵn sàng tiếp tục".

Pending iOS tasks: xem section "🔴 iOS NEXT STEPS" trong v5.

Trước đó tôi đang làm Bếp Thuỷ trên Windows session — section
"✅ Completed in V5 (Windows side)" tóm tắt tất cả việc đã làm.
```

---

## 🔴 iOS NEXT STEPS (BẮT ĐẦU TỪ ĐÂY trên Mac)

### 1. Pull latest từ git
```bash
cd ~/bep-thuy-japan
git pull origin main
```
→ Sẽ có:
- File này (v5)
- HUONG-DAN-PAYPAY-BUSINESS.md
- 30+ commits của session V5 (inventory, Option B, fraud verify, etc.)

### 2. Anh cung cấp Team ID

Apple Developer **Team ID** = mã 10 ký tự `A1B2C3D4E5`.
- Vào https://developer.apple.com/account → **Membership** → copy **Team ID**

### 3. Scope decision: Native enhancements

Anh muốn:
- **A (RECOMMEND)**: Hybrid — giữ WebView + add push, deep links, native share, camera, offline cache
- B: Native rebuild full (4-6 tuần, overkill)
- C: PWA service worker cache (1-2 ngày, ít native)

Default Option A — em add 7 native features (push notification, deep links, native share, camera quick-access, offline cache, badge count, haptic feedback).

### 4. Build IPA flow trên Mac

Sau khi có Team ID, em sẽ guide:

**Phase 1: Configure signing (30 phút)**
- Update `capacitor.config.json` với Team ID
- Mở Xcode → set Apple Developer team
- Bundle ID `com.bepthuyjapan.app` đã có
- Build trên iPhone vật lý → cert 1 năm (không phải 7 ngày)

**Phase 2: TestFlight (1-2 tiếng)**
- Xcode → Product → Archive
- Upload to App Store Connect
- Đợi processing 10-30 phút
- Add internal testers
- Test 3-7 ngày

**Phase 3: Native enhancements (3-5 ngày em code)**
- Push notification (cần Firebase project — anh chưa tạo)
- Deep links (cần URL scheme + Universal Links setup)
- Native share, camera, offline cache, badge, haptic

**Phase 4: App Store submission (1-2 tuần)**
- App Store Connect listing (draft đã có Vi/Jp/En)
- 4 screenshots đã có sẵn ở `~/bep-thuy-app/screenshots/`
- Submit for review (Apple review 1-7 ngày)

---

## ✅ Completed in V5 (Windows side, 2026-04-29 → 2026-04-30)

### A. Inventory Management Feature (commit 2182af5 → cb38f4d)
- **Tab "📦 Tồn Kho"** trong /thuythang (Amazon-style, 10 SKUs)
- Master Save button — count of unsaved changes, edit price + stock inline
- Expand row chevron ▼ → edit description (textarea), product code, image upload
- Image upload to Supabase Storage `product-images` bucket (5MB max, RLS admin)
- Customer site sync: prices/stock/image/description từ Supabase trên page load
- "🔴 HẾT HÀNG" overlay khi stock=0 (thay vì hide product)
- Anchor IDs `#prod-1` → `#prod-10` trên product cards
- Product names trong admin row link tới `https://thuyjapan.com/#prod-{id}` (Amazon-style)
- Apps Script `deduct_stock_for_order` RPC tự trừ tồn khi có đơn

### B. Excel Export (commit f0b5dce)
- Tô màu vàng nhạt (#FEF3C7) cho dòng đơn chưa TT (pending + customer_paid)
- Switched từ xlsx@0.18.5 → xlsx-js-style@1.2.0 (drop-in fork support styling)

### C. Option B Pay-First Checkout (commit 1975539)
- New step `payment-section` giữa checkout và success
- Customer thanh toán → upload biên lai → AI verify → create order với status='customer_paid'
- KHÔNG còn đơn `pending` (chưa TT) — buộc khách pay first
- order-success page rewritten: "✅ Đã nhận thanh toán" thay vì "ĐƠN CHƯA TT" warning

### D. AI Verify Hardening (commit 639cd0a + 75c3dc6)
- 8-layer anti-fraud check (screenshot-friendly):
  1. Exact amount match (within ¥1)
  2. Recipient name (Thanghoang / タカハラ / 2168488)
  3. SHA-256 duplicate hash check
  4. Source app (PayPay / Yucho / Mizuho / SMBC / etc.)
  5. Completion keyword (完了 / 送金 / 振込 / 支払)
  6. Date in OCR ≤ 48h
  7. Transaction reference (取引ID 17 digits / 受付番号)
  8. Image editor signature (Photoshop / GIMP / etc.)

### E. Edit Shipping Address (commit e6a8c45)
- ✏️ Sửa button trong order modal
- Inline edit form: 6 fields (postal, prefecture, address, mailbox, recipient name, recipient phone)
- New RPC `admin_update_order_address` (admin-only, SECURITY DEFINER)

### F. On-Demand Production Report (commit e2e95e6 + ec489b2)
- 📧 Gửi báo cáo email button trong Production Stats panel
- Modal: date range presets (today/yesterday/7d/30d/this month/custom) + recipient email
- Apps Script `send_production_report` endpoint

### G. Reports Paid-Only Filter (commit 86c9067)
- 8 báo cáo updated to filter status IN [confirmed, shipped, delivered]
- Loại trừ pending + customer_paid + cancelled
- Áp dụng cho: production report email, prod stats panel, charts, stat cards 7/30/90d, detailed report, inventory sales velocity, customer list aggregation, customer modal stats

### H. PayPay Business Research (commit bd8d383 → 4e5a2d9)
- File `HUONG-DAN-PAYPAY-BUSINESS.md` (~340 dòng)
- Decision: anh sẽ update 定款 của 愛ビュティージャパン KK thêm "食品の販売" (¥30-40k, 1-2 tuần ở 法務局) → apply PayPay multi-store với 1 法人 account
- Anh consolidates tax + revenue Bếp Thuỷ vào 法人 → KHÔNG đăng ký 個人事業主 riêng

### I. Shopify Research (in conversation)
- So sánh 7 EC platforms cho new TPCN/cosmetic site
- Recommend Shopify + KOMOJU plugin
- Pending decision

### J. 2-Step Verify Feature (commits e866e77, ca2b1f2, 3474484, 9e0d302) ⭐ NEW

**State machine mở rộng:**
```
pending → customer_paid → confirmed → shipped → delivered
                ↘ pending_manual_review (nhánh phụ khi AI fail nhưng anh approve)
```

**8-layer AI verify hardening:**
- `e866e77` — Layer 7 fix: support `取引番号` + space-separated digits + 12+ char fallback (PayPay/銀行 format đa dạng)
- `ca2b1f2` — Layer 6 fix: pick transaction date, NOT expiry date (regex priority)
- `3474484` — 10-agent parallel hardening: all 8 layers + admin/customer UX + docs
- `9e0d302` — Admin: show `pending_manual_review` orders trong sub-tab riêng + 🔴 red badge count

**Manual pending review flow + Agent 4 "Submit Anyway" button:**
- Khi AI verify fail (1 trong 8 layer rớt), customer thấy lý do cụ thể + button "Gửi để admin xem xét thủ công" (Agent 4)
- Order create với status=`pending_manual_review` (không phải `customer_paid`)
- Admin sub-tab "🔴 Cần duyệt thủ công" (red badge nếu có đơn pending) — anh xem biên lai upload + approve/reject

**3 admin tools mới:**
1. **Test Bill tab** trong /thuythang — upload biên lai test, xem 8 layer scoring breakdown để hiểu AI logic
2. **Manual override modal** — admin click "Duyệt thủ công" trên đơn `pending_manual_review` → status chuyển `customer_paid` + ghi audit log
3. **Audit log spec** — bảng `payment_verify_audit` log mọi quyết định AI + manual override (timestamp, admin, reason)

**Telegram alerts:**
- Anh nhận push khi có đơn `pending_manual_review` mới (cần duyệt)

---

## 🔴 PENDING USER ACTIONS (từ V5 Windows session)

| # | Việc | Status |
|---|---|---|
| 1 | **Redeploy Apps Script** với Mã.gs mới nhất (tích luỹ Option B + 8-layer + 2-step verify + manual review) | 🔴 Chưa làm — block 5 features mới |
| 2 | **Run SQL** `supabase-2-step-verify.sql` ⭐ NEW V5 | 🔴 Chưa run — block 2-step verify |
| 3 | **Run SQL** `supabase-manual-approve-payment.sql` ⭐ NEW V5 | 🔴 Chưa run — block manual override |
| 4 | **Run SQL** `supabase-admin-edit-address.sql` | 🔴 Chưa run |
| 5 | **Run SQL** `supabase-product-extras.sql` | 🔴 Chưa run |
| 6 | Test Option B + 2-step verify end-to-end với 1 đơn ¥925 thật | 🟡 Sau khi #1-5 |
| 7 | Daily trigger `sendDailyProductionReport` 23h JST | 🟡 |
| 8 | Decide PayPay path + lên 法務局 update 定款 | 🟡 |
| 9 | Decide TPCN platform (Shopify hay khác) | 🟡 |
| 10 | Rotate Supabase JWT secret | 🟡 V3 doc carry-over |
| 11 | Tạo Firebase project (cho push notification iOS) | 🟡 cần để push hoạt động |

→ Có thể làm song song với iOS app — không block.

---

## 🔐 Secrets & IDs (carry-over)

### Supabase
- Project: `curcsvwvjkjewtonkhnr.supabase.co`
- Publishable: `sb_publishable_Y2Nqe7A0sgkJegX-aKAwIA_r27GzCjv`
- Service key: trong Apps Script Properties (`SUPABASE_SERVICE_KEY`)

### Pháp nhân
- 愛ビュティージャパン株式会社 (Ai Beauty Japan KK), 4/2019
- Tax + revenue Bếp Thuỷ gộp vào 法人

### iOS
- Bundle ID: `com.bepthuyjapan.app`
- App Name: Bếp Thuỷ JP
- TestFlight emails: takahara88jp, takahashi1109y, support@thuyjapan, thanghoang1109
- **Team ID**: ⏳ ANH SẼ CUNG CẤP

### Analytics (đầy đủ V4)
- GTM: GTM-MN5QPB6G
- GA4: G-VT9TKWT1YV
- Meta Pixel: 934052532836859
- TikTok Pixel: D7NB5O3C77U44OJIM0H0
- Clarity: wi1wq231gf
- Vision API key: in Apps Script Properties (`GOOGLE_VISION_KEY`)

---

## 📂 Files Map (V5 update)

```
~/bep-thuy-japan/        # Web project (Mac)
├── index.html (~2700 dòng)
├── thuythang.html (~4400 dòng)
├── thanh-vien.html (~2900 dòng)
├── google-apps-script.js (~2700 dòng)
├── HUONG-DAN-PAYPAY-BUSINESS.md ⭐ NEW V5
├── thuyjapan-com-project-v5.md ⭐ THIS FILE
├── supabase-inventory.sql (run)
├── supabase-product-extras.sql (PENDING run) 🔴
├── supabase-admin-edit-address.sql (PENDING run) 🔴
└── ... (other guides + SQL migrations)

~/bep-thuy-app/          # iOS app (Mac, NOT in git yet)
├── capacitor.config.json
├── ios/App/App/
├── README.md
├── APP-STORE-LISTING.md
└── screenshots/01-04.png (4 ảnh App Store)
```

---

## 💡 Communication Style (carry-over)

- Em xưng "em", anh xưng "anh"
- Tiếng Việt là chính, technical terms tiếng Anh/Nhật khi cần
- Confirm trước khi action lớn (deploy, commit, push)
- Click-by-click detail khi anh nói "tôi không biết"
- "Lưu lại tất cả" → update file v5 này
- iOS work cần Mac, em sẽ guide step-by-step

---

*End of v5 handover — Mac side starts here.* 📱✨

**Bếp Thuỷ Japan — Đặc Sản Phố Cổ Hà Nội Tại Nhật Bản**
