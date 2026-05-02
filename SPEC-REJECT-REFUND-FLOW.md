# SPEC — Reject + Refund Flow cho đơn `pending_manual_review`

**Tác giả:** em (Claude) — viết theo yêu cầu của anh Thắng
**Ngày:** 2026-05-02
**Trạng thái:** Draft v1 — chờ anh duyệt rồi em mới code
**Liên quan:**
- `K:\bep-thuy-japan\SPEC-2-STEP-VERIFY.md` (mother spec — section 5.4 đã đề cập reject sơ bộ, file này mở rộng đầy đủ)
- `K:\bep-thuy-japan\supabase-2-step-verify.sql` (đã có `cancel_reason`, `admin_audit_log`, RPC `admin_reject_payment`)
- `K:\bep-thuy-japan\HUONG-DAN-PAYPAY-BUSINESS.md` (Phase 2 — Refund API tự động)
- `K:\bep-thuy-japan\thuythang.html` (admin dashboard — modal sẽ thêm)
- `K:\bep-thuy-japan\google-apps-script.js` (gửi email khách)
- Email template mới: `email-reject-refund.html`

> **Phạm vi:** Đây là spec cho **anh** (admin) chủ động **TỪ CHỐI** đơn `pending_manual_review` (hoặc `customer_paid` nếu phát hiện gian lận sau AI pass). **KHÔNG** dùng cho khách tự huỷ — đó là flow khác (`/cancel-order`).

---

## 0. Tại sao cần spec riêng cho reject?

Hiện tại `admin_reject_payment` RPC trong `supabase-2-step-verify.sql` chỉ làm 3 việc tối thiểu:
1. Đổi `payment_confirmations.admin_action='rejected'`
2. Đổi `orders.status='cancelled'` + ghi `cancel_reason`
3. Insert 1 row vào `admin_audit_log`

**Nhưng thiếu:**
- ❌ UX modal cho anh chọn lý do (hiện đang phải gõ tay → lỗi chính tả, không thống kê được).
- ❌ Email tự động cho khách báo đơn bị từ chối + hướng dẫn nhận refund.
- ❌ Tracking refund đã thực hiện chưa (anh chuyển ngược tay xong, không có chỗ ghi lại → quên là mất tiền 2 lần).
- ❌ Chuẩn hoá `reason_code` để báo cáo (mỗi tháng có bao nhiêu đơn fake? bao nhiêu đơn shop khác?).
- ❌ Edge case khi khách disputed sau khi đã reject.

**Spec này** lấp 5 lỗ trên + tạo template để khi anh upgrade lên PayPay Business, refund chuyển từ tay → tự động chỉ cần đổi 1 function.

---

## 1. Decision Criteria — Khi nào reject?

Anh dựa vào bảng dưới để quyết. Mỗi lý do đều **REJECT NGAY**, không "wait and see":

| # | Tình huống | Reason code | Ghi chú |
|---|---|---|---|
| 1 | Bill bị photoshop / fake (font lệch, padding bất thường, transaction ID không tồn tại) | `bill_fake` | Cao nhất priority — fraud rõ ràng |
| 2 | Số tiền trên bill < số tiền đơn | `amount_short` | Chỉ reject sau khi email khách 1 lần và khách KHÔNG bù — nếu chưa hỏi thì email trước |
| 3 | Bill từ shop khác (recipient không phải Bếp Thuỷ / tên anh) | `wrong_shop` | Có thể là khách nhầm bill → cho khách 1 lần upload lại trước |
| 4 | Khách tự admit qua email/Zalo là chuyển sai tài khoản | `wrong_account` | Khách thừa nhận → reject cleanly, gợi ý chuyển lại |
| 5 | Khách yêu cầu huỷ đơn (chưa ship) | `customer_request` | Friendly cancel — không phải lỗi khách |
| 6 | Bill duplicate (đã dùng cho đơn khác) | `bill_duplicate` | AI Layer 4–8 catch → nếu khách "submit anyway" → reject |
| 7 | Bill quá cũ (> 7 ngày) và khách không giải thích | `bill_stale` | Có thể là bill cũ recycle |
| 8 | Lý do khác (anh ghi tay) | `other` | Bắt buộc nhập note ≥ 10 ký tự |

**Quy tắc vàng:**
- Nếu **chưa chắc**, **KHÔNG reject** → để `pending_manual_review` thêm 24h, email khách hỏi rõ.
- Reject là hành động **cuối cùng** — sau khi reject phải refund (nếu khách đã trả thật).
- Nếu khách rõ ràng KHÔNG trả tiền (bill fake hoàn toàn, không có trans ID khớp PayPay history của anh) → reject + KHÔNG refund (vì không có gì để refund).

