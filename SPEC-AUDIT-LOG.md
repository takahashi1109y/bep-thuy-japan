# SPEC — Admin Audit Log (Nhật ký hành động admin)

**Tác giả:** em (Claude) — viết theo yêu cầu của anh Thắng
**Ngày:** 2026-05-02
**Trạng thái:** Draft v1 — chờ anh duyệt rồi Agent 4 mới làm migration
**Phạm vi file ảnh hưởng:**
- Migration SQL mới: `K:\bep-thuy-japan\supabase-admin-audit-log.sql`
- `K:\bep-thuy-japan\google-apps-script.js` (helper `logAdminAction_()` mới)
- `K:\bep-thuy-japan\thuythang.html` (gọi log khi admin click confirm/reject)
- Phase 3: Tab "Audit log" mới trong `thuythang.html`

---

## 0. Tại sao cần audit log?

Hiện tại **không có cách nào** truy lại "ai đã làm gì, lúc nào, với đơn nào". Vấn đề thực tế:

1. **Tranh chấp với khách**: Khách khiếu nại "tôi đã trả tiền sao đơn bị huỷ?" → Anh cần bằng chứng "lúc 14:35 anh đã reject vì lý do X".
2. **Truy vết lỗi**: AI pass nhưng anh nhỡ tay reject → cần biết click sai lúc nào để revert.
3. **Multi-admin tương lai**: Nếu sau này anh thuê thêm người (em gái, partner), cần biết ai làm gì.
4. **Yêu cầu pháp lý Nhật**: 商法 (Shōhō — Luật Thương mại Nhật) yêu cầu lưu sổ sách giao dịch **7 năm** (Điều 19 cộng với 法人税法 Điều 126). Audit log là một phần.
5. **Productivity metric**: Anh muốn biết "tuần này em xử lý 50 đơn, trung bình 2 phút/đơn" — phục vụ mục tiêu KPI.

**Mục tiêu KPI:**
- 100% admin action quan trọng được log (confirm, reject, force approve, cancel, edit).
- Log **immutable** (không sửa, không xoá) — đảm bảo tính pháp lý.
- Query lịch sử 1 đơn trong **<200ms** (index trên target_id).
- Phase 3 UI cho phép anh tự browse log mà không cần SQL.

---

## 1. Database Schema

### 1.1. Bảng mới `admin_audit_log`

```sql
-- File: K:\bep-thuy-japan\supabase-admin-audit-log.sql

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ai làm
  admin_email     text NOT NULL,                    -- vd: "thanghoang1109@gmail.com"
  admin_user_id   uuid REFERENCES auth.users(id),   -- = auth.uid() từ JWT

  -- Làm gì
  action_type     text NOT NULL,                    -- enum, xem section 2
  target_type     text NOT NULL,                    -- 'order' | 'payment_confirmation' | 'product_catalog' | ...
  target_id       text NOT NULL,                    -- order_no | confirmation_id | product_id | ...

  -- Trạng thái trước/sau
  before_state    jsonb,                            -- snapshot trước action (có thể NULL nếu insert mới)
  after_state     jsonb,                            -- snapshot sau action (có thể NULL nếu delete)

  -- Chi tiết bổ sung
  details         jsonb DEFAULT '{}'::jsonb,        -- { reason, notes, override_flag, ... }

  -- Metadata request
  ip_address      text,                             -- từ X-Forwarded-For (Apps Script không có)
  user_agent      text,                             -- từ navigator.userAgent

  -- Khi nào
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Constraint
  CONSTRAINT admin_audit_log_action_type_check CHECK (action_type IN (
    'confirm_payment',
    'reject_payment',
    'force_approve_ai_fail',
    'cancel_order',
    'restore_order',
    'edit_shipping_address',
    'edit_inventory_price',
    'edit_inventory_stock',
    'mark_shipped',
    'update_tracking',
    'send_campaign_email',
    'send_admin_message',
    'update_product_catalog',
    'manual_review_decision',
    'edit_customer_info',
    'refund_issued',
    'login_admin_dashboard',
    'export_data'
  )),

  CONSTRAINT admin_audit_log_target_type_check CHECK (target_type IN (
    'order',
    'payment_confirmation',
    'product_catalog',
    'inventory',
    'customer',
    'campaign',
    'shipping',
    'system'
  ))
);

-- Indexes (query patterns ở section 4)
CREATE INDEX IF NOT EXISTS idx_audit_admin_created
  ON public.admin_audit_log (admin_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_target
  ON public.admin_audit_log (target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_action_type
  ON public.admin_audit_log (action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON public.admin_audit_log (created_at DESC);

-- Comment
COMMENT ON TABLE public.admin_audit_log IS
  'Immutable audit trail cho mọi admin action. KHÔNG UPDATE, KHÔNG DELETE. Retention: 7 năm theo 商法 Nhật.';

COMMENT ON COLUMN public.admin_audit_log.before_state IS
  'JSONB snapshot của row trước khi action xảy ra. NULL nếu là INSERT mới.';

COMMENT ON COLUMN public.admin_audit_log.after_state IS
  'JSONB snapshot của row sau khi action xảy ra. NULL nếu là DELETE/cancel.';
```

