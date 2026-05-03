# 🚨 BƯỚC 2: Chạy SQL `supabase-2-step-verify.sql` (3 phút)

> 🎯 **Mục đích**: Tạo state machine cho 2-step verify (status `pending_manual_review`), 4 columns mới + bảng audit log + 2 RPC functions để admin confirm/reject thanh toán thủ công.
> ⏱️ **Thời gian**: ~3 phút
> 📝 **File SQL**: `K:\bep-thuy-japan\supabase-2-step-verify.sql` (396 dòng, idempotent — chạy lại không sao)

---

## 🤔 Tại sao cần SQL này?

- Khi AI verify FAIL nhưng anh muốn approve thủ công → cần status `pending_manual_review`
- Cần audit log mọi quyết định của admin (truy vết nếu khách khiếu nại sau này)
- Không có SQL này → trong /thuythang, nút **"✅ Xác nhận lần 2"** và **"❌ Reject"** sẽ báo lỗi `function admin_confirm_payment does not exist`

---

## ✅ Trước khi bắt đầu

- [ ] BƯỚC 1 (Storage bucket public) đã xong? *(Khuyến nghị xong trước, nhưng không bắt buộc)*
- [ ] Đã login Supabase dashboard
- [ ] File `K:\bep-thuy-japan\supabase-2-step-verify.sql` tồn tại trên máy

---

## 🔵 Bước 2.1 — Mở Supabase Dashboard

1. Mở browser → vào **https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr**
2. Nếu chưa login → login bằng email anh

**Anh sẽ thấy**: trang dashboard project Bếp Thuỷ.

---

## 🔵 Bước 2.2 — Mở SQL Editor

1. Sidebar trái → tìm icon **`</>` SQL Editor** (icon hình thẻ code)
2. Click vào

**Anh sẽ thấy**: trang SQL Editor với list query cũ (nếu có) bên trái + ô soạn query lớn ở giữa.

---

## 🔵 Bước 2.3 — Tạo query mới

1. Góc trên trái có nút **"+ New query"** (màu xanh hoặc xám)
2. Click

**Anh sẽ thấy**: ô soạn query trống mới, có nút **RUN** (góc dưới phải).

---

## 🔵 Bước 2.4 — Mở file SQL trên máy

1. Mở **File Explorer** (Windows + E)
2. Vào folder: `K:\bep-thuy-japan\`
3. Tìm file **`supabase-2-step-verify.sql`**
4. Click chuột phải → **Open with** → **Notepad** (hoặc VS Code nếu có)

**Anh sẽ thấy**: file mở ra với 396 dòng SQL bắt đầu bằng comment `-- Migration: 2-step verify...`

---

## 🔵 Bước 2.5 — Copy toàn bộ nội dung

1. Click vào ô soạn của Notepad
2. **Ctrl+A** → highlight toàn bộ (text chuyển xanh)
3. **Ctrl+C** → copy

---

## 🔵 Bước 2.6 — Paste vào SQL Editor

1. Quay lại browser tab Supabase (Alt+Tab)
2. Click vào ô soạn query trống
3. **Ctrl+V** → paste

**Anh sẽ thấy**: 396 dòng SQL hiện ra trong editor, scroll xuống thấy `CREATE TABLE`, `ALTER TABLE`, `CREATE FUNCTION`, `CREATE POLICY`...

---

## 🔵 Bước 2.7 — RUN query

1. Góc dưới phải → click nút **"RUN"** (màu xanh) hoặc bấm **Ctrl+Enter**
2. Đợi **2-5 giây**

**Anh sẽ thấy**: kết quả ở panel dưới — *"Success. No rows returned"* hoặc list các statement đã chạy.

> ⚠️ Nếu thấy đỏ + thông báo error → đừng panic, scroll xuống xem lỗi gì → check phần 🆘 Troubleshooting cuối file.

---

## ✅ Bước 2.8 — Verify thành công

Click **+ New query** → paste 3 query này → **RUN**:

```sql
-- 1) Check 4 columns mới đã thêm vào payment_confirmations
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'payment_confirmations' 
AND column_name IN ('admin_confirmed_at', 'admin_confirmer', 'admin_notes', 'admin_action');
-- Phải thấy 4 dòng

-- 2) Check bảng audit log đã tạo
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'admin_audit_log';
-- Phải thấy 1 dòng

-- 3) Check 2 RPC đã tạo
SELECT proname FROM pg_proc 
WHERE proname IN ('admin_confirm_payment', 'admin_reject_payment');
-- Phải thấy 2 dòng
```

**Expected**: cả 3 query đều có kết quả không rỗng. Nếu rỗng → SQL chưa chạy thành công.

---

## 🎁 Bonus: 3 thứ SQL này tạo ra

### 1. **4 cột mới trên `payment_confirmations`**
| Cột | Type | Ý nghĩa |
|---|---|---|
| `admin_confirmed_at` | timestamptz | Lúc admin xác nhận |
| `admin_confirmer` | text | Email admin nào xác nhận |
| `admin_notes` | text | Ghi chú admin viết |
| `admin_action` | text CHECK | NULL / 'confirmed' / 'rejected' / 'pending' |

### 2. **Bảng `admin_audit_log`** (immutable audit trail)
- RLS: super_admin thấy tất cả, regular admin chỉ thấy rows của mình
- Không ai UPDATE/DELETE được qua PostgREST API → chống admin xoá log
- Insert chỉ qua SECURITY DEFINER RPC → kiểm soát chặt

### 3. **2 RPC SECURITY DEFINER**
- `admin_confirm_payment(p_confirmation_id bigint, p_notes text)` → chuyển order sang `confirmed`
- `admin_reject_payment(p_confirmation_id bigint, p_reason text)` → chuyển sang `cancelled` + ghi `cancel_reason` vào bảng `orders`
- Cả 2 đều ghi audit log sau mỗi hành động

---

## 🆘 Troubleshooting

| Lỗi anh thấy | Nguyên nhân | Fix |
|---|---|---|
| `relation "payment_confirmations" does not exist` | Migration cũ chưa chạy | Chạy `supabase-payment-proof.sql` trước |
| `relation "admin_audit_log" already exists` | Đã chạy trước đó rồi | OK, bỏ qua. SQL idempotent — chạy lại không hỏng |
| `function admin_confirm_payment(bigint, text) already exists` | Đã chạy rồi | OK, file có `CREATE OR REPLACE` nên không sao |
| `permission denied for schema public` | Login sai project | Check URL có đúng `curcsvwvjkjewtonkhnr` không |
| `syntax error at or near ...` | Paste thiếu ký tự | Mở lại file SQL → Ctrl+A → Ctrl+C → paste lại |
| Modal hiện "RUN" mãi không xong | Query lớn, đợi tới 30s | Đợi tiếp, không double-click RUN |

---

## ⏭️ Sau khi xong BƯỚC 2

→ Sang **BƯỚC 3**: chạy `supabase-manual-approve-payment.sql`  
→ Xem hướng dẫn: `HUONG-DAN-BUOC-3-SQL-MANUAL.md`

Hoặc báo em **"xong bước 2"** → em surface bước tiếp theo.

---

📌 **Note an toàn**: SQL này là **idempotent** — anh chạy lại 5 lần cũng không sao. Yên tâm test.