---

## 2. Database Schema — Cột mới cần thêm

### 2.1. `orders` table — refund tracking

```sql
-- File: supabase-reject-refund.sql

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reject_reason_code text,           -- bill_fake | amount_short | wrong_shop | wrong_account | customer_request | bill_duplicate | bill_stale | other
  ADD COLUMN IF NOT EXISTS refund_required boolean DEFAULT false,  -- true nếu khách đã thực sự trả tiền và cần hoàn
  ADD COLUMN IF NOT EXISTS refund_completed_at timestamptz,   -- thời điểm anh thực sự chuyển ngược
  ADD COLUMN IF NOT EXISTS refund_method text,                -- paypay | bank | none (none = không cần hoàn vì khách chưa trả)
  ADD COLUMN IF NOT EXISTS refund_reference text,             -- mã giao dịch refund (PayPay transaction ID hoặc bank reference)
  ADD COLUMN IF NOT EXISTS refund_amount integer;             -- số tiền hoàn (mặc định = total, nhưng cho phép partial refund nếu cần)

-- Index để query "đơn đã reject mà chưa refund"
CREATE INDEX IF NOT EXISTS idx_orders_refund_pending
  ON public.orders (status, refund_required, refund_completed_at)
  WHERE status = 'cancelled' AND refund_required = true AND refund_completed_at IS NULL;

-- Constraint check reason_code hợp lệ
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_reject_reason_code_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_reject_reason_code_check
  CHECK (reject_reason_code IS NULL OR reject_reason_code IN (
    'bill_fake','amount_short','wrong_shop','wrong_account',
    'customer_request','bill_duplicate','bill_stale','other'
  ));
```

### 2.2. RPC mới: `admin_reject_order_v2`

Mở rộng từ `admin_reject_payment` hiện tại — thêm reason_code + refund flag + email trigger:

```sql
CREATE OR REPLACE FUNCTION public.admin_reject_order_v2(
  p_confirmation_id bigint,
  p_reason_code     text,             -- enum trên
  p_notes           text DEFAULT NULL,
  p_refund_required boolean DEFAULT true   -- false = bill fake, không cần hoàn
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_email text;
  v_conf        public.payment_confirmations%ROWTYPE;
  v_order       public.orders%ROWTYPE;
BEGIN
  -- 1. Auth
  v_admin_email := coalesce(
    current_setting('request.jwt.claims', true)::jsonb->>'email',
    ''
  );
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  -- 2. Validate reason_code
  IF p_reason_code NOT IN (
    'bill_fake','amount_short','wrong_shop','wrong_account',
    'customer_request','bill_duplicate','bill_stale','other'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_reason_code');
  END IF;

  -- 3. 'other' bắt buộc note ≥ 10 ký tự
  IF p_reason_code = 'other' AND (p_notes IS NULL OR length(trim(p_notes)) < 10) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'notes_required_for_other');
  END IF;

  -- 4. Load confirmation + order
  SELECT * INTO v_conf FROM public.payment_confirmations
  WHERE id = p_confirmation_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'confirmation_not_found');
  END IF;

  -- Idempotent
  IF v_conf.admin_action = 'rejected' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- 5. Update payment_confirmations
  UPDATE public.payment_confirmations
  SET admin_confirmed_at = now(),
      admin_confirmer    = v_admin_email,
      admin_notes        = coalesce(p_notes, p_reason_code),
      admin_action       = 'rejected'
  WHERE id = p_confirmation_id;

  -- 6. Update orders (snapshot before & cancel)
  IF v_conf.order_no IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders
    WHERE order_no = v_conf.order_no FOR UPDATE;

    IF FOUND AND v_order.status NOT IN ('shipped','delivered','cancelled') THEN
      UPDATE public.orders
      SET status              = 'cancelled',
          cancel_reason       = coalesce(p_notes, p_reason_code),
          reject_reason_code  = p_reason_code,
          refund_required     = p_refund_required,
          refund_amount       = CASE WHEN p_refund_required THEN total ELSE NULL END,
          note = coalesce(note,'') || ' [REJECT v2 ' || p_reason_code || ': ' || coalesce(p_notes,'-') || ']'
      WHERE order_no = v_conf.order_no;
    END IF;
  END IF;

  -- 7. Audit log với SNAPSHOT đầy đủ
  INSERT INTO public.admin_audit_log(admin_email, action_type, target_type, target_id, details)
  VALUES (
    v_admin_email,
    'reject_order_v2',
    'order',
    v_conf.order_no,
    jsonb_build_object(
      'reason_code',      p_reason_code,
      'notes',            p_notes,
      'refund_required',  p_refund_required,
      'order_snapshot',   to_jsonb(v_order),
      'confirmation_id',  p_confirmation_id,
      'ai_match',         v_conf.ai_match,
      'ai_reason',        v_conf.ai_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_no', v_conf.order_no,
    'reason_code', p_reason_code,
    'refund_required', p_refund_required,
    'customer_email', v_order.customer_email
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_reject_order_v2(bigint, text, text, boolean) TO authenticated;
```

