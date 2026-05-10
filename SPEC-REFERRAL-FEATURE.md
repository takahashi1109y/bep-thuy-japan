# SPEC — REFERRAL PROGRAM (Mã giới thiệu giảm 10%)

**Status**: 🟡 PENDING APPROVAL — chờ anh review trước khi implement
**Created**: 2026-05-11
**Effort**: ~6-8h implementation + 2h test

---

## 1. OVERVIEW

Mỗi user A có 1 mã giới thiệu unique (vd `THAN1109`).
- A share link `https://www.thuyjapan.com/?ref=THAN1109`
- B click link → đăng ký + đặt đơn → **B nhận 10% OFF đơn đầu tiên**
- Đơn của B `delivered` → **A nhận điểm thưởng = 10% × giá trị đơn B**

---

## 2. USER FLOWS

### Flow 1: A share link
1. A login `/thanh-vien` → tab "Mã giới thiệu" mới
2. UI hiển thị: mã `THAN1109` + URL + nút Copy + nút Share FB/Zalo
3. Stat: số người đã giới thiệu (X/20), tổng điểm đã nhận

### Flow 2: B đăng ký qua link
1. B click `?ref=THAN1109` → frontend lưu `pending_ref_code = THAN1109` vào sessionStorage
2. B đăng ký account mới (nếu chưa có)
3. Trigger `handle_new_user` đọc `raw_user_meta_data->>'ref_code'` → set `profiles.referred_by`
4. B đặt đơn đầu tiên → frontend apply 10% OFF (giống birthday discount)
5. Order saved với `birthday_discount > 0` không liên quan; thay vào đó có column `referral_discount`

### Flow 3: B's order delivered → A reward
1. Apps Script cron (hoặc admin manual mark) `mark_order_delivered(order_no)`
2. Trigger `award_referrer_on_delivered` chạy:
   - Check order có `referral_applied = true` không
   - Lookup B's profile → `referred_by` = A's user_id
   - Award A: 10% × order.total → `points_transactions(type='referral', user_id=A)`
   - Update `profiles.referral_count` của A++
   - Telegram notify A: "Bạn vừa nhận X điểm từ giới thiệu"

---

## 3. DATA CONTRACT (Rule 5.1)

### profiles table — add columns

| Column | Type | Note |
|--------|------|------|
| `referral_code` | text UNIQUE | Format readable, gen từ name+phone |
| `referred_by` | uuid FK auth.users | Set khi B signup qua ref |
| `referral_count` | int DEFAULT 0 | Counter A đã giới thiệu (max 20) |
| `device_fingerprint` | text | Browser fingerprint client-side |

### orders table — add columns

| Column | Type | Note |
|--------|------|------|
| `referral_discount` | int DEFAULT 0 | 10% OFF cho B's first order |
| `referral_applied` | boolean DEFAULT false | True = đơn này có ref discount |
| `referral_awarded` | boolean DEFAULT false | True = A đã nhận điểm khi delivered |

### Frontend `index.html` payload (Rule 5.3 — grep existing pattern `data.cartItems`)

```javascript
{
  type: 'order',
  cartItems: [...],
  total: 10000,
  birthdayDiscount: 0,
  referralDiscount: 1000,    // ⭐ NEW
  referralApplied: true,      // ⭐ NEW
  // ... existing fields
}
```

### Apps Script `saveOrderToSupabase` payload

```javascript
{
  ...existing,
  referral_discount: data.referralDiscount || 0,
  referral_applied: !!data.referralApplied
}
```

### RPC signatures

| RPC | Params | Returns |
|-----|--------|---------|
| `validate_ref_code(p_ref_code)` | text | `{valid: bool, referrer_id: uuid, error: text}` |
| `apply_referral_to_order(p_order_no)` | text | `{ok: bool, discount: int}` |
| `award_referrer_on_delivered(p_order_no)` | text | `{ok: bool, points: int, referrer_id: uuid}` |
| `generate_referral_code()` | none | `{code: text}` (called once per profile) |

---

## 4. DB SCHEMA (Migration SQL)

```sql
-- Section 1: profiles columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS device_fingerprint text;

-- Section 2: orders columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS referral_discount int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_applied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_awarded boolean DEFAULT false;

-- Section 3: Generate referral_code function
-- Format: 4 chars uppercase từ display_name + 2 last digits từ phone
-- Vd: "Hoàng Thắng" + "0904237886" → "HOAN86"
-- Conflict resolution: append random 2-digit if collision

-- Section 4: Backfill referral_code cho 169 existing profiles

-- Section 5: validate_ref_code RPC
-- Section 6: apply_referral_to_order RPC (called from order RPC)
-- Section 7: award_referrer_on_delivered RPC + trigger on orders status='delivered'
-- Section 8: VERIFY queries
```

---

## 5. ANTI-FRAUD (theo câu 6 anh chọn)

