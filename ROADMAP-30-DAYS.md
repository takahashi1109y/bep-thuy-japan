# Roadmap 30 Ngày — Bếp Thuỷ Japan (Tháng 5/2026)

> **Tác giả**: em (AI assistant của anh Thắng)
> **Ngày tạo**: 2026-05-02
> **Phạm vi**: 2026-05-01 → 2026-05-31
> **Mục tiêu chính**: từ 2-3 batches × ~100 đơn → **4 batches × 200 đơn = 800 đơn/tháng**
> **Repo**: https://github.com/takahashi1109y/bep-thuy-japan
> **Live**: https://www.thuyjapan.com
> **Pháp nhân**: 愛ビュティージャパン株式会社 (Ai Beauty Japan KK)

---

## 📊 BẢNG TÓM TẮT NHANH

| Tuần | Theme | P1 items | Outcome chính |
|---|---|---|---|
| **W1** (May 1-7) | Tech debt + tonight batch | 5 | Apps Script redeploy, 3 SQL migrations chạy, JWT rotate, batch May 1 chạy mượt |
| **W2** (May 8-14) | Customer experience overhaul | 6 | /thanh-vien Amazon redesign, "Mua lại" button, ordering UX polish |
| **W3** (May 15-21) | Marketing automation + iOS TestFlight | 6 | 4 emails auto-trigger, GetResponse cleanup, iOS TestFlight live với 5+ testers |
| **W4** (May 22-31) | PayPay + TPCN + native iOS | 7 | 定款 update submitted, PayPay applied, TPCN platform decided, App Store submission |

**Tổng**: 24 items chính (12 P1, 8 P2, 4 P3)

---

## 📅 WEEK 1 (May 1-7) — Tech Debt + Tonight's Batch Recovery

> **Theme**: Dọn nợ kỹ thuật còn tồn từ session V5, đảm bảo batch đầu tháng 5 chạy được với toàn bộ feature mới (inventory, Option B, edit address, on-demand report, paid-only filter).

### W1.1 — Redeploy Apps Script với Mã.gs mới nhất
- **Why**: Block 4 features mới (inventory deduct, edit address, on-demand report, paid-only filter) → khách order không trừ tồn kho, anh không sửa được địa chỉ
- **Effort**: em 0h / anh 0.5h (anh paste code + deploy)
- **Owner**: 👤 anh (em đã guide trong `REDEPLOY-APPS-SCRIPT-NOW.md`)
- **Priority**: 🔴 P1 (block toàn bộ feature V5)
- **Unblocks**: W1.2, W1.4, W2.x (mọi flow đặt hàng), W3 email automation

### W1.2 — Run 3 SQL migrations còn pending
- **Why**: `supabase-product-extras.sql` (cho inventory description/code/image), `supabase-admin-edit-address.sql` (cho RPC sửa địa chỉ). Apps Script sẽ throw error nếu RPC chưa có.
- **Effort**: em 0h / anh 0.25h (paste vào Supabase SQL Editor → Run)
- **Owner**: 👤 anh
- **Priority**: 🔴 P1
- **Unblocks**: edit-address, inventory image upload, full Option B testing

### W1.3 — Rotate Supabase JWT secret (carry-over từ V3)
- **Why**: JWT cũ có thể đã leak qua git history hoặc browser cache; xoay key mới là baseline security
- **Effort**: em 1h (update env vars trên Vercel + Apps Script Properties) / anh 0.25h (click Rotate trong Supabase dashboard)
- **Owner**: 🤝 cả 2
- **Priority**: 🟡 P2
- **Unblocks**: peace of mind, không có tác động trực tiếp

### W1.4 — Test Option B end-to-end với đơn ¥925 thật
- **Why**: Verify pay-first flow + AI 8-layer hoạt động đúng với 1 đơn thật trước khi mở đăng ký batch May 1
- **Effort**: em 0.5h (monitor + fix nếu có) / anh 0.5h (đặt 1 đơn thử)
- **Owner**: 🤝 cả 2
- **Priority**: 🔴 P1 (gate batch May 1)
- **Unblocks**: confidence để chạy batch May 1 với traffic thật