### 2.3. RPC: `admin_mark_refund_completed`

```sql
CREATE OR REPLACE FUNCTION public.admin_mark_refund_completed(
  p_order_no         text,
  p_refund_method    text,         -- 'paypay' | 'bank'
  p_refund_reference text,         -- transaction ID / bank ref
  p_refund_amount    integer DEFAULT NULL  -- NULL = full
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_email text;
  v_order public.orders%ROWTYPE;
BEGIN
  v_admin_email := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email','');
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  IF p_refund_method NOT IN ('paypay','bank') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_method');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE order_no = p_order_no FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.status <> 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_cancelled');
  END IF;
  IF v_order.refund_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  UPDATE public.orders
  SET refund_completed_at = now(),
      refund_method       = p_refund_method,
      refund_reference    = p_refund_reference,
      refund_amount       = coalesce(p_refund_amount, refund_amount, v_order.total)
  WHERE order_no = p_order_no;

  INSERT INTO public.admin_audit_log(admin_email, action_type, target_type, target_id, details)
  VALUES (v_admin_email, 'mark_refund_completed', 'order', p_order_no,
    jsonb_build_object(
      'refund_method',    p_refund_method,
      'refund_reference', p_refund_reference,
      'refund_amount',    coalesce(p_refund_amount, v_order.total)
    )
  );

  RETURN jsonb_build_object('ok', true, 'order_no', p_order_no);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_mark_refund_completed(text, text, text, integer) TO authenticated;
```

---

## 3. UX Flow — Modal "Từ chối đơn"

### 3.1. Entry point

Trong `thuythang.html` order modal, khi đơn ở state `pending_manual_review` hoặc `customer_paid`:

```
┌──────────────────────────────────────────────────┐
│  👤 Xác nhận lần 2 (Anh)                         │
├──────────────────────────────────────────────────┤
│  [✅ Xác nhận đã trả tiền]  [❌ Từ chối + huỷ]   │
└──────────────────────────────────────────────────┘
```

Click `[❌ Từ chối + huỷ]` → mở modal Bước 1.

### 3.2. Modal Bước 1 — Chọn lý do

```
┌─────────────────────────────────────────────────────┐
│  ❌ Từ chối đơn #BTJ-0042                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Lý do từ chối: *                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ ▼ -- Chọn lý do --                          │   │
│  │   1. Bill không hợp lệ (photoshop / fake)   │   │
│  │   2. Số tiền không khớp                     │   │
│  │   3. Bill từ shop khác                      │   │
│  │   4. Khách thanh toán sai tài khoản         │   │
│  │   5. Khách yêu cầu huỷ                      │   │
│  │   6. Bill đã dùng cho đơn khác (duplicate)  │   │
│  │   7. Bill quá cũ (> 7 ngày)                 │   │
│  │   8. Lý do khác (nhập tay)                  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Note thêm (optional, bắt buộc nếu chọn "khác"):   │
│  ┌─────────────────────────────────────────────┐   │
│  │ vd: "transaction ID không tồn tại trên     │   │
│  │      PayPay history của anh"               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ☑ Khách đã thực sự trả tiền → CẦN hoàn refund     │
│    (uncheck nếu bill fake hoàn toàn)               │
│                                                     │
│  [Huỷ]                       [Tiếp tục →]          │
└─────────────────────────────────────────────────────┘
```

**Logic frontend:**
- `reason_code = 'other'` → note bắt buộc ≥ 10 ký tự, button `Tiếp tục` disabled cho tới khi hợp lệ.
- `reason_code = 'bill_fake'` → checkbox "CẦN hoàn refund" mặc định **uncheck** (bill fake = không có gì refund).
- Các lý do khác → checkbox mặc định **check** (giả định khách đã trả).
- Nếu khách dùng PayPay → preset `refund_method='paypay'`. Nếu chuyển khoản ngân hàng → `bank`.

### 3.3. Modal Bước 2 — Confirmation

