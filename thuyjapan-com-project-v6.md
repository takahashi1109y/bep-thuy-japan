# 📋 thuyjapan.com — Project V6 (Session Handover · 2026-05-02)

> **Last Updated**: 2026-05-02 cuối session (Windows)
> **Previous handover**: `thuyjapan-com-project-v5.md` (2026-04-30)
> **V6 work** (2026-05-02): tracking modal, 2-step verify, 60+ agents spawned across day
> **Repo**: https://github.com/takahashi1109y/bep-thuy-japan
> **Live**: https://www.thuyjapan.com · **Admin**: /thuythang
> **Latest commit on main**: `510ffe1`

---

## 🚨 SESSION RESTART — PASTE THIS

```
Tôi đang tiếp tục dự án Bếp Thuỷ Japan (thuyjapan.com).
Đọc file K:\bep-thuy-japan\thuyjapan-com-project-v6.md trước.
Ưu tiên: anh chưa redeploy Apps Script + chưa run 2 SQL migrations →
nhiều features mới chưa active production.
Báo "Em đã đọc xong, sẵn sàng tiếp tục."
```

---

## ✅ ĐÃ LÀM + ĐÃ TEST (working in production)

| Feature | Commit | Trạng thái |
|---|---|---|
| Inventory tab Phase A+B (Amazon-style, 10 SKUs) | 2182af5 → cb38f4d | ✅ Anh confirm working |
| Excel export tô vàng đơn chưa TT | f0b5dce | ✅ Working |
| **Email 2 gửi thành công qua GetResponse** | — (file template) | ✅ Anh đã gửi cho khách |
| `/thanh-vien` header refactor (compact, "Bạn có X điểm" 1.5x size) | 9b4216a, c553934, 9 agents 8c1381d | ✅ Working |
| Bỏ "Quy định hủy đơn" trong member dashboard | c553934 | ✅ Working |
| Tracking modal "📍 Tình trạng vận chuyển" button (always show) | 6677821, 706403e, 1f016f3 | ✅ Working |
| Status-aware modal messages (chưa TT / đang chuẩn bị / đã giao...) | 1f016f3 | ✅ Working |
| **Anh tự thanh toán ¥2,300 thành công** | — | ✅ PayPay confirmed |

---

## ⚠️ ĐÃ CODE NHƯNG CHƯA TEST PRODUCTION (waiting redeploy + SQL)

### A. AI Verify Hardening (6 commits accumulated)
| Layer | Fix | Commit |
|---|---|---|
| Layer 7 (取引番号) | Support 取引番号 + space-split + 12+ char fallback | e866e77 |
| Layer 6 (date) | Pick transaction date NOT expiry, 60-char keyword context | ca2b1f2 |
| Layer 1 (amount) | Full-width digits ０-９, ¥ space, ｴﾝ katakana | 3474484 (Agent 1) |
| Layer 2 (recipient) | 5 new patterns: PayPay UI, OCR fuzzy, bank prefix | 3474484 (Agent 2) |
| Layer 5 (completion) | 8 new keywords: 送り, 受取, 振替... | 3474484 (Agent 3) |

### B. 2-Step Verify Infrastructure
- New status `pending_manual_review` + sub-tab "🚨 Cần xem xét" (red badge pulse)
- Admin "✅ Xác nhận thanh toán lần 2" button + "❌ Từ chối & hoàn tiền" button
- RPCs: `admin_confirm_payment`, `admin_reject_payment` (in supabase-2-step-verify.sql)
- Manual override modal (image preview + reason templates + Enter-to-submit)
- Customer fallback after 2 verify fails: "📋 Gửi cho admin xem" button
- Email auto-send to admin when manual_review created (sendManualReviewEmailToAdmin_)
- Telegram alerts (sendVerifyFailureTelegram_, sendManualReviewTelegramAlert_)
- Browser Notification API + sound alert (3 beeps) for new manual_review

### C. Image Display Fix (CRITICAL bug fix)
- Apps Script: rename `image_url`→`screenshot_url`, `amount`→`claimed_amount`, `notes`→`note`, `ai_detected_amount`→`ai_verified_amount` (matches DB column names)
- Generate signed URL (1 year TTL) instead of public URL (bucket is private)
- Apply to both savePaymentProofForVerifiedOrder_ + savePaymentProofForManualReview_
- Admin modal: getImageUrl() helper handles signed/public/legacy paths + lightbox + broken image fallback

### D. Admin Tools (new in /thuythang)
- **🧪 Test Bill** tab — paste image URL + amount → see all 8 layers PASS/FAIL
- **🛡️ Phê duyệt thủ công** modal — image preview + reason templates
- Dashboard banner widget: "🚨 N đơn cần xem xét"
- Manual override now logs to admin_audit_log (immutable, 7-year retention per 商法)