### W1.5 — Setup daily trigger `sendDailyProductionReport` 23h JST
- **Why**: Anh không phải vào dashboard mỗi tối — báo cáo sản xuất + ship tự động về email lúc đóng đơn
- **Effort**: em 0.25h (guide click) / anh 0.25h (set trigger trong Apps Script)
- **Owner**: 👤 anh (em guide click-by-click)
- **Priority**: 🟡 P2
- **Unblocks**: anh không quên review batch progress, baseline cho weekly dashboard W4

### W1.6 — Mở đăng ký batch May 1 (đơn đầu tháng)
- **Why**: Đợt giò chả đầu tháng — test full stack mới với traffic thật, target 200 đơn
- **Effort**: em 0.5h (monitor live) / anh 2h (post Facebook + GetResponse + reply DM)
- **Owner**: 🤝 cả 2
- **Priority**: 🔴 P1
- **Unblocks**: data thật để analyze conversion + fraud rate

### W1.7 — Hot-fix bugs phát sinh từ batch May 1
- **Why**: Batch đầu sau khi launch V5 sẽ lộ bug edge case (đặc biệt Option B + AI verify)
- **Effort**: em 4-8h (buffer) / anh 1h (test fix)
- **Owner**: 🤖 em
- **Priority**: 🔴 P1
- **Unblocks**: batch May 8 chạy ổn định hơn

---

## 📅 WEEK 2 (May 8-14) — Customer Experience Overhaul

> **Theme**: Make ordering frictionless — Amazon-style /thanh-vien dashboard, "Mua lại" 1-click cho khách quen, polish UX để conversion ≥ 30% từ traffic.

### W2.1 — /thanh-vien Amazon-style redesign
- **Why**: Khách hiện thấy 1 list đơn flat — không có order tracking, no reorder shortcut. Amazon-style với "Đơn gần đây", "Mua lại", "Theo dõi vận chuyển" sẽ tăng repeat rate
- **Effort**: em 8h / anh 1h (review + feedback)
- **Owner**: 🤖 em (anh review)
- **Priority**: 🔴 P1
- **Unblocks**: W2.2 "Mua lại" feature, W3 retention emails

### W2.2 — "Mua lại" 1-click button
- **Why**: Khách quen muốn đặt lại đơn cũ — hiện phải search lại 10 SKUs. 1-click "Mua lại" copy đơn cũ vào cart trong 2 giây
- **Effort**: em 3h / anh 0.25h (click test)
- **Owner**: 🤖 em
- **Priority**: 🔴 P1
- **Unblocks**: cao hơn repeat rate → cao hơn LTV

### W2.3 — Order tracking timeline trên /thanh-vien
- **Why**: Khách hỏi "Đơn em đến đâu rồi?" → mất thời gian admin reply. Timeline visual: Đặt → Đã TT → Đang sản xuất → Đã giao Yamato → Đang giao → Đã nhận
- **Effort**: em 4h / anh 0.5h (test với đơn thật có Yamato 11-digit)
- **Owner**: 🤖 em
- **Priority**: 🟡 P2
- **Unblocks**: giảm tải support, tăng trust

### W2.4 — Form đặt hàng: bộ nhớ địa chỉ + auto-fill
- **Why**: Khách quay lại lần 2-3 phải gõ lại địa chỉ — friction lớn. Save vào localStorage + Supabase profile, auto-fill lần sau
- **Effort**: em 2h / anh 0.25h
- **Owner**: 🤖 em
- **Priority**: 🟡 P2
- **Unblocks**: tăng conversion mobile (gõ địa chỉ JP trên phone đau)