```
┌─────────────────────────────────────────────────────┐
│  ⚠️ Xác nhận từ chối đơn                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Đơn:        #BTJ-0042                              │
│  Khách:      Nguyễn Văn A                           │
│  Email:      vana@gmail.com                         │
│  Tổng:       ¥3,500                                 │
│  Lý do:      Bill từ shop khác                      │
│                                                     │
│  ✓ Sau khi từ chối:                                 │
│    1. Đơn → status='cancelled'                      │
│    2. Email tự động gửi cho khách báo đơn bị huỷ   │
│    3. Anh PHẢI tự chuyển ngược ¥3,500 cho khách    │
│       qua PayPay (1-2 ngày)                         │
│                                                     │
│  ⚠️ Hành động này KHÔNG thể undo.                  │
│                                                     │
│  [← Quay lại]            [✅ Xác nhận từ chối]     │
└─────────────────────────────────────────────────────┘
```

**On confirm:**
1. Frontend call `admin_reject_order_v2(p_confirmation_id, p_reason_code, p_notes, p_refund_required)`
2. Nếu `ok=true` → call Apps Script endpoint `send_reject_email` với `{order_no, reason_code, customer_email, refund_method, amount}`
3. Show toast `"❌ Đơn #BTJ-0042 đã từ chối. Email cho khách đã gửi."`
4. Refresh order list — đơn xuống section "🔴 Cần refund (1)" mới (xem 3.5).
5. Đóng modal.

### 3.4. Sau khi reject — Refund tracking section

Trong modal đơn `cancelled` với `refund_required=true` và `refund_completed_at IS NULL`:

```
┌─────────────────────────────────────────────────────┐
│  💸 Cần hoàn tiền: ¥3,500                          │
├─────────────────────────────────────────────────────┤
│  Method:    [▼ PayPay ▾] [▼ Bank ▾]                │
│  Reference: ┌────────────────────────────────┐     │
│             │ vd: PP-TX-20260502-12345       │     │
│             └────────────────────────────────┘     │
│                                                     │
│  [✅ Đã hoàn tiền — đánh dấu xong]                 │
└─────────────────────────────────────────────────────┘
```

Click → call `admin_mark_refund_completed(...)` → đánh dấu xong + audit log.

### 3.5. Filter bar mở rộng

Bổ sung 1 filter mới vào filter bar (xem SPEC-2-STEP-VERIFY.md section 3.3):

```
[ Tất cả ] [ 🔴 Cần review ] [ 🟡 Chờ XN ] [ ⚪ Đã XN ] [ 💸 Cần refund (n) ]
```

`💸 Cần refund` query: `status='cancelled' AND refund_required=true AND refund_completed_at IS NULL`.

---

## 4. Customer Notification — Email "Đơn không thể xử lý"

### 4.1. Template file

`K:\bep-thuy-japan\email-reject-refund.html` — template HTML mới, dùng inline-CSS như các email khác.

### 4.2. Tone & Content (Vietnamese)

**Tiêu chí tone:**
- Lịch sự, không đổ lỗi cho khách (kể cả khi bill fake — vẫn để khách "save face").
- Rõ ràng về số tiền + cách nhận lại.
- Mở 1 cánh cửa cho khách phản hồi nếu có hiểu lầm (Zalo/Email).
- Vietnamese trang trọng kiểu "Bếp Thuỷ" — xưng "Bếp Thuỷ" (không "em"), gọi khách "anh/chị".

### 4.3. Body skeleton

```
Subject: Đơn hàng #{{order_no}} của anh/chị không thể xử lý — Bếp Thuỷ Japan

Kính gửi anh/chị {{customer_name}},

Bếp Thuỷ rất tiếc phải báo rằng đơn hàng #{{order_no}} (¥{{amount}}, đặt ngày
{{order_date}}) hiện tại chưa thể xử lý.

Lý do: {{reason_friendly}}    ← map từ reason_code, xem 4.4

────────────────────────────────────────────
{{#if refund_required}}
💴 Hoàn tiền

Bếp Thuỷ sẽ chuyển ngược ¥{{amount}} về cho anh/chị:

  {{#if paid_via_paypay}}
  ▸ Phương thức: PayPay
  ▸ Thời gian: 1–2 ngày làm việc
  ▸ Sẽ vào lại ví PayPay anh/chị đã dùng để chuyển
  {{/if}}

  {{#if paid_via_bank}}
  ▸ Phương thức: Chuyển khoản ngân hàng
  ▸ Thời gian: 1–3 ngày làm việc
  ▸ Sẽ chuyển vào tài khoản anh/chị đã chuyển TỪ
    (cùng số tài khoản, không cần cung cấp lại)
  {{/if}}

Anh/chị KHÔNG cần làm gì cả — Bếp Thuỷ sẽ chủ động chuyển.
{{/if}}

{{#if !refund_required}}
ℹ️  Theo dữ liệu Bếp Thuỷ kiểm tra, hiện chưa thấy giao dịch chuyển khoản
   vào tài khoản chính của Bếp Thuỷ với số tiền ¥{{amount}}. Nếu anh/chị
   thực sự đã chuyển và thông tin trên KHÔNG đúng, anh/chị nhắn Zalo
   080-5115-6688 để Thuỷ kiểm tra cùng — Bếp Thuỷ sẵn sàng làm rõ.
{{/if}}

────────────────────────────────────────────
🤝 Nếu có hiểu lầm

Bếp Thuỷ là cửa hàng nhỏ, đôi khi cũng có nhầm lẫn. Nếu anh/chị nghĩ đơn
này bị huỷ nhầm, hoặc muốn đặt lại, vui lòng nhắn:

  ▸ Zalo: 080-5115-6688
  ▸ Email: thanghoang1109@gmail.com

Bếp Thuỷ sẽ phản hồi trong vòng 24h.

Cảm ơn anh/chị đã quan tâm Bếp Thuỷ Japan.

Trân trọng,
Bếp Thuỷ Japan
https://www.thuyjapan.com
```

