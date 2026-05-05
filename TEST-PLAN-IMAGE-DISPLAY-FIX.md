# Test Plan — Admin Image Display Fix (2026-05-05)

> **Bug**: Admin không xem được ảnh bill khách upload
> **Root cause**: Apps Script INSERT payload sai (method violation, ai_status column không tồn tại, screenshot_hash NULL); admin render code thiếu fallback
> **Fix scope**: 2 files (google-apps-script.js + thuythang.html)
> **Time**: ~15-20 phút

---

## PRE-DEPLOY: Apps Script redeploy

Anh PHẢI redeploy Apps Script sau commit để fixes có hiệu lực:

1. Mở https://script.google.com/home (Google Apps Script projects)
2. Mở project Bếp Thuỷ
3. Edit → Paste code mới từ `google-apps-script.js` (commit ABC mới nhất)
4. Click Deploy → Manage Deployments → Edit (icon bút chì) → Version: New Version → Deploy
5. Confirm authorization (nếu hỏi)

**Lưu ý**: Nếu KHÔNG redeploy → fix Apps Script không có hiệu lực, đơn auto-verify mới vẫn fail INSERT silent.

---

## Frontend Test (5 cases)

### TC1 — Mở admin modal đơn cũ (path 1: khách upload qua RPC)

**Setup**: Đơn có row trong payment_confirmations với screenshot_url full URL

**Steps**:
1. Login admin /thuythang
2. Click 1 đơn có ảnh trong list (status=customer_paid hoặc verified)
3. Quan sát modal payment

**Expected**:
- Ảnh load OK
- Console (F12 → tab Console): log `[payment-img OK] payment-img-{N} https://...`
- Click ảnh → lightbox phóng to

**FAIL action**: Báo em + screenshot Console errors

---

### TC2 — Manually break URL (verify fallback)

**Setup**: 1 đơn để test fallback

**Steps**:
1. Supabase Studio → table payment_confirmations
2. Edit row → screenshot_url → đổi thành `https://invalid.url/abc.jpg`
3. Reload admin /thuythang → mở đơn đó

**Expected**:
- Ảnh fail load (404)
- Console: `[payment-img ERR] payment-img-{N} attempt 1 failed src: ...`
- Console: `[payment-img RETRY] payment-img-{N} → public twin` (nếu có twin)
- Final: error box với button "Mở ảnh trực tiếp"

---

### TC3 — Đơn KHÔNG có ảnh (chưa upload)

**Steps**: Mở đơn status=pending (chưa upload bill)

**Expected**: Hiện box "Không có ảnh hóa đơn"

---

### TC4 — Place order test (path 2: AI auto-verify)

**Setup**: Sau khi anh redeploy Apps Script

**Steps**:
1. Incognito Chrome → thuyjapan.com → đặt đơn test
2. Upload bill PayPay valid
3. Check Apps Script Logs: function `savePaymentProofForVerifiedOrder_` chạy?
4. SQL check:
   ```sql
   SELECT method, status, screenshot_hash
   FROM payment_confirmations
   WHERE order_no = 'NEW_ORDER_NO';
   ```

**Expected**:
- Log: `Save payment_confirmation: HTTP 201` (was 400 before fix)
- DB: `method='bank_transfer'`, `status='verified'`, `screenshot_hash='auto-...'`
- Admin modal: ảnh load OK

---

### TC5 — Manual-review path (AI verify fail)

**Setup**: Đặt đơn với bill XẤU (không match amount)

**Expected**:
- AI verify fail → trigger `savePaymentProofForManualReview_`
- DB: `method='bank_transfer'`, `status='submitted'`, `screenshot_hash='manual-...'`
- Admin modal: ảnh load OK với badge manual_review

---

## SQL Verify (anh chạy trên Supabase)

```sql
-- Sau khi place test orders, verify rows mới có schema đúng:
SELECT 
  order_no,
  method,
  status,
  screenshot_hash IS NOT NULL AS has_hash,
  screenshot_url IS NOT NULL AS has_url,
  ai_match,
  created_at
FROM public.payment_confirmations
ORDER BY created_at DESC LIMIT 5;

-- Confirm KHÔNG còn rows fail CHECK constraint:
SELECT count(*) FROM public.payment_confirmations
WHERE method NOT IN ('bank_transfer', 'paypay');
-- Expect: 0
```

---

## Action map FAIL

| TC fail | Action |
|---|---|
| TC1 | CRITICAL — basic display broken, báo em ngay |
| TC2 | Fallback chain broken, báo em |
| TC3 | Empty state broken (rare) |
| TC4 | Apps Script chưa redeploy → quay lại pre-deploy step |
| TC5 | Manual-review flow bug, báo em |

---

## PASS hết

Anh báo em "image display PASS" → em:
1. Update memory mark fix LIVE
2. Append section vào V8 handover doc
3. Note: bug từ Apps Script silent fail → cần improve logging future