### W2.5 — Sản phẩm "Combo gia đình" + "Dùng thử 3 món"
- **Why**: Avg order value hiện ~¥3,000. Combo 5,000-7,000 ¥ tăng AOV + giảm shipping cost ratio
- **Effort**: em 2h (add SKU 11-12 vào inventory + UI) / anh 1h (chụp ảnh combo + viết description)
- **Owner**: 🤝 cả 2
- **Priority**: 🟡 P2
- **Unblocks**: AOV tăng → ¥cùng số đơn nhưng doanh thu cao hơn

### W2.6 — Mobile-first checkout polish
- **Why**: 75%+ traffic là mobile (anh chia sẻ trước đó). Form 6 fields địa chỉ trên iPhone bị crowded
- **Effort**: em 3h / anh 0.5h test trên iPhone thật
- **Owner**: 🤖 em
- **Priority**: 🟡 P2
- **Unblocks**: conversion mobile lên ≥ 30%

### W2.7 — Mở đăng ký batch May 8
- **Why**: Đợt 2 — test với UX mới đã polish
- **Effort**: em 0.5h monitor / anh 2h marketing
- **Owner**: 🤝 cả 2
- **Priority**: 🔴 P1
- **Unblocks**: data conversion uplift sau redesign

### W2.8 — 2-step verify implementation (admin confirm step + dashboard banner + sub-tab)
- **Why**: Hiện AI verify 8-layer pass = đơn auto-confirm. Cần thêm bước anh xác nhận thủ công cho đơn AI flag `manual_review` để giảm fraud xuống ~0%. Implementation: status mới `manual_review` → dashboard banner đỏ "X đơn cần review" + sub-tab "Cần xác nhận" trong production panel
- **Effort**: em 6h (Apps Script status flow + dashboard UI + sub-tab) / anh 0.5h (test confirm/reject 2-3 đơn manual_review)
- **Owner**: 🤖 em (anh test)
- **Priority**: 🔴 P1
- **Unblocks**: W3 email auto-trigger cho manual_review, W4 audit log + reject/refund flow
- **Dependencies**: W1.1 (Apps Script redeploy) phải xong; data flow `payment_proof_hashes` → `manual_review` status

---

## 📅 WEEK 3 (May 15-21) — Marketing Automation + iOS TestFlight

> **Theme**: Stop manually sending emails — let GetResponse + Apps Script handle 4 auto-trigger flows. Push iOS app từ "code done" → "TestFlight live với 5 testers".

### W3.1 — GetResponse audit + cleanup contacts
- **Why**: List có thể có duplicates, hard bounces, inactive 6m+ → kéo deliverability xuống. Cleanup trước khi automation
- **Effort**: em 1h (script export + dedupe) / anh 0.5h (review danh sách)
- **Owner**: 🤝 cả 2
- **Priority**: 🟡 P2
- **Unblocks**: W3.2 automation chạy với list sạch

### W3.2 — Auto-trigger Email 1: Welcome (sau khi sign-up /thanh-vien)
- **Why**: Khách đăng ký xong nên có email chào + intro brand + ¥500 welcome bonus claim link
- **Effort**: em 2h (Apps Script trigger Supabase Auth → POST GetResponse API) / anh 0.25h test
- **Owner**: 🤖 em (template `email-1-getresponse.html` đã có)
- **Priority**: 🔴 P1
- **Unblocks**: brand-building từ first impression

### W3.3 — Auto-trigger Email 2: Order Confirmation + Receipt
- **Why**: Hiện anh phải reply DM Facebook xác nhận đơn — automation gửi email ngay khi `status=customer_paid`
- **Effort**: em 2h / anh 0.25h
- **Owner**: 🤖 em
- **Priority**: 🔴 P1
- **Unblocks**: anh không phải làm thủ công → giải phóng 1-2h/batch

### W3.4 — Auto-trigger Email 3: Shipping Notification (khi có Yamato 11-digit)
- **Why**: Khách hồi hộp đợi giò chả — email với tracking link giảm "Khi nào giao?" inquiry
- **Effort**: em 1.5h / anh 0.25h
- **Owner**: 🤖 em
- **Priority**: 🔴 P1
- **Unblocks**: giảm support load