### 1.2. Verify migration

```sql
-- Sau khi chạy, anh check:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='admin_audit_log'
ORDER BY ordinal_position;

-- Test insert (nên fail vì RLS chưa policy INSERT)
INSERT INTO public.admin_audit_log (admin_email, action_type, target_type, target_id)
VALUES ('test@test.com', 'confirm_payment', 'order', 'TEST-001');
```

---

## 2. Action Types Catalog

Bảng đầy đủ 18 action types — đánh số ưu tiên implement.

| # | action_type | target_type | Khi nào trigger | Phase |
|---|---|---|---|---|
| 1 | `confirm_payment` | order | Anh click "✅ Xác nhận đã trả tiền" trong modal | **1** |
| 2 | `reject_payment` | order | Anh click "❌ Reject" trong modal | **1** |
| 3 | `force_approve_ai_fail` | order | Anh approve đơn `pending_manual_review` (AI fail) | **1** |
| 4 | `manual_review_decision` | order | Anh quyết định approve/reject từ tab manual review | **1** |
| 5 | `cancel_order` | order | Anh huỷ đơn (status → cancelled) | 2 |
| 6 | `restore_order` | order | Anh khôi phục đơn đã huỷ | 2 |
| 7 | `edit_shipping_address` | order | Anh sửa địa chỉ giao hàng | 2 |
| 8 | `edit_customer_info` | customer | Anh sửa SĐT/email khách | 2 |
| 9 | `mark_shipped` | order | Anh click "Đã ship" + nhập tracking | 2 |
| 10 | `update_tracking` | shipping | Anh cập nhật mã tracking Yamato/Sagawa | 2 |
| 11 | `edit_inventory_price` | inventory | Anh sửa giá sản phẩm | 2 |
| 12 | `edit_inventory_stock` | inventory | Anh điều chỉnh tồn kho | 2 |
| 13 | `update_product_catalog` | product_catalog | Anh thêm/sửa/ẩn sản phẩm | 2 |
| 14 | `send_campaign_email` | campaign | Anh bấm "Gửi email campaign" | 2 |
| 15 | `send_admin_message` | order | Anh gửi tin nhắn riêng cho khách (note đơn) | 2 |
| 16 | `refund_issued` | order | Anh ghi nhận đã hoàn tiền cho khách | 2 |
| 17 | `login_admin_dashboard` | system | Anh login vào /thuythang (1 lần/session) | 3 |
| 18 | `export_data` | system | Anh xuất CSV/Excel | 3 |

