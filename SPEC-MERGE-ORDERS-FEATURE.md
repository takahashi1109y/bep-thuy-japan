# SPEC — Feature "Thêm hàng vào đơn cũ" (Merge Orders)

**Date**: 2026-05-08
**Author**: Em (Claude) + anh Thắng
**Goal**: Khách đã trả 1 đơn → muốn đặt thêm gộp ship → KHÔNG mất phí ship 2 lần.

---

## 🎯 User Story

```
Khách đặt đơn #123 (¥3,000 + ship ¥800 = ¥3,800) → trả PayPay
→ 30 phút sau muốn thêm 2 món (¥1,500)
→ Vào dashboard /thanh-vien → đơn #123 (status=customer_paid) → bấm "➕ Thêm hàng"
→ Redirect / với banner "Đang thêm vào #123, ship miễn"
→ Chọn 2 món, checkout: ship_fee=0, total=¥1,500
→ Trả PayPay ¥1,500 → đơn #124 tạo, parent=#123
→ Admin thấy: "#123 (gộp #124) — total ¥4,500, ship 1 lần"
→ Yamato sheet: 1 row chứa items 2 đơn → ship 1 Yamato code
```

---

## 📦 Database Schema Changes

### Add 2 cột vào `public.orders`:

```sql
parent_order_no  text REFERENCES public.orders(order_no) ON DELETE SET NULL
is_merged        boolean NOT NULL DEFAULT false
```

**Semantics**:
- `parent_order_no = NULL` → đơn gốc (top-level)
- `parent_order_no = '123'` → đơn này merge vào #123 (đơn con)
- `is_merged = true` → đơn này LÀ đơn con (gộp ship với parent). Ship_fee = 0.
- `is_merged = false` → đơn gốc bình thường

**Index**: `CREATE INDEX idx_orders_parent ON orders(parent_order_no) WHERE parent_order_no IS NOT NULL`

### Validation rules (enforce ở RPC, KHÔNG CHECK constraint phức tạp):

1. Parent status PHẢI ∈ `{pending, customer_paid, pending_manual_review, confirmed}` (chưa shipped/delivered/cancelled)
2. Parent.user_id == NEW.user_id (cùng khách)
3. Parent.is_merged == false (parent KHÔNG được là đơn con — chỉ chuỗi 1 cấp)
4. Parent.created_at > now() - 48h (giới hạn 48 giờ)
5. NEW.shipping_address == Parent.shipping_address (cùng địa chỉ)
6. NEW.ship_fee = 0 (always — server-side enforce, không trust client)
7. NEW.is_merged = true (auto-set)
8. NEW.parent_order_no = parent_order_no input

### Cancellation handling:

Nếu parent bị cancel:
- ON DELETE SET NULL → child.parent_order_no = NULL, nhưng `is_merged` vẫn = true (data integrity)
- Trigger sau cancel: ALERT admin để decide:
  - Option 1: Cancel luôn child
  - Option 2: Convert child thành đơn standalone (re-charge ship_fee qua admin manual)

→ Phase 1 implement: chỉ ON DELETE SET NULL. Admin handle case này manual.

---

## 🔌 RPC Definition (Supabase)

### Function: `add_to_existing_order(p_parent text, p_items jsonb, p_total int)` returns jsonb

**Params**:
- `p_parent`: order_no đơn cha (text)
- `p_items`: items mới của đơn con (JSON array, format giống cart)
- `p_total`: tổng tiền items (KHÔNG include ship — luôn 0)

**Return jsonb**:
- Success: `{ ok: true, order_no: '124', amount: 1500 }`
- Errors:
  - `not_authenticated`: chưa login
  - `parent_not_found`: parent không tồn tại
  - `not_your_order`: parent không phải của user này
  - `parent_already_merged`: parent đã là đơn con (chuỗi nhiều cấp không cho)
  - `parent_shipped`: parent status đã shipped/delivered
  - `parent_cancelled`: parent status đã cancelled
  - `parent_too_old`: parent tạo > 48h trước

**SECURITY DEFINER**, GRANT EXECUTE TO authenticated.

---

## 🔌 Apps Script Backend

### Helper function: `addToExistingOrder_(parentOrderNo, newItems, userId)` (Apps Script side)

Wrap RPC call → save Yamato sheet (gộp items vào row của parent) → email update khách.

### doPost handler action: `add_to_existing_order`

```javascript
{
  action: 'add_to_existing_order',
  parent_order_no: '123',
  items: [...],
  amount: 1500,
  payment_method: 'paypay',
  // ... other fields giống regular order
}
```

Response:
```javascript
{ status: 'success', order_no: '124', merged_with: '123' }
{ status: 'error', error: '<error_code>' }
```

---

## 🎨 Frontend — Customer dashboard (`thanh-vien.html`)

### Change 1: Order card (tab "Đơn hàng")

Thêm button **"➕ Thêm hàng vào đơn này"** ở mỗi order card có:
- `status ∈ {pending, customer_paid, pending_manual_review, confirmed}` (chưa ship)
- `is_merged = false` (đơn gốc)
- `created_at > now() - 48h`