### W3.5 — Auto-trigger Email 4: Re-engagement 14 ngày sau giao
- **Why**: Inactive reminder — nudge khách đặt lại sau khi tiêu hết, with "Mua lại" link
- **Effort**: em 2h (cron job + GetResponse template) / anh 0.25h
- **Owner**: 🤖 em (template `email-4-getresponse.html` đã có)
- **Priority**: 🟡 P2
- **Unblocks**: repeat rate tăng

### W3.6 — iOS TestFlight: anh cung cấp Team ID
- **Why**: Block bước Configure signing → anh phải vào https://developer.apple.com/account → Membership → copy Team ID 10 ký tự
- **Effort**: em 0h / anh 0.25h
- **Owner**: 👤 anh
- **Priority**: 🔴 P1
- **Unblocks**: W3.7, W3.8

### W3.7 — iOS Configure signing + build IPA trên Mac
- **Why**: Sau khi có Team ID → set Apple Developer team trong Xcode → build vào iPhone vật lý → cert 1 năm (không phải 7 ngày như free dev)
- **Effort**: em 1h guide / anh 1.5h (Xcode setup, em hướng dẫn click-by-click trên Mac)
- **Owner**: 🤝 cả 2 (em guide trên Mac session)
- **Priority**: 🔴 P1
- **Unblocks**: W3.8 TestFlight upload

### W3.8 — TestFlight upload + invite 5+ testers
- **Why**: Test internal trước khi App Store review. Testers: takahara88jp, takahashi1109y, support@thuyjapan, thanghoang1109 + 1-2 khách thân thiết
- **Effort**: em 0.5h / anh 1.5h (Archive → upload App Store Connect → invite testers)
- **Owner**: 🤝 cả 2
- **Priority**: 🔴 P1
- **Unblocks**: 3-7 ngày test cycle → App Store submission

### W3.9 — Mở đăng ký batch May 15
- **Why**: Đợt 3, automation đã live → anh bớt việc thủ công
- **Effort**: em 0.5h / anh 1.5h (giảm vì email tự gửi)
- **Owner**: 🤝 cả 2
- **Priority**: 🔴 P1
- **Unblocks**: validate automation với traffic thật

### W3.10 — Email auto-trigger for manual_review orders
- **Why**: Khi đơn rơi vào `manual_review` (W2.8) → khách phải biết "Đơn của em đang được xác nhận, vui lòng đợi tối đa 24h" để giảm anxiety + DM hỏi. Trigger email khi `status=manual_review`, gửi follow-up email khi anh confirm hoặc reject
- **Effort**: em 2.5h (template + Apps Script trigger flow: pending email → confirmed email / rejected email) / anh 0.25h test
- **Owner**: 🤖 em
- **Priority**: 🔴 P1
- **Unblocks**: customer trust, giảm DM "đơn em sao chưa thấy email"
- **Dependencies**: W2.8 (manual_review status) + W3.3 (order confirmation email infrastructure)

---

## 📅 WEEK 4 (May 22-31) — PayPay Path + TPCN Decision + Native iOS

> **Theme**: Long-game moves — submit 定款 update, apply PayPay, decide TPCN platform, push iOS native enhancements + App Store submission.

### W4.1 — Đến 法務局 nộp 定款 update với "食品の販売"
- **Why**: Block PayPay multi-store application; cũng cover TPCN tương lai. ¥30k + 1-2 tuần processing
- **Effort**: em 0.5h (chuẩn bị wording 事業目的) / anh 3h (đi 法務局 + nộp)
- **Owner**: 👤 anh (em soạn document)
- **Priority**: 🔴 P1 (gate cả PayPay + TPCN)
- **Unblocks**: W4.2, TPCN launch path