### 4.4. Mapping `reason_code` → `reason_friendly` (cho khách)

Khách KHÔNG cần biết detail technical. Map sang lý do "công khai" lịch sự:

| `reason_code` | `reason_friendly` (khách thấy) |
|---|---|
| `bill_fake` | "Hóa đơn anh/chị gửi không khớp với hệ thống của Bếp Thuỷ. Có thể do lỗi tải lên hoặc nhầm hóa đơn." |
| `amount_short` | "Số tiền trên hóa đơn không khớp với tổng đơn hàng (¥{{amount}})." |
| `wrong_shop` | "Hóa đơn anh/chị gửi có vẻ là của một shop khác. Có thể do nhầm khi tải lên." |
| `wrong_account` | "Tài khoản nhận tiền trên hóa đơn không phải tài khoản chính của Bếp Thuỷ." |
| `customer_request` | "Theo yêu cầu huỷ của anh/chị." |
| `bill_duplicate` | "Hóa đơn này đã được sử dụng cho một đơn khác. Có thể do nhầm khi tải lên." |
| `bill_stale` | "Hóa đơn quá cũ (trên 7 ngày). Bếp Thuỷ cần hóa đơn gần đây để xác nhận." |
| `other` | "Lý do: {{notes}}" (dùng note anh ghi nếu phù hợp với khách, anh quyết khi reject) |

**Quan trọng:** Anh có quyền edit `reason_friendly` trước khi email gửi đi (xem 4.5).

### 4.5. Email preview + edit step

Trước khi gửi email, modal hiện preview cho anh sửa:

```
┌─────────────────────────────────────────────────────┐
│  📧 Preview email gửi khách                         │
├─────────────────────────────────────────────────────┤
│  To:       vana@gmail.com                           │
│  Subject:  Đơn hàng #BTJ-0042... [edit ✏️]          │
│                                                     │
│  Body preview:                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ Kính gửi anh/chị Nguyễn Văn A,               │  │
│  │ ...                                          │  │
│  │ Lý do: [Hóa đơn anh/chị gửi có vẻ...] [✏️]   │  │
│  │ ...                                          │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ☑ Gửi luôn  ☐ Để Thuỷ tự gửi tay sau              │
│                                                     │
│  [← Quay lại]            [📧 Gửi email]            │
└─────────────────────────────────────────────────────┘
```

Nếu anh chọn "Để Thuỷ tự gửi tay sau" → reject vẫn save trong DB nhưng không gửi email tự động — anh sẽ tự nhắn Zalo cho khách.

### 4.6. Apps Script endpoint