**Quy ước đặt tên:**
- snake_case, động từ + danh từ.
- Không quá 30 ký tự (đẹp khi hiển thị UI).
- KHÔNG đổi tên action_type sau khi đã production (sẽ phá CHECK constraint cũ).

---

## 3. Row Level Security (RLS)

### 3.1. Bật RLS

```sql
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
```

### 3.2. Policies

```sql
-- Policy 1: Admin đọc TẤT CẢ log (để debug, dispute resolution)
CREATE POLICY "admin_can_select_all_audit"
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (
    auth.email() IN (
      'thanghoang1109@gmail.com'
      -- thêm email admin khác ở đây nếu có em gái/partner
    )
  );

-- Policy 2: Admin chỉ INSERT log của CHÍNH MÌNH
-- (Không cho phép giả mạo log dưới tên người khác)
CREATE POLICY "admin_can_insert_own_audit"
  ON public.admin_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    admin_email = auth.email()
    AND auth.email() IN (
      'thanghoang1109@gmail.com'
    )
  );

-- Policy 3: TUYỆT ĐỐI KHÔNG UPDATE
-- (Không tạo policy UPDATE → RLS deny mặc định)
-- Để chắc chắn, revoke explicit:
REVOKE UPDATE ON public.admin_audit_log FROM authenticated, anon, public;

-- Policy 4: TUYỆT ĐỐI KHÔNG DELETE
-- (Không tạo policy DELETE → RLS deny mặc định)
REVOKE DELETE ON public.admin_audit_log FROM authenticated, anon, public;
```

### 3.3. Service role

`service_role` (key dùng trong Apps Script) **bypass RLS** mặc định — vẫn insert/select được. Đây là tính năng, không phải bug:
- Apps Script `logAdminAction_()` dùng `service_role` để insert log.
- Phía client (browser) anh login qua Supabase Auth → dùng `authenticated` role → bị RLS gate.

**Cảnh báo:** Đừng để lộ service_role key ra browser. Hiện tại Apps Script làm proxy nên OK.

---

## 4. Query Patterns

### 4.1. Lịch sử action của 1 admin trong 7 ngày

```sql
SELECT
  created_at AT TIME ZONE 'Asia/Tokyo' AS jp_time,
  action_type,
  target_type,
  target_id,
  details->>'reason' AS reason
FROM public.admin_audit_log
WHERE admin_email = 'thanghoang1109@gmail.com'
  AND created_at > now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 200;
```

→ Dùng index `idx_audit_admin_created`.

### 4.2. Lịch sử của 1 đơn (dispute resolution)

```sql
SELECT
  created_at AT TIME ZONE 'Asia/Tokyo' AS jp_time,
  admin_email,
  action_type,
  before_state,
  after_state,
  details
FROM public.admin_audit_log
WHERE target_type = 'order'
  AND target_id = 'BTJ-2026-0123'
ORDER BY created_at ASC;  -- timeline forward
```

→ Dùng index `idx_audit_target`. Đây là query **quan trọng nhất** khi khách khiếu nại.

### 4.3. Đếm action theo loại (productivity metric)

```sql
SELECT
  action_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h,
  COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS last_7d
FROM public.admin_audit_log
WHERE admin_email = 'thanghoang1109@gmail.com'
GROUP BY action_type
ORDER BY total DESC;
```

### 4.4. Thời gian xử lý trung bình mỗi đơn

```sql
-- Khoảng thời gian từ confirm_payment đến mark_shipped
WITH order_lifecycle AS (
  SELECT
    target_id AS order_no,
    MIN(created_at) FILTER (WHERE action_type = 'confirm_payment') AS confirmed_at,
    MIN(created_at) FILTER (WHERE action_type = 'mark_shipped') AS shipped_at
  FROM public.admin_audit_log
  WHERE target_type = 'order'
  GROUP BY target_id
)
SELECT
  AVG(EXTRACT(EPOCH FROM (shipped_at - confirmed_at))/3600)::numeric(5,1) AS avg_hours,
  COUNT(*) AS sample_size
FROM order_lifecycle
WHERE confirmed_at IS NOT NULL AND shipped_at IS NOT NULL;
```