### E. Tracking Modal Backend (Yamato/Sagawa scraping)
- doPost handler `fetch_tracking_events` accepts carrier + tracking_no
- scrapeYamatoTracking_ — regex parses HTML table rows
- scrapeSagawaTracking_ — handles M/D auto-prepend year
- 5min localStorage cache + retry button + Yamato/Sagawa deep-link fallback
- Customer modal shows timeline events grouped by date (Amazon-style)

### F. Verify Debug Tools
- testVerifyBillDebug(imageUrl, expectedAmount) — Apps Script editor function
- testVerifyFromConfirmation(confirmationId) — load from Supabase + run all 8 layers
- All log to View → Logs

### G. /thanh-vien Amazon Order Card
- Order card Amazon-style: header xám 3 columns, status pill 6 colors, items preview, action row (Mua lại / Tracking / Liên hệ / Huỷ)
- "🔄 Mua lại" feature: localStorage cart + redirect to / with skipped items
- Empty state: 🍜 + "Mua hàng đầu tiên" CTA + 100 điểm teaser
- Skeleton loaders (3 pulsing cards) thay text "Đang tải"
- Mobile responsive (3 breakpoints): 380px / 640px / 1024px
- Error retry card with "🔄 Thử lại" button

---

## 📚 DOCUMENTATION ONLY (specs/audits/research, no code change)

Created in V6 session:
1. **HUONG-DAN-PAYPAY-BUSINESS.md** — PayPay merchant application guide
2. **HUONG-DAN-2-STEP-VERIFY.md** — Admin + customer guide for 2-step
3. **HUONG-DAN-DEBUG-VERIFY.md** — 3 debug methods explained
4. **HUONG-DAN-TRACKING-IMPL.md** — Tracking modal implementation doc
5. **REDEPLOY-APPS-SCRIPT-NOW.md** — Click-by-click redeploy guide
6. **YAMATO-MANUAL-WORKAROUND.md** — Emergency CSV export plan
7. **URGENT-RECOVER-FAILED-ORDER.md** — Recovery guide for failed verify
8. **AUDIT-IMAGE-DISPLAY.md** — Root cause: image_url vs screenshot_url
9. **AUDIT-STORAGE-RLS.md** — payment-proofs bucket policy review
10. **AUDIT-VERIFY-LAYERS.md** — All 8 layers weakness analysis
11. **AUDIT-THANH-VIEN.md** — 64 issues found in member dashboard
12. **AUDIT-INDEX.md** — 5 critical findings on homepage
13. **SPEC-2-STEP-VERIFY.md** — Mermaid state machine + DB schema
14. **SPEC-THANH-VIEN-REDESIGN.md** — Amazon redesign 601-line spec
15. **SPEC-MUA-LAI.md** — Re-order feature spec
16. **SPEC-REJECT-REFUND-FLOW.md** — Reject + refund flow design
17. **SPEC-AUDIT-LOG.md** — admin_audit_log table design
18. **TEST-PLAN-VERIFY.md** — 10 test cases for AI verify
19. **TEST-PLAN-2-STEP.md** — 10 test cases for 2-step flow
20. **WORKFLOW-ORDER-STATES.md** — Mermaid state + sequence + decision diagrams
21. **FIXTURES-PAYPAY-PATTERNS.md** — OCR text reference for PayPay/banks
22. **FAQ-MANUAL-REVIEW.md** — Customer-facing FAQ
23. **SECURITY-REVIEW-2-STEP-VERIFY.md** — 5 CRITICAL findings + fixes
24. **TPCN-SITE-MVP-PLAN.md** — Shopify MVP plan for TPCN site
25. **EMAIL-CUSTOMER-JOURNEY.md** — 6-email customer journey design
26. **email-1-getresponse.html** through **email-6-getresponse.html** — GetResponse-ready
27. **email-admin-review-needed.html** — Admin alert template
28. **ROADMAP-30-DAYS.md** — May 2026 roadmap with W1-W4 themes
29. **SQL-CHEAT-SHEET-ADMIN.md** — 38 queries (8 new for 2-step)
30. **RESEARCH-YAMATO-TRACKING.md** + **RESEARCH-SAGAWA-TRACKING.md**

---

## 🔴 PENDING USER ACTIONS (BLOCKING — anh chưa làm)

### P1.1 — Redeploy Apps Script (5 min)
Accumulated commits not yet on production:
- e866e77 (Layer 7 fix)
- ca2b1f2 (Layer 6 fix)
- 3474484 (10-agent hardening)
- 9e0d302 (manual_review sub-tab)
- 510ffe1 (image fix + 20 agents)