```js
// google-apps-script.js (mới)
function sendRejectEmail_(payload) {
  const { order_no, customer_email, customer_name, amount,
          reason_code, reason_friendly_override, refund_required,
          refund_method } = payload;

  const template = HtmlService.createTemplateFromFile('email-reject-refund');
  template.order_no = order_no;
  template.customer_name = customer_name;
  template.amount = amount.toLocaleString();
  template.reason_friendly = reason_friendly_override || mapReasonFriendly_(reason_code);
  template.refund_required = refund_required;
  template.paid_via_paypay = refund_method === 'paypay';
  template.paid_via_bank   = refund_method === 'bank';

  GmailApp.sendEmail(
    customer_email,
    `Đơn hàng #${order_no} của anh/chị không thể xử lý — Bếp Thuỷ Japan`,
    '', // plain fallback
    {
      htmlBody: template.evaluate().getContent(),
      name: 'Bếp Thuỷ Japan',
      replyTo: 'thanghoang1109@gmail.com',
      bcc: 'thanghoang1109@gmail.com'   // anh nhận copy để biết đã gửi gì
    }
  );
}
```

---

## 5. Refund Execution — Today (Manual) → Future (Automated)

### 5.1. Today — Manual

Sau khi reject xong, đơn xuống section **"💸 Cần refund"**. Anh:

1. Mở PayPay app (cá nhân) hoặc bank app.
2. Tìm transaction gốc của khách (PayPay history theo amount + ngày).
3. Click "送金" hoặc chuyển khoản → nhập số tiền + tài khoản khách.
4. Sau khi PayPay confirm → copy transaction ID.
5. Quay lại admin dashboard → modal đơn đó → nhập transaction ID → click "✅ Đã hoàn tiền".
6. Đơn rời khỏi section "💸 Cần refund" → vào section "Đã hoàn".

**SLA cho anh:** Refund trong **2 ngày làm việc** kể từ lúc reject. Nếu > 2 ngày, dashboard show badge `[⚠️ QUÁ HẠN]` đỏ.

### 5.2. Future — Automated (sau PayPay Business)

Sau khi anh upgrade PayPay Business per `HUONG-DAN-PAYPAY-BUSINESS.md`:

```
PayPay Refund API endpoint:
POST https://apigw.paypay.ne.jp/v2/refunds
Headers: Authorization (HMAC), X-ASSUME-MERCHANT
Body: {
  "merchantRefundId": "REFUND-{orderNo}-{ts}",
  "paymentId":        "<paypay_payment_id từ paypay_payments table>",
  "amount":           { "amount": 3500, "currency": "JPY" },
  "reason":           "<reason_friendly>"
}
```

Apps Script wrapper `paypay_refund_(orderNo)`:
1. Load `paypay_merchant_payment_id` từ orders.
2. Sign HMAC, POST tới Refund API.
3. Khi PayPay response `acceptedAt` → call `admin_mark_refund_completed(order_no, 'paypay', refund.merchantRefundId)`.
4. Audit log entry với `details.automated=true`.

Ở UI, button đổi từ "✅ Đã hoàn tiền (manual)" → "💸 Hoàn tiền tự động qua PayPay" — 1 click anh không phải mở app.

**Migration plan:** Chỉ cần đổi function `markRefundCompleted` → `triggerAutoRefund`. Schema không thay đổi. Thời gian ước: 1 ngày code + test sandbox.

---

## 6. Audit Trail — Mỗi reject phải log đầy đủ

### 6.1. Format `admin_audit_log.details` cho `action_type='reject_order_v2'`

```json
{
  "reason_code": "wrong_shop",
  "notes": "Bill có logo Family Mart, không phải PayPay",
  "refund_required": true,
  "order_snapshot": {
    "order_no": "BTJ-0042",
    "customer_email": "vana@gmail.com",
    "customer_name": "Nguyễn Văn A",
    "total": 3500,
    "items": [...],
    "created_at": "2026-05-01T14:23:00Z",
    "status_before_reject": "pending_manual_review"
  },
  "confirmation_id": 1234,
  "ai_match": false,
  "ai_reason": "Layer 2 fail: recipient mismatch",
  "email_sent": true,
  "email_sent_at": "2026-05-02T10:15:00Z"
}
```

### 6.2. Format cho `action_type='mark_refund_completed'`

```json
{
  "refund_method": "paypay",
  "refund_reference": "PP-TX-20260502-12345",
  "refund_amount": 3500,
  "automated": false,
  "lag_hours": 18.3   // computed: refund_completed_at - cancelled_at
}
```

### 6.3. Query mẫu cho anh

```sql
-- Xem tất cả reject tháng này
SELECT
  l.created_at, l.admin_email,
  l.target_id AS order_no,
  l.details->>'reason_code' AS reason,
  l.details->>'refund_required' AS refund_needed
FROM admin_audit_log l
WHERE action_type = 'reject_order_v2'
  AND created_at >= date_trunc('month', now())
ORDER BY created_at DESC;

-- Stats: lý do reject phổ biến nhất
SELECT
  details->>'reason_code' AS reason_code,
  count(*) AS n_rejects,
  count(*) FILTER (WHERE (details->>'refund_required')::boolean) AS n_refunds
FROM admin_audit_log
WHERE action_type = 'reject_order_v2'
  AND created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 2 DESC;