### W4.2 — Submit PayPay for Business application
- **Why**: Sau khi 定款 update → có 履歴事項全部証明書 mới → apply PayPay với approval rate 95%+
- **Effort**: em 0.5h (prep checklist) / anh 1h (apply trên paypay.ne.jp/store-online)
- **Owner**: 👤 anh
- **Priority**: 🔴 P1
- **Unblocks**: 3-5 ngày approval → June integration

### W4.3 — Compliance: gọi 保健所 confirm 営業届出 type
- **Why**: 食肉加工品 sell domestic — 1 số quận yêu cầu 食肉販売業届出 riêng. Free, 10 phút điện thoại
- **Effort**: em 0h / anh 0.25h
- **Owner**: 👤 anh
- **Priority**: 🟡 P2 (không block PayPay nhưng anh nên làm song song)
- **Unblocks**: legal peace of mind

### W4.4 — TPCN platform decision: Shopify vs khác
- **Why**: Anh đã research Shopify + KOMOJU. Cần decide trước khi June có thể dồn budget
- **Effort**: em 1h (final comparison sheet) / anh 1h (review + decide)
- **Owner**: 🤝 cả 2
- **Priority**: 🟡 P2
- **Unblocks**: nếu Yes → June launch TPCN site; nếu No → focus 100% Bếp Thuỷ scale

### W4.5 — iOS Native Enhancements: Phase 1 (Push Notification setup)
- **Why**: Push notification cần Firebase project — anh chưa tạo. Em guide tạo + plug Capacitor
- **Effort**: em 4h (Firebase config + Capacitor push plugin) / anh 1h (tạo Firebase, copy keys)
- **Owner**: 🤝 cả 2
- **Priority**: 🟡 P2
- **Unblocks**: anh push thông báo "Batch May 22 đang mở!" tới app users

### W4.6 — iOS Native Enhancements: Phase 2 (Deep Links + Native Share)
- **Why**: Deep link `bepthuy://order/123` mở app trực tiếp tới đơn → giảm friction. Native share để khách share đơn lên LINE/Zalo
- **Effort**: em 3h / anh 0.5h test
- **Owner**: 🤖 em
- **Priority**: 🟢 P3
- **Unblocks**: viral loop

### W4.7 — App Store submission (sau TestFlight pass)
- **Why**: Đăng ký App Store production listing với 4 screenshots đã có ở `~/bep-thuy-app/screenshots/`
- **Effort**: em 1h (review listing draft Vi/Jp/En) / anh 2h (App Store Connect submit + answer review questions)
- **Owner**: 🤝 cả 2
- **Priority**: 🔴 P1
- **Unblocks**: 1-7 ngày Apple review → app live cho công chúng

### W4.8 — Weekly Dashboard email automation (production + revenue + emails sent)
- **Why**: Anh nhận email mỗi Chủ Nhật summary tuần: số đơn, doanh thu, fraud rate, email opens, top 3 SKUs
- **Effort**: em 4h / anh 0.25h
- **Owner**: 🤖 em
- **Priority**: 🟡 P2
- **Unblocks**: data-driven decisions cho June

### W4.9 — Mở đăng ký batch May 22 + May 29 (hoặc May 30)
- **Why**: Hai đợt cuối tháng để đạt mục tiêu 4 batches × 200 đơn = 800
- **Effort**: em 1h tổng / anh 3h tổng
- **Owner**: 🤝 cả 2
- **Priority**: 🔴 P1
- **Unblocks**: chốt success metric tháng 5

### W4.10 — Audit log + reject/refund flow + privacy review (2-step verify compliance)
- **Why**: Sau 2 tuần chạy 2-step verify (W2.8) → cần (1) audit log mỗi action confirm/reject của admin để defend khi khách khiếu nại "tại sao bị reject" + chuẩn bị nếu 国民生活センター inquiry; (2) reject flow đầy đủ: KOMOJU refund auto + email reject template + log lý do; (3) privacy review: payment_proof image lưu bao lâu, ai access được, GDPR/個人情報保護法 compliance
- **Effort**: em 5h (audit log table + reject RPC + KOMOJU refund integration + privacy doc) / anh 1h (review privacy policy update + sign off retention period)
- **Owner**: 🤝 cả 2
- **Priority**: 🔴 P1
- **Unblocks**: legal defensibility, scale 2-step verify lên 800 đơn/tháng safely
- **Dependencies**: W2.8 (manual_review base) + W3.10 (email infrastructure cho reject notification)