Steps: https://script.google.com → Mã.gs → Ctrl+A → paste from raw GitHub → Save → Deploy → New version

### P1.2 — Run 2 SQL migrations
1. `K:\bep-thuy-japan\supabase-2-step-verify.sql` (CRITICAL — adds RPCs)
2. `K:\bep-thuy-japan\supabase-manual-approve-payment.sql`

Path: https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new

### P1.3 — Storage bucket fix
Per AUDIT-STORAGE-RLS.md: payment-proofs bucket is private without RLS.
Quickest fix: Supabase Dashboard → Storage → payment-proofs → Settings → toggle "Public bucket" ON.

### P1.4 — Test end-to-end (after P1.1-3 done)
1. Re-attempt failed bill upload → should pass with regex fixes
2. Click "✅ Xác nhận lần 2" in admin modal → status flips to confirmed
3. Image displays in modal (lightbox click works)
4. Sub-tab "🚨 Cần xem xét" shows manual_review orders

---

## 🟡 PENDING USER DECISIONS (no rush)

| # | Item | Decision needed | Doc ref |
|---|---|---|---|
| 1 | PayPay for Business application | Anh có muốn launch path này không? Cần update 定款 trước (¥30k+) | HUONG-DAN-PAYPAY-BUSINESS.md |
| 2 | TPCN site launch | Shopify? Or wait? | TPCN-SITE-MVP-PLAN.md |
| 3 | iOS app TestFlight | Anh chuyển Mac → cần Team ID | v5 doc |
| 4 | Update 定款 食品の販売 | Cho 法人 hoặc đăng ký 個人事業主 mới | HUONG-DAN-PAYPAY-BUSINESS.md |
| 5 | 食品衛生 license check | Liên hệ 行政書士 | HUONG-DAN-PAYPAY-BUSINESS.md |
| 6 | JWT secret rotation | Security cleanup | V3 doc |
| 7 | Firebase project (push notif) | Cho iOS app | V4 doc |

---

## 🚧 FUTURE WORK SPECCED BUT NOT BUILT

| Feature | Spec file | Estimate |
|---|---|---|
| Reject/refund flow with email | SPEC-REJECT-REFUND-FLOW.md | ~3h |
| Admin audit log table + UI | SPEC-AUDIT-LOG.md | ~4h |
| Phase C inventory: add new products (dynamic render) | project_thuyjapan_phase_c_pending.md | ~2h |
| iOS native enhancements (push, deep link, share, camera) | v5 doc | 3-5 days |
| App Store submission | v5 doc | 1-2 weeks (Apple review) |
| PayPay Business API integration | HUONG-DAN-PAYPAY-BUSINESS.md | 3-5 days post-credentials |
| TPCN site Shopify build | TPCN-SITE-MVP-PLAN.md | 8 weeks |
| Email 4-5-6 auto-trigger | EMAIL-CUSTOMER-JOURNEY.md | ~1.5h |

---

## 🔐 CRITICAL FINDINGS từ SECURITY-REVIEW-2-STEP-VERIFY.md

5 critical issues anh nên review (chưa fix):
1. **Signed URLs valid 1 năm** — token leak = ai cũng access bill
2. **admin_force_approve_payment KHÔNG verify caller is admin** — anyone with Apps Script URL can spoof
3. **Vision API không disclose trong privacy.html** — vi phạm APPI 24/27
4. **Audit log chỉ cover RPC mới**, paths cũ (verify_payment_confirmation, cancel_order) không log
5. **Telegram bot token + Supabase service_role + Vision key tập trung 1 chỗ** — single point of failure

→ Recommend anh đọc + plan fix khi có time.

---

## 📊 V6 SESSION STATS (2026-05-02)

- **Commits hôm nay**: 15+
- **Lines added**: ~13,000+
- **Agents spawned**: ~60 (5+10+10+10+5+20+5)
- **New documentation files**: 30+
- **Critical bugs fixed**: 4 (Layer 6 date, Layer 7 取引番号, image display, manual_review hidden)
- **New admin tools**: 4 (Test Bill, Manual override, Banner, Audit log)

---

## 💡 Communication Style (carry-over)

- Em xưng "em", anh xưng "anh"
- Tiếng Việt là chính
- Click-by-click cho task technical
- Confirm trước action lớn (deploy, push)
- Khi anh nói "lưu lại tất cả" → update file v này

---

*End of v6 handover. Next session: bắt đầu từ "Redeploy Apps Script" trước khi làm gì khác.* 🍜🛡️

**Bếp Thuỷ Japan — Đặc Sản Phố Cổ Hà Nội Tại Nhật Bản**