Click button:
1. `sessionStorage.setItem('merge_parent_order', orderNo)`
2. Plus save: `'merge_parent_address'`, `'merge_parent_district'`, etc. để autofill checkout
3. `window.location.href = '/?merge=' + orderNo`

### Change 2: KHÔNG đụng init/login flow

---

## 🎨 Frontend — Customer checkout (`index.html`)

### Change 1: Detect merge mode trên page load

```javascript
const urlParams = new URLSearchParams(window.location.search);
const mergeParent = urlParams.get('merge');
const mergeMode = !!mergeParent;
```

Nếu `mergeMode === true`:
1. Verify `sessionStorage.getItem('merge_parent_order') === mergeParent` (bảo mật)
2. Load địa chỉ ship từ sessionStorage → autofill (read-only)
3. Hiển thị **banner vàng** đầu trang: `"📦 Đang thêm vào đơn #123. Phí ship MIỄN. Địa chỉ giao đã có sẵn."`
4. Set `ship_fee = 0` cho mọi tính toán
5. Disable input ship address (read-only)

### Change 2: Submit order với action mới

Thay vì `submit_order` thường, gửi:
```javascript
{
  action: 'add_to_existing_order',
  parent_order_no: mergeParent,
  ...
}
```

### Change 3: KHÔNG block guest

Vì merge mode chỉ accessible từ dashboard (đã login). Plus check session.

---

## 🎨 Frontend — Admin dashboard (`thuythang.html`)

### Change 1: Display merge tree

Trong list orders, đơn con hiện thụt vào:

```
📦 #123 · ¥3,000 + ship ¥800 · paid · Nguyễn Anh · 千葉県
   └─ 🔗 #124 · ¥1,500 (gộp ship) · paid · same address
   └─ 🔗 #125 · ¥800 (gộp ship) · paid · same address
   Tổng package: ¥5,300 · 1 Yamato
```

### Change 2: Yamato sheet logic

Khi anh click "Tạo Yamato" cho đơn #123 → hệ thống fetch tất cả đơn con (parent_order_no=123) → gộp items vào 1 row Yamato.

**Cell "items"** in Yamato row: liệt kê items đơn cha + items đơn con (số lượng tổng).

---

## 🚨 Error Messages (Vietnamese, customer-friendly)

| Error code | Tiếng Việt |
|---|---|
| `parent_not_found` | "Không tìm thấy đơn gốc. Vui lòng quay lại dashboard." |
| `not_your_order` | "Đơn này không thuộc về tài khoản của anh/chị." |
| `parent_already_merged` | "Đơn gốc đã từng được gộp với đơn khác. Không thể gộp tiếp." |
| `parent_shipped` | "Đơn gốc đã được gửi đi. Không thể thêm hàng nữa. Vui lòng đặt đơn mới." |
| `parent_cancelled` | "Đơn gốc đã hủy. Không thể thêm hàng." |
| `parent_too_old` | "Đơn gốc tạo quá 48 giờ. Để tránh trễ ship cho khách khác, vui lòng đặt đơn mới." |

---

## 📝 Files Map (anti-conflict)

| File | Owner agent | Phase |
|---|---|---|
| `supabase-merge-orders.sql` (NEW) | A | 1 (DB) |
| `google-apps-script.js` | B | 2 (Backend) |
| `thanh-vien.html` (orders tab section) | C | 3a (Customer dashboard) |
| `index.html` (checkout flow) | D | 3b (Customer checkout) |
| `thuythang.html` (admin orders) + Yamato logic in `google-apps-script.js` | E | 3c (Admin) |
| `TEST-PLAN-MERGE-ORDERS.md` (NEW) | F | 4 (Test) |

⚠️ **CONFLICT NOTE**: Agent B (backend) and Agent E (admin Yamato) đều edit `google-apps-script.js`. → Agent B làm trước (function `addToExistingOrder_` + handler), Agent E sau khi B done thêm Yamato gộp logic.

→ Em sẽ spawn B+E sequentially nếu xung đột; A+C+D+F parallel.

---

## 🔄 Phase Order

1. **Phase 1** (A): DB migration — anh chạy SQL
2. **Phase 2** (B): Apps Script backend — anh paste lên Apps Script + redeploy
3. **Phase 3** (C, D parallel): Frontend customer
4. **Phase 4** (E): Admin + Yamato logic — sau B
5. **Phase 5** (F): Test plan + verification

Total: ~7 hours work.

---

## 🧪 Test Scenarios (cho Phase 5)

1. ✅ Happy path: tạo đơn 1 → trả → thêm đơn 2 → admin thấy linked → Yamato gộp
2. ❌ Block: parent đã shipped → button không hiện
3. ❌ Block: parent > 48h → button không hiện
4. ❌ Block: parent_order_no fake (URL manipulation) → RPC reject not_your_order
5. ❌ Block: address khác → frontend force read-only, server verify
6. 🔁 Multi-merge prevention: đơn 2 (đã merge vào 1) muốn thêm đơn 3 → block parent_already_merged
7. 💀 Edge: parent cancel sau khi child merge → child.parent_order_no=NULL, admin alert