---

## ⚠️ RỦI RO & DEPENDENCIES

### Critical path dependencies

```
W1.1 (Apps Script redeploy) ─┬─→ W1.4 (Option B test) ─→ W1.6 (Batch May 1)
                             ├─→ W2.x (mọi customer feature)
                             ├─→ W2.8 (2-step verify) ─→ W3.10 (manual_review email) ─→ W4.10 (audit + refund + privacy)
                             └─→ W3.2-W3.5 (email automation)

W3.6 (Team ID) ─→ W3.7 (Build IPA) ─→ W3.8 (TestFlight) ─→ W4.7 (App Store)

W4.1 (定款 update) ─→ W4.2 (PayPay apply) ─→ June integration
```

### Top 5 risks

1. **Apps Script redeploy fail** (W1.1) — nếu anh paste code sai → lỗi RPC → cả batch May 1 sập. **Mitigation**: em test 1 endpoint trước khi anh save deploy.
2. **AI Vision OCR false positive** (W1.4) — đơn fake qua check 8-layer → mất giò. **Mitigation**: em monitor batch May 1 trực tiếp, set alert email khi 1 đơn pass nhưng amount lệch >¥10.
3. **法務局 từ chối 事業目的 wording** (W4.1) — cần resubmit, kéo dài 1-2 tuần. **Mitigation**: em soạn 3 wording variants trước, anh đem cả 3 đi.
4. **TestFlight processing stuck** (W3.8) — Apple đôi khi delay 24-48h. **Mitigation**: upload sớm W3, không chờ deadline.
5. **Email deliverability tụt** (W3.2-3.5) — GetResponse + auto-trigger có thể bị Gmail flag spam. **Mitigation**: warm-up nhẹ tuần đầu (chỉ welcome email), monitor open rate ≥ 25%.
6. **Admin overwhelmed if too many manual_reviews** (W2.8) — nếu AI flag >20% đơn → anh không kịp confirm trong 24h, queue dồn lại 50+ đơn/batch. **Mitigation**: tune AI threshold để false-positive ≤ 10%, set alert khi queue > 15 đơn pending, weekly review để adjust scoring.
7. **Customer frustration với delays** (W2.8 + W3.10) — khách quen pay-first auto-confirm, giờ phải đợi anh xác nhận → DM hỏi nhiều, churn rate có thể tăng. **Mitigation**: email manual_review explain rõ + ETA 24h, dashboard banner promise SLA, anh confirm sớm vào batch days.
8. **Edge cases: race conditions** (W2.8 + W4.10) — anh confirm cùng lúc với customer cancel, hoặc 2 admin tab confirm/reject cùng đơn → state inconsistent. **Mitigation**: lock row khi action pending (Supabase optimistic concurrency), audit log W4.10 ghi lại tất cả attempt để debug, idempotent endpoints.

### External dependencies (không control được)

- Apple App Store review cycle (1-7 ngày)
- PayPay audit (3-5 ngày sau apply)
- 法務局 processing 定款 update (1-2 tuần)
- Manufacturer giò chả supply (đợi anh confirm)

---