### 4.5. Phát hiện bất thường (anomaly)

```sql
-- Tỷ lệ reject_payment / confirm_payment trong 7 ngày
-- Nếu > 30% → có thể có vấn đề với AI verify hoặc fraud rate tăng
SELECT
  COUNT(*) FILTER (WHERE action_type = 'confirm_payment') AS confirmed,
  COUNT(*) FILTER (WHERE action_type = 'reject_payment') AS rejected,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE action_type = 'reject_payment')
    / NULLIF(COUNT(*) FILTER (WHERE action_type IN ('confirm_payment', 'reject_payment')), 0),
    1
  ) AS reject_rate_pct
FROM public.admin_audit_log
WHERE created_at > now() - interval '7 days';
```

---

## 5. Privacy & Compliance

### 5.1. PII trong `details` jsonb — minimize

**Nguyên tắc:** `details` jsonb có thể chứa:
- ✅ OK lưu: order_no, action reason ("đối chiếu xong"), admin notes ngắn.
- ⚠️ Cẩn trọng: tên khách, email khách (chỉ khi action liên quan như edit_customer_info).
- ❌ Không lưu: số thẻ tín dụng, password, full address (đã có trong `before_state`/`after_state` snapshot rồi — đừng duplicate).

**Quy tắc thực tế cho `logAdminAction_()`:**
```js
// ✅ ĐÚNG
details: { reason: "AI fail layer 2", admin_note: "đã verify bank" }

// ❌ SAI — duplicate PII
details: { customer_email: "user@example.com", customer_phone: "090-..." }
// → PII đã có sẵn trong before_state/after_state rồi
```

### 5.2. Retention policy — 7 năm

**Cơ sở pháp lý Nhật Bản:**
- 商法 (Shōhō) Điều 19: Sổ sách thương mại lưu **10 năm** kể từ ngày đóng sổ.
- 法人税法 (Hōjin zeihō — Luật thuế công ty) Điều 126: Lưu **7 năm** chứng từ giao dịch.
- Bếp Thuỷ là **個人事業主** (kojin jigyōnushi — hộ kinh doanh cá nhân) — áp dụng 所得税法 Điều 232: lưu **7 năm**.

**Em đề xuất: 7 năm** — phù hợp luật thuế thu nhập cá nhân.

**Implementation:**
```sql
-- Cron monthly để xoá log cũ hơn 7 năm
-- (Chạy thủ công hoặc qua pg_cron extension)
DELETE FROM public.admin_audit_log
WHERE created_at < now() - interval '7 years';
```

**Cảnh báo:** Tới năm 2033 mới chạy lệnh này lần đầu. Trong khi đó, log sẽ tăng — uớc tính:
- 50 action/ngày × 365 ngày × 7 năm = **127,750 row** sau 7 năm.
- Mỗi row ~2KB (jsonb) → ~250MB. Supabase free tier OK.

### 5.3. GDPR "Right to erasure" vs Audit immutability

**Conflict:** GDPR Điều 17 cho khách EU quyền yêu cầu xoá dữ liệu cá nhân, nhưng audit log **immutable**.

**Giải quyết:**
1. **Bếp Thuỷ chỉ ship Nhật** → khách hầu hết không phải EU resident → GDPR không áp dụng trực tiếp.
2. Nếu có khách EU yêu cầu xoá:
   - **KHÔNG xoá** row audit_log (giữ tính pháp lý).
   - **REDACT PII** trong jsonb cụ thể của row đó:
     ```sql
     UPDATE public.admin_audit_log
     SET
       before_state = jsonb_set(
         before_state - 'customer_email' - 'customer_phone' - 'address',
         '{redacted}',
         'true'
       ),
       after_state = jsonb_set(
         after_state - 'customer_email' - 'customer_phone' - 'address',
         '{redacted}',
         'true'
       ),
       details = details || jsonb_build_object('gdpr_redacted_at', now()::text)
     WHERE target_id = 'AFFECTED-ORDER-NO';
     ```
   - **Lưu ý:** Lệnh UPDATE này sẽ FAIL với policy hiện tại (REVOKE UPDATE). Cần chạy bằng **service_role** + tạo audit log "gdpr_redaction" mới ghi nhận việc redact.