### Self-refer block conditions (kiểm tra khi B signup qua ref):

```sql
CREATE OR REPLACE FUNCTION check_self_referral(
  p_ref_code text,
  p_new_email text,
  p_new_phone text,
  p_new_ip text,
  p_new_fingerprint text
) RETURNS jsonb AS $$
DECLARE
  v_referrer profiles%rowtype;
BEGIN
  SELECT * INTO v_referrer FROM profiles WHERE referral_code = p_ref_code;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false, 'reason', 'invalid_code'); END IF;

  -- Check 1: same canonical_email
  IF v_referrer.canonical_email = normalize_email(p_new_email) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'self_refer_email');
  END IF;

  -- Check 2: same phone
  IF v_referrer.phone = p_new_phone THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'self_refer_phone');
  END IF;

  -- Check 3: same signup_ip in 24h
  IF EXISTS (SELECT 1 FROM profiles
              WHERE id = v_referrer.id
                AND signup_ip = p_new_ip
                AND now() - created_at < INTERVAL '24 hours') THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'self_refer_ip');
  END IF;

  -- Check 4 (NEW): same device_fingerprint
  IF v_referrer.device_fingerprint = p_new_fingerprint
     AND p_new_fingerprint IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'self_refer_device');
  END IF;

  -- Check 5: max 20 referrals/lifetime
  IF v_referrer.referral_count >= 20 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'referrer_limit_reached');
  END IF;

  RETURN jsonb_build_object('valid', true, 'referrer_id', v_referrer.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Device fingerprint (frontend)

Thư viện `fingerprintjs/fingerprintjs` (CC-BY-3.0 free):
```html
<script src="https://openfpcdn.io/fingerprintjs/v4"></script>
<script>
  const fpPromise = FingerprintJS.load();
  const fp = await fpPromise;
  const result = await fp.get();
  const fingerprint = result.visitorId; // 32-char hash
</script>
```

Pass via `auth.signUp({ data: { device_fingerprint: fingerprint } })`.

---

## 6. RISKS + MITIGATION

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Self-refer (A tạo account B) | High | 4 anti-fraud checks |
| B nhận 10% rồi cancel order | High | Award A chỉ khi delivered (không phải paid) |
| A spam link group FB → unlimited | Medium | Cap 20 referrals/lifetime |
| Referral_code collision khi gen | Low | Append random suffix nếu trùng |
| B đặt đơn nhỏ (1000đ) → A nhận 100đ × 20 = 2000đ profit | Low | Acceptable abuse |
| Migration backfill fail | Medium | Idempotent SQL + rollback section |

---

## 7. ROLLBACK PLAN

Nếu phát hiện bug nghiêm trọng sau deploy:

```sql
-- Disable referral discount (frontend stop applying)
UPDATE public.profiles SET referral_count = 9999;  -- Block all new refs
-- Or revoke RPC
REVOKE EXECUTE ON FUNCTION validate_ref_code FROM authenticated;

-- Full rollback (nếu cần xoá hết data)
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS referral_code,
  DROP COLUMN IF EXISTS referred_by,
  DROP COLUMN IF EXISTS referral_count,
  DROP COLUMN IF EXISTS device_fingerprint;
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS referral_discount,
  DROP COLUMN IF EXISTS referral_applied,
  DROP COLUMN IF EXISTS referral_awarded;