## 🎯 SUCCESS METRICS — END OF MAY 2026

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | Batches successfully run | **4 batches** (May 1, 8, 15, 22 hoặc 29) | Production stats panel |
| 2 | Orders/batch | **≥ 200** trung bình | Supabase query count(*) by batch |
| 3 | Manual Yamato sheet updates | **0** (automation full) | Apps Script log |
| 4 | iOS TestFlight | **5+ testers active** | App Store Connect TestFlight tab |
| 5 | App Store submission | **Submitted (review pending hoặc approved)** | App Store Connect status |
| 6 | PayPay Business | **Application submitted** (waiting audit) | PayPay merchant portal |
| 7 | Email automation | **4 emails auto-trigger live** (welcome, order, shipping, re-engagement) | GetResponse automation logs |
| 8 | Repeat rate | **≥ 30%** khách đặt 2+ lần trong tháng | `customer_modal_stats` query |
| 9 | Conversion (mobile) | **≥ 30%** từ landing → paid order | GA4 funnel report |
| 10 | Fraud rate | **≤ 1%** đơn fake pass AI verify | Manual spot-check + payment_proof_hashes |
| 11 | 2-step verify coverage | **100%** orders go through 2-step verify | Supabase query: count đơn với status flow trải qua AI check + (auto-confirm hoặc manual_review→confirmed) |
| 12 | Manual review SLA | **Queue handled within 24h** trung bình | `manual_review_queue` table: timestamp tạo → timestamp anh action |
| 13 | AI false-negative rate | **< 5%** (fraud lọt qua AI auto-confirm) | Manual audit weekly: số fraud confirmed / tổng auto-confirmed |
| 14 | Admin confirm latency | **Median 4h** sau order tạo | Audit log W4.10: median(confirm_at - order_at) cho manual_review orders |

### Bonus stretch goals

- ✨ TPCN platform decided + setup started (W4.4 follow-through)
- ✨ AOV tăng từ ¥3,000 → ¥3,500+ (combo SKU effect, W2.5)
- ✨ App Store approved + live trong tháng 5 (depends Apple review speed)

---

## 🗓️ DAILY/WEEKLY CADENCE

### Em (AI) commit
- Daily: monitor batch days (May 1, 8, 15, 22, 29) + hot-fix
- Weekly: code review + deploy mới mỗi Chủ Nhật

### Anh commit
- Daily 30 phút: check email batch + reply DM (giảm dần khi automation lên)
- Weekly 2-3h: marketing post + 法務局/保健所 errand
- Batch days: 2-3h marketing + monitoring

### Communication
- Anh có việc gì gấp → message em ngay, em respond
- Em có blocker (cần Team ID, cần SQL run, cần Firebase) → em báo + guide click-by-click
- "Lưu lại tất cả" → em update file `thuyjapan-com-project-v6.md` cuối tháng

---

## 📁 FILES SẼ TẠO/UPDATE TRONG THÁNG 5

| File | Status |
|---|---|
| `thuyjapan-com-project-v6.md` | em sẽ tạo cuối tháng 5 (handover Mac→Windows or vice versa) |
| `supabase-paypay.sql` | em sẽ tạo W4 sau khi anh có credentials (June integration prep) |
| `thanh-vien.html` (redesign) | em update W2 |
| `index.html` (UX polish) | em update W2 |
| `google-apps-script.js` (auto emails + weekly dash) | em update W3-W4 |
| `WEEKLY-DASHBOARD-SETUP.md` | em tạo W4 |
| iOS app (`~/bep-thuy-app/`) | anh build trên Mac, em guide |

---

## 💡 NOTES CUỐI

- Roadmap này em coi là **plan**, không phải **commitment cứng**. Anh có thể thay đổi priority bất cứ lúc nào — em adjust.
- Nếu W1.1-W1.2 (anh deploy + run SQL) trễ → mọi thứ phía sau dồn 1 tuần.
- Nếu Apple Team ID anh cung cấp sớm hơn (W1 hoặc W2) → có thể đẩy iOS lên W2 hoặc W3 sớm hơn.
- Nếu PayPay approval đến cuối W4 → June em sẽ integrate (3-5 ngày code).

**Em sẵn sàng bắt đầu W1.1 ngay khi anh confirm.** 🚀

---

*End of 30-Day Roadmap — May 2026*

**Bếp Thuỷ Japan — Đặc Sản Phố Cổ Hà Nội Tại Nhật Bản** 🇻🇳🇯🇵