3. **Document policy:** Tạo `K:\bep-thuy-japan\PRIVACY-POLICY.md` (tách riêng) ghi rõ retention 7 năm + redaction process.

---

## 6. Implementation Phases

### Phase 1 — Audit log cho confirm/reject (batch hiện tại)

**Scope:**
- Migration `supabase-admin-audit-log.sql` (Agent 4 chạy).
- Helper `logAdminAction_()` trong `google-apps-script.js`.
- Gọi log trong 4 action quan trọng nhất:
  - `confirm_payment` (khi anh click "✅ Xác nhận đã trả tiền")
  - `reject_payment` (khi anh click "❌ Reject")
  - `force_approve_ai_fail` (khi anh approve đơn pending_manual_review)
  - `manual_review_decision` (khi anh quyết approve/reject từ tab manual review)

**Test plan:**
1. Chạy migration → check `\d admin_audit_log` thấy đầy đủ cột.
2. Test RLS: login client thử `INSERT admin_email = 'fake@x.com'` → phải fail.
3. Test happy path: anh click confirm 1 đơn → query `SELECT * FROM admin_audit_log` thấy row mới.
4. Test query 4.2 (lịch sử 1 đơn) → trả đúng timeline.

**Acceptance criteria:**
- [ ] Mỗi click confirm/reject tạo đúng 1 row audit_log.
- [ ] before_state có snapshot status cũ, after_state có status mới.
- [ ] admin_email match `auth.email()` không giả mạo được.
- [ ] Query 4.2 chạy <200ms với 1000 row test data.

### Phase 2 — Mở rộng cho action còn lại

Các action số 5–16 (cancel, edit address, mark shipped, etc.). Mỗi action cần:
- Update handler liên quan trong `google-apps-script.js`.
- Gọi `logAdminAction_()` với đúng action_type.
- Test snapshot before/after đúng.

**Ưu tiên:** Action liên quan đến tiền (refund_issued, edit_inventory_price) → làm trước. Action liên quan đến info (edit_customer_info) → làm sau.

### Phase 3 — UI tab "Audit log" trong /thuythang

**UI mockup:**
```
┌──────────────────────────────────────────────────────────┐
│  📋 Audit Log                                            │
├──────────────────────────────────────────────────────────┤
│  Filter: [All actions ▼] [Last 7 days ▼] [Search order]  │
├──────────────────────────────────────────────────────────┤
│  Time (JP)        | Action          | Target         |    │
├──────────────────────────────────────────────────────────┤
│  2026-05-02 14:35 | confirm_payment | BTJ-2026-0123  | 👁│
│  2026-05-02 14:32 | reject_payment  | BTJ-2026-0122  | 👁│
│  2026-05-02 14:28 | force_approve   | BTJ-2026-0121  | 👁│
└──────────────────────────────────────────────────────────┘
```

Click 👁 → modal show `before_state` / `after_state` diff dạng JSON.

**Tính năng:**
- Filter theo action_type, date range, target_id.
- Search box: tìm theo order_no.
- Export CSV (cho audit định kỳ).
- Pagination (50 row/page).

---

## 7. Sample Code — `logAdminAction_()`

### 7.1. Apps Script helper (Phase 1)