DROP FUNCTION IF EXISTS validate_ref_code;
DROP FUNCTION IF EXISTS apply_referral_to_order;
DROP FUNCTION IF EXISTS award_referrer_on_delivered;
```

---

## 8. IMPLEMENTATION PHASES

### Phase 1 — DB schema (1h)
- Migration SQL: 8 sections (cols + RPCs + triggers + verify)
- Backfill 169 existing profiles với referral_code
- Anh chạy + chụp 8 verify queries

### Phase 2 — Frontend signup ?ref= (1h)
- `index.html` parse URL `?ref=XXX` → save sessionStorage
- `thanh-vien.html` doRegister → call `validate_ref_code` → if valid, pass via signUp metadata
- Show error case `self_refer_*` rõ ràng

### Phase 3 — Frontend dashboard share UI (1.5h)
- New tab "Giới thiệu" trong `/thanh-vien`
- Display: code + URL + Copy/Share buttons + stats (X/20, total points)
- Add fingerprintjs CDN

### Phase 4 — Order checkout apply 10% (1h)
- `index.html` checkBirthday → also check pending referral (if user has `referred_by` AND first order)
- Apply 10% via `referral_discount` column (similar birthday flow)

### Phase 5 — Apps Script + cron mark delivered (1.5h)
- `saveOrderToSupabase` include `referral_discount` + `referral_applied`
- Cron job (existing Yamato delivered) → mark `delivered` → trigger `award_referrer_on_delivered`
- Telegram notify A: "Bạn vừa nhận X điểm từ giới thiệu Y"

### Phase 6 — E2E test (2h)
- Test 1: A share, B click, B đăng ký, B đặt đơn 5000đ → B nhận 4500đ (10% off)
- Test 2: Mark đơn B delivered → A nhận 500đ → Telegram alert
- Test 3: B thử claim ref code của chính mình → block "self_refer_email"
- Test 4: A đã 20 refs → 21st block "referrer_limit_reached"

### Phase 7 — Documentation (30min)
- Update `pending_thuyjapan_action_items.md` memory
- Update `CLAUDE.md` referral rules nếu cần

---

## 9. CHECKLIST TRƯỚC ANH APPROVE

- [ ] Anh đọc + hiểu 9 sections
- [ ] Anh OK với data contract (3 columns profiles, 3 columns orders)
- [ ] Anh OK với 4 anti-fraud checks
- [ ] Anh OK với mã readable (THAN1109 = HOAN86)
- [ ] Anh OK với rollback plan
- [ ] Anh OK với 7 phases (~6-8h work)
- [ ] Anh chấp nhận risks: B đặt đơn nhỏ rồi A nhận điểm (acceptable abuse)
- [ ] Anh confirm device_fingerprint qua fingerprintjs CDN OK (3rd-party dependency)

---

## 10. ANH CONFIRMATIONS (2026-05-11)

1. ✅ **A reward cap**: `MIN(orderSubtotal × 0.1, 500)` — đơn 3000đ → 300đ; đơn ≥5000đ → 500đ (cap). KHÔNG tính phí ship.
2. ✅ **B's discount min order**: chỉ áp dụng cho đơn `subtotal > 1000` yen
3. ✅ **Code collision fallback**: `THAN1109_2`, `THAN1109_3`, ... random suffix
4. ✅ **Notify A**: Email (MailApp Workspace) + In-app banner combo
   - Email: subject "🎉 Bếp Thuỷ Japan: Bạn vừa nhận X điểm từ giới thiệu"
   - Banner: hiển thị trong `/thanh-vien` next login, dismiss bằng button X

---

## 11. UPDATED LOGIC (sau confirmations)

### A reward calculation
```javascript
// 2026-05-11 anh sửa: cap 500 (KHÔNG phải 1000), tính trên subtotal (KHÔNG total)
function calculateReferrerPoints(orderSubtotal) {
  return Math.min(Math.floor(orderSubtotal * 0.1), 500);
}
// Ví dụ:
//   subtotal=3000  → 300đ
//   subtotal=5000  → 500đ (cap)
//   subtotal=10000 → 500đ (cap)
//   subtotal=20000 → 500đ (cap)
//   shipping_fee KHÔNG tính vào → đơn 5000 hàng + 1190 ship → A nhận 500đ (10% × 5000)
```

### B's discount eligibility
```javascript
function isReferralDiscountEligible(subtotal, hasReferrer, isFirstOrder) {
  return hasReferrer && isFirstOrder && subtotal > 1000;
}
```

### Notification flow (A nhận điểm)
```javascript
// Apps Script: when order B delivered + referral_applied
function notifyReferrerOnDelivered(referrerEmail, referrerName, points, refereeName) {
  // 1. Email (primary)
  MailApp.sendEmail({
    to: referrerEmail,
    subject: '🎉 Bếp Thuỷ Japan: Bạn vừa nhận ' + points + ' điểm từ giới thiệu',
    htmlBody: buildReferralRewardEmailHtml_(referrerName, points, refereeName),
    name: 'Bếp Thuỷ Japan',
    replyTo: 'support@thuyjapan.com'
  });
  // 2. Insert in-app banner record (next login Frontend reads)
  // → INSERT INTO referral_notifications (user_id, points, referee_name, seen=false)
}
```

### In-app banner (thanh-vien.html)
```javascript
// On dashboard load
const { data: notifs } = await sb.from('referral_notifications')
  .select('*').eq('user_id', sbUser.id).eq('seen', false);
if (notifs && notifs.length) {
  showReferralBanner(notifs[0]);
  // On dismiss → UPDATE seen=true
}
```

---

## 12. ADDITIONAL DB SCHEMA (cập nhật)

### orders columns (no change từ section 4)

### profiles columns (no change từ section 4)

### NEW: `referral_notifications` table
```sql
CREATE TABLE public.referral_notifications (
  id           bigserial PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,  -- A's id
  order_no     text REFERENCES public.orders(order_no) ON DELETE SET NULL,
  points       int NOT NULL,
  referee_name text,
  seen         boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.referral_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own notifs" ON public.referral_notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "User updates own notifs (dismiss)" ON public.referral_notifications
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON public.referral_notifications
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

---

**SPEC FINAL — Anh review xong, comment "approved" → em start Phase 1 (DB migration).**