```

---

## 7. Edge Cases

### 7.1. Khách dispute sau khi đã reject

**Scenario:** Anh reject vì nghĩ bill fake → 2 ngày sau khách Zalo: "Em đã chuyển thật, screenshot PayPay đây."

**Quy trình:**
1. Anh xin khách screenshot PayPay history (showing transaction → recipient = anh, amount, time).
2. Anh đối chiếu với history PayPay của anh → nếu đúng có giao dịch → thừa nhận miss.
3. Cách xử lý:
   - **Option A — Tạo đơn mới:** Anh tạo lại đơn cùng items, set `status='confirmed'` ngay (skip 2-step verify), ghi note "Đơn này thay cho #BTJ-0042 đã reject nhầm".
   - **Option B — Reactivate đơn cũ:** Cần SQL tay (em viết RPC `admin_unreject_order` chỉ cho super_admin):
     ```sql
     -- Chỉ super_admin
     UPDATE orders SET
       status = 'confirmed',
       cancel_reason = NULL,
       reject_reason_code = NULL,
       refund_required = false,
       note = note || ' [UNREJECT 2026-05-04: khách dispute thành công]'
     WHERE order_no = 'BTJ-0042';

     INSERT INTO admin_audit_log(...) VALUES (..., 'unreject_order', ...);
     ```
4. **Bằng chứng cần:** Audit log đã có `order_snapshot` đầy đủ → không mất data. Anh chỉ cần screenshot Zalo conversation + PayPay history khách gửi → lưu vào `admin_notes` của đơn mới.

**Phòng ngừa:** Trước khi reject `bill_fake`, anh BẮT BUỘC mở PayPay history check trans ID + amount + time → 99% catch được trước.

### 7.2. Reject xảy ra > 7 ngày sau khi khách submit

**Scenario:** Anh đi vắng 10 ngày, đơn `pending_manual_review` từ ngày 1 → ngày 11 anh mới review → quyết reject.

**Vấn đề:**
- Khách đã chờ 10 ngày → khả năng cao đã bực, đã đặt chỗ khác.
- Refund qua PayPay vẫn được (PayPay không có time limit cho 個人 send-back).
- Refund qua bank vẫn được nhưng tài khoản gốc có thể đã đổi (hiếm).

**Quy trình:**
1. Reject như bình thường nhưng email **THÊM 1 đoạn xin lỗi**:
   ```
   ⚠️ Bếp Thuỷ rất xin lỗi vì đã trễ phản hồi {{days_late}} ngày.
   Là lỗi của Bếp Thuỷ và sẽ tặng anh/chị mã giảm 10% (LATE10) cho đơn sau.
   ```
2. Modal Bước 2 hiện cảnh báo:
   ```
   ⚠️ Đơn này đã chờ 11 ngày. Khách có thể đã không hài lòng.
      Cân nhắc: tặng coupon 10% kèm email xin lỗi.
   ```
3. Auto-add coupon trong email body nếu `(now - order.created_at) > 7 days`.

### 7.3. Khách trả tiền nhưng đơn auto-cancelled (không có admin)

**Scenario hiện tại không xảy ra** vì code KHÔNG có job auto-cancel `pending_manual_review`. Nhưng nếu sau này em add cron "auto-cancel sau 14 ngày không có ai review":

**Quy trình bắt buộc:**
1. Cron job KHÔNG được gọi `admin_reject_order_v2` (vì không có admin auth).
2. Phải có RPC riêng `system_auto_cancel_stale` set `status='cancelled'`, `reject_reason_code='auto_stale'`, `refund_required=true` (mặc định nghi ngờ khách đã trả).
3. Email khách: "Đơn của anh/chị đã quá lâu chưa được xử lý..." + "Nếu đã chuyển tiền vui lòng gửi screenshot PayPay history về thanghoang1109@gmail.com để Bếp Thuỷ refund."
4. Audit log: `admin_email='system@bep-thuy.bot'`, `action_type='auto_cancel_stale'`.

**Em recommend KHÔNG bật auto-cancel cho tới khi flow này stable.** Đơn `pending_manual_review` cứ để trong queue, anh xử lý khi có thời gian.

### 7.4. Khách upload bill sau khi đơn đã bị reject

**Scenario:** Đơn reject vì `bill_stale`, khách upload bill mới qua link `/thanh-toan?order=BTJ-0042`.

**Behavior:** Frontend check `orders.status='cancelled'` → block upload, show:
```
Đơn #BTJ-0042 đã được Bếp Thuỷ huỷ. Anh/chị vui lòng đặt đơn mới
hoặc nhắn Zalo 080-5115-6688 để Thuỷ giúp khôi phục.
```

### 7.5. Anh chuyển nhầm khi refund (chuyển 2 lần)

**Scenario:** Anh chuyển PayPay refund xong quên đánh dấu, 2 ngày sau lại chuyển lần nữa.

**Mitigation:**
- `admin_mark_refund_completed` là **idempotent** — gọi lần 2 trả về `{ok:true, already:true}`, không tạo duplicate log.
- UI: Sau khi đánh dấu xong, button đổi thành disabled `[✅ Đã hoàn lúc 14:30 · PP-TX-12345]` — không click được nữa.
- Nhưng việc "anh chuyển 2 lần qua PayPay app" thì tool này KHÔNG biết → anh phải nhớ. Khi PayPay Business API automated, vấn đề biến mất.

### 7.6. Reject 1 đơn có nhiều `payment_confirmations` records

**Scenario:** Khách upload bill 3 lần (lần 1+2 fail, lần 3 fake). Anh reject record lần 3.

**Behavior:**
- `admin_reject_order_v2(p_confirmation_id=3)` chỉ mark **record id=3** là `rejected`.
- Order chuyển `cancelled` → tất cả các record cũ (id=1, 2) tự động vô hiệu (vì đơn cancel).
- Audit log ghi `confirmation_id=3` để biết anh dựa trên ảnh nào để reject.

---

## 8. Implementation Checklist

### Phase 1 — Backend (em làm trước)
- [ ] Tạo migration `supabase-reject-refund.sql` với:
  - [ ] 6 cột mới trên `orders`
  - [ ] RPC `admin_reject_order_v2`
  - [ ] RPC `admin_mark_refund_completed`
  - [ ] Constraint check `reject_reason_code`
  - [ ] Index `idx_orders_refund_pending`
- [ ] Anh chạy SQL trên Supabase SQL Editor.

### Phase 2 — Email template
- [ ] Tạo `email-reject-refund.html` (responsive, inline CSS, theo style email-admin-review-needed.html)
- [ ] Tạo `mapReasonFriendly_()` helper trong `google-apps-script.js`
- [ ] Tạo doPost handler `send_reject_email`

### Phase 3 — Admin UI (`thuythang.html`)
- [ ] Thêm modal "Từ chối đơn" 2 bước (Section 3.2 + 3.3)
- [ ] Thêm preview email step (Section 4.5)
- [ ] Thêm filter "💸 Cần refund (n)" vào filter bar
- [ ] Thêm refund tracking section trong modal đơn cancelled (Section 3.4)
- [ ] Wire button `[❌ Từ chối + huỷ]` → mở modal mới (thay cho confirm() đơn giản hiện tại)

### Phase 4 — Test
- [ ] Test reject với từng `reason_code` (8 cases)
- [ ] Test refund mark — PayPay + Bank
- [ ] Test "skip email" option (anh muốn nhắn tay)
- [ ] Test edge case 7.1 (unreject path qua SQL)
- [ ] Test idempotent — gọi reject 2 lần
- [ ] Verify audit log có đầy đủ `order_snapshot`

### Phase 5 — Future (sau PayPay Business)
- [ ] Implement `paypay_refund_()` Apps Script wrapper
- [ ] Đổi UI "✅ Đã hoàn tiền (manual)" → "💸 Tự động hoàn qua PayPay"
- [ ] Webhook handler cho PayPay refund completed callback
- [ ] Migrate đơn cũ chưa refund → batch process

---

## 9. Open Questions cho anh

1. **Email auto hay anh muốn confirm trước mỗi lần?**
   Em recommend: default **auto-send** với checkbox "Để Thuỷ tự gửi tay" để cover edge cases. OK?

2. **Coupon `LATE10` cho case 7.2** — anh muốn em wire vào hệ thống coupon hiện tại không?
   (Cần check anh đã có coupon system chưa.)

3. **Super_admin unreject path (7.1)** — em build thành RPC hay anh muốn chạy SQL tay từng lần?
   Em recommend: build RPC để có audit trail, nhưng restrict chỉ super_admin.

4. **Soft-delete vs hard-delete** — đơn `cancelled` có cần ẩn khỏi default order list sau N ngày?
   Em recommend: vẫn show, có filter "Ẩn đơn cancelled > 30 ngày" cho anh tự bật.

5. **Notification cho anh khi quá 2 ngày chưa refund** — push email nhắc?
   Em recommend: cron job daily check `refund_completed_at IS NULL AND cancelled > 2 days` → email anh list. Anh OK không?

---

**Hết spec. Anh review xong báo em — em code Phase 1 (migration) trước, anh chạy SQL, rồi em làm tiếp Phase 2-3.**
