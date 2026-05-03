# 🚨 BƯỚC 3: Chạy SQL `supabase-manual-approve-payment.sql` (3 phút)

> 🎯 **Mục đích**: Thêm 3 cột mới vào bảng `payment_confirmations` để track admin override (ai duyệt, lý do, lúc nào) + 1 index tăng tốc dashboard.
> ⏱️ **Thời gian**: ~3 phút
> 📝 **File SQL**: `K:\bep-thuy-japan\supabase-manual-approve-payment.sql` (~26 dòng, ngắn)

---

## 🤔 Tại sao cần SQL này?

Trong /thuythang, khi anh bấm nút **"Force approve"** (override AI verify) trên đơn `pending_manual_review`:
- Code sẽ ghi vào 3 cột: `manual_approver`, `manual_approve_reason`, `manual_approved_at`
- Nếu 3 cột chưa có → bấm nút sẽ **lỗi** ngay
- Audit trail: sau này khách khiếu nại "ai duyệt đơn lậu này?" → query DB lấy email admin + lý do

| Cột | Lưu gì |
|---|---|
| `manual_approver` | Email admin nào duyệt đơn |
| `manual_approve_reason` | Lý do override AI (anh chọn từ template hoặc gõ tay) |
| `manual_approved_at` | Timestamp chính xác lúc bấm duyệt |

---

## ✅ Trước khi bắt đầu

- [ ] BƯỚC 1 (Storage bucket public) đã xong? *(Khuyến nghị nhưng không bắt buộc)*
- [ ] BƯỚC 2 (SQL 2-step verify) đã xong? **BẮT BUỘC** — manual approve depends on `pending_manual_review` status
- [ ] Đã login Supabase dashboard
- [ ] File `K:\bep-thuy-japan\supabase-manual-approve-payment.sql` tồn tại

---

## 🔵 Bước 3.1 — Mở Supabase Dashboard

URL: **https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr**

---

## 🔵 Bước 3.2 — Vào SQL Editor

Sidebar trái → click icon **`</>` SQL Editor**

---

## 🔵 Bước 3.3 — Tạo query mới

Click **+ New query** (góc trên trái)

---

## 🔵 Bước 3.4 — Mở file SQL trên máy

1. File Explorer → vào `K:\bep-thuy-japan\`
2. Tìm **`supabase-manual-approve-payment.sql`**
3. Click chuột phải → Open with → **Notepad**

**Anh sẽ thấy**: file ngắn ~26 dòng, bắt đầu bằng comment `-- Manual approve override columns...`

---

## 🔵 Bước 3.5 — Copy

Notepad → **Ctrl+A** → **Ctrl+C**

---

## 🔵 Bước 3.6 — Paste vào SQL Editor

Browser tab Supabase → click ô soạn query → **Ctrl+V**

---

## 🔵 Bước 3.7 — RUN

Click nút **RUN** (góc dưới phải) hoặc **Ctrl+Enter** → đợi 2-5 giây.

**Anh sẽ thấy**: bảng kết quả hiển thị 3 dòng:
```
manual_approver         | text
manual_approve_reason   | text
manual_approved_at      | timestamp with time zone
```

(File SQL có sẵn câu SELECT verify cuối, tự hiển thị kết quả ngay sau khi chạy.)

---

## ✅ Verify thủ công (tuỳ chọn)

Click **+ New query** → paste 2 query này → RUN:

```sql
-- 1) Check 3 cột mới
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'payment_confirmations'
  AND column_name LIKE 'manual_%';
-- Phải thấy 3 dòng

-- 2) Check index đã tạo
SELECT indexname FROM pg_indexes
WHERE tablename = 'payment_confirmations'
  AND indexname = 'idx_payment_conf_manual_approve';
-- Phải thấy 1 dòng
```

---

## 🆘 Troubleshooting

| Lỗi | Fix |
|---|---|
| `column "manual_approver" already exists` | Đã chạy rồi, bỏ qua. SQL safe to re-run |
| `relation "payment_confirmations" does not exist` | BƯỚC 2 chưa chạy → quay lại BƯỚC 2 trước |
| `permission denied for schema public` | Login sai project → check URL có `curcsvwvjkjewtonkhnr` không |
| `syntax error` | Copy lại từ đầu, không gõ tay |
| Lỗi khác | Chụp màn hình gửi em |

---

## ⏭️ Sau khi xong BƯỚC 3

→ Sang **BƯỚC 4**: Redeploy Apps Script (anh đã có hướng dẫn 14 bước trong chat trước)
→ Sau đó **BƯỚC 5 (Test E2E)**: xem `HUONG-DAN-BUOC-4-TEST-E2E.md` *(em đang viết — agent cuối sẽ xong trong vài phút)*

Hoặc báo em **"xong bước 3"** → em surface bước tiếp theo.

---

📌 **Note**: SQL này NGẮN (~26 dòng), idempotent, **KHÔNG** tạo bảng `payment_verify_audit` hay RPC `admin_force_approve_payment` (logic audit dùng bảng `admin_audit_log` từ BƯỚC 2). Đây là correction so với spec ban đầu.