```js
/**
 * Ghi nhật ký admin action vào Supabase admin_audit_log.
 *
 * @param {Object} action - Thông tin action
 * @param {string} action.actionType - Một trong các value của CHECK constraint
 * @param {string} action.targetType - 'order' | 'payment_confirmation' | ...
 * @param {string} action.targetId - order_no | confirmation_id | ...
 * @param {Object} [action.beforeState] - Snapshot trước (optional)
 * @param {Object} [action.afterState] - Snapshot sau (optional)
 * @param {Object} [action.details] - { reason, admin_note, ... }
 * @param {string} [action.adminEmail] - Override (mặc định lấy từ Session)
 * @param {string} [action.userAgent] - Từ request header (optional)
 * @returns {Object} { ok: boolean, id?: string, error?: string }
 */
function logAdminAction_(action) {
  try {
    const adminEmail = action.adminEmail || Session.getActiveUser().getEmail();
    if (!adminEmail) {
      Logger.log('logAdminAction_: no admin email, skipped');
      return { ok: false, error: 'no_admin_email' };
    }

    const url = SUPABASE_URL + '/rest/v1/admin_audit_log';
    const payload = {
      admin_email: adminEmail,
      action_type: action.actionType,
      target_type: action.targetType,
      target_id: String(action.targetId),
      before_state: action.beforeState || null,
      after_state: action.afterState || null,
      details: action.details || {},
      user_agent: action.userAgent || null
    };

    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Prefer': 'return=representation'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    if (code >= 200 && code < 300) {
      const data = JSON.parse(resp.getContentText());
      return { ok: true, id: data[0]?.id };
    } else {
      Logger.log('logAdminAction_ failed: ' + code + ' ' + resp.getContentText());
      return { ok: false, error: 'http_' + code };
    }
  } catch (e) {
    // KHÔNG throw — audit log fail không được block business logic
    Logger.log('logAdminAction_ exception: ' + e.message);
    return { ok: false, error: e.message };
  }
}
```

### 7.2. Cách gọi trong handler `confirmPayment_()`

```js
function confirmPayment_(orderNo, adminNote) {
  // 1. Snapshot before
  const beforeOrder = getOrderByNo_(orderNo);  // helper đã có
  const beforeConf = getPaymentConfirmation_(orderNo);

  // 2. Update DB (logic cũ)
  updateOrderStatus_(orderNo, 'confirmed');
  updatePaymentConfirmationAdmin_(orderNo, {
    admin_confirmed_at: new Date().toISOString(),
    admin_confirmer: Session.getActiveUser().getEmail(),
    admin_notes: adminNote
  });

  // 3. Snapshot after
  const afterOrder = getOrderByNo_(orderNo);
  const afterConf = getPaymentConfirmation_(orderNo);

  // 4. Ghi audit log (KHÔNG throw nếu fail)
  logAdminAction_({
    actionType: 'confirm_payment',
    targetType: 'order',
    targetId: orderNo,
    beforeState: {
      order_status: beforeOrder.status,
      admin_confirmed_at: beforeConf?.admin_confirmed_at || null
    },
    afterState: {
      order_status: afterOrder.status,
      admin_confirmed_at: afterConf.admin_confirmed_at
    },
    details: {
      reason: 'admin_manual_confirm',
      admin_note: adminNote || ''
    }
  });

  return { ok: true };
}
```

### 7.3. Pattern cho `rejectPayment_()`

```js
function rejectPayment_(orderNo, rejectReason) {
  const before = getOrderByNo_(orderNo);
  updateOrderStatus_(orderNo, 'cancelled');
  const after = getOrderByNo_(orderNo);

  logAdminAction_({
    actionType: 'reject_payment',
    targetType: 'order',
    targetId: orderNo,
    beforeState: { order_status: before.status, total_amount: before.total_amount },
    afterState: { order_status: after.status, cancelled_at: after.cancelled_at },
    details: {
      reason: rejectReason || 'no_reason_provided',
      ai_match: before.ai_match || null  // tiện debug AI fail rate sau này
    }
  });

  // Send refund/notify khách (logic riêng)
  notifyCustomerRejection_(orderNo, rejectReason);
}
```

### 7.4. Lưu ý quan trọng khi gọi

1. **Snapshot trước UPDATE**: Nếu gọi `logAdminAction_()` SAU khi đã update DB rồi mới query `before_state` → before_state sai bét. **Luôn snapshot trước khi update.**
2. **Đừng để fail của log block business**: Wrap trong try/catch, chỉ Logger.log warning.
3. **Đừng quên đặt `created_at`**: Để DB tự set qua DEFAULT now() → khỏi sai timezone.
4. **target_id luôn là string**: Kể cả là số (vd order_id integer) → cast `String(orderId)`.

---

## 8. Câu hỏi mở — anh xác nhận trước khi code

1. ✅ **Schema OK?** Có thiếu cột nào em chưa nghĩ tới không (vd: `session_id` để gom nhiều action cùng 1 session)?
2. ✅ **Action types đủ chưa?** Anh review danh sách 18 action — có action nào missing?
3. ✅ **Retention 7 năm OK?** Hay anh muốn 10 năm (theo 商法 strict)?
4. ⚠️ **Multi-admin?** Hiện chỉ có email `thanghoang1109@gmail.com`. Tương lai có thêm em gái/partner thì cần sửa policy RLS — anh cho em biết khi có người mới.
5. ⚠️ **Phase 3 timing?** Tab UI Audit log ưu tiên cao hay thấp? Em đề xuất làm sau khi Phase 1 + Phase 2 ổn định ~2 tuần.
6. ❓ **IP address?** Apps Script không có cách lấy IP client. Nếu muốn track IP, cần thêm 1 endpoint Edge Function hoặc proxy qua Supabase trực tiếp từ browser. Anh có cần không?

---

## 9. Risk & Mitigation

| Risk | Mức độ | Mitigation |
|---|---|---|
| Audit log table phình to → chậm query | Thấp (7 năm = 250MB) | Index đầy đủ, monthly VACUUM. Sau 5 năm xét partition theo year. |
| Service_role key lộ → ai cũng insert fake log | Cao | Key chỉ ở Apps Script (server-side). Không bao giờ đưa vào client browser. |
| Anh nhỡ xoá log thật bằng SQL admin | Trung bình | RLS policy + REVOKE DELETE. Anh muốn xoá phải dùng service_role + ý thức rằng đang phá audit. |
| GDPR khách EU yêu cầu xoá | Thấp (Bếp Thuỷ ship JP only) | Document policy redact-not-delete. |
| Helper `logAdminAction_` fail → mất log nhưng business OK | Trung bình | Đã wrap try/catch + Logger.log. Tương lai add retry queue. |
| Migration FAIL ở Supabase production | Thấp | Test ở DB staging trước. Rollback bằng `DROP TABLE admin_audit_log;` |

---

## 10. Tổng kết — anh đọc cái này nếu chỉ có 30 giây

- **Bảng mới:** `admin_audit_log` — lưu mọi click admin (confirm, reject, edit, ...).
- **Immutable:** RLS chỉ cho INSERT + SELECT, REVOKE UPDATE/DELETE → không sửa được, không xoá được.
- **Retention:** 7 năm theo luật thuế Nhật.
- **Phase 1:** Log 4 action confirm/reject quan trọng nhất — Agent 4 sẽ làm migration + em gắn `logAdminAction_()` vào handler.
- **Phase 2:** Mở rộng cho 14 action còn lại.
- **Phase 3:** Tab UI để anh tự browse log mà không cần SQL.
- **Sample code:** Section 7 đã có template `logAdminAction_()` cho Apps Script — copy/paste khi implement.
- **Câu hỏi cần anh trả lời:** Section 8 — chốt scope trước khi code.

---

**Hết spec.** Anh duyệt rồi em báo Agent 4 chạy migration nhé.
