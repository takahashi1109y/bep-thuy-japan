# 🚨 BƯỚC 1: Fix Storage bucket `payment-proofs` (1 phút)

> 🎯 **Mục đích**: Bật Public cho bucket `payment-proofs` để admin xem được ảnh biên lai trong /thuythang dashboard.
> ⏱️ **Thời gian**: ~1 phút
> 🔥 **Mức độ**: BLOCKING — phải xong cái này trước thì các BƯỚC sau mới có nghĩa

---

## 🤔 Tại sao cần làm?

Hiện tại bucket `payment-proofs` đang **private** (không public). Khi admin (anh) vào /thuythang xem đơn hàng:
- Browser fetch ảnh biên lai bằng `<img src="...">` thẳng
- `<img>` tag **không gửi JWT token** của Supabase đi kèm
- Bucket private → Supabase trả **403 Unauthorized** → ảnh hiện icon vỡ

Bật Public xong → ảnh load được ngay.

> 🛡️ **An tâm bảo mật**:
> - URL ảnh có random hash dài (timestamp + 8-char SHA), không đoán được
> - Bucket `product-images` (ảnh sản phẩm) cũng đang public — cùng pattern
> - Receipt khách upload → admin được xem là chuyện bình thường
> - Table-level RLS vẫn gate ai xem được URL trong DB

---

## ✅ Trước khi bắt đầu

- [ ] Có laptop + browser (Chrome/Edge/Firefox)
- [ ] Đã có account Supabase (email + password)
- [ ] Biết URL project: `curcsvwvjkjewtonkhnr`

---

## 🔵 CÁCH 1 — Toggle qua Dashboard UI (NHANH NHẤT)

### Bước 1.1 — Mở Supabase Dashboard

1. Mở browser
2. Vào URL: **https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr**
3. Login email/password nếu chưa login

**Anh sẽ thấy**: trang dashboard project Bếp Thuỷ — sidebar trái có nhiều icon (Home, Table Editor, SQL Editor, Database, Storage, Authentication...)

---

### Bước 1.2 — Vào Storage

1. Sidebar trái → tìm icon **📦 Storage** (icon hình thùng/kho)
2. Click

**Anh sẽ thấy**: list các buckets — có ít nhất 2 cái:
- `payment-proofs` ← cái em cần sửa
- `product-images` ← cái public sẵn (để tham khảo)

---

### Bước 1.3 — Mở settings của bucket `payment-proofs`

**Có 2 sub-cách (tuỳ UI Supabase version):**

#### 🅰️ Sub-cách A — UI mới (phổ biến 2026)
1. Tìm row `payment-proofs` trong list
2. Cuối row có dấu **3 chấm "⋯"** hoặc icon ⚙️
3. Click → menu hiện ra
4. Chọn **"Edit bucket"**

#### 🅱️ Sub-cách B — UI cũ
1. Click thẳng vào tên `payment-proofs` (chữ xanh)
2. Trong trang bucket → góc trên phải có nút **"Configuration"** hoặc icon ⚙️ Settings
3. Click

**Anh sẽ thấy**: modal/panel "Edit bucket" với các field:
- Name: `payment-proofs`
- **Public bucket**: toggle switch (đang **OFF** màu xám)
- File size limit: `10485760` (10MB)
- Allowed MIME types: image/jpeg, image/png...

---

### Bước 1.4 — Bật Public

1. Tìm dòng **"Public bucket"**
2. Click toggle switch
3. Toggle chuyển từ **OFF (xám)** → **ON (xanh)**
4. Có thể hiện popup cảnh báo: *"Are you sure? Public buckets are accessible by anyone with the URL..."*
5. Click **Confirm** / **Make public** / **OK**

**Anh sẽ thấy**: toggle xanh, có badge **"Public"** xuất hiện cạnh tên bucket.

---

### Bước 1.5 — Save

1. Cuối modal có nút **"Save"** hoặc **"Save changes"** (màu xanh)
2. Click

**Anh sẽ thấy**: thông báo thành công ở góc trên (toast notification): *"Bucket updated successfully"* hoặc tương tự. Modal đóng lại.

---

## 🔵 CÁCH 2 — SQL Fallback (nếu Cách 1 không tìm thấy nút)

Nếu UI Supabase không có toggle Public, hoặc anh thích chạy SQL cho nhanh:

### Bước 2.1 — Mở SQL Editor
Sidebar trái → click **`</>` SQL Editor** → click **+ New query**

### Bước 2.2 — Paste SQL này

**Trường hợp 1**: Bucket đã tồn tại, chỉ cần đổi public
```sql
UPDATE storage.buckets SET public = true WHERE id = 'payment-proofs';
```

**Trường hợp 2**: Không chắc bucket đã tồn tại chưa → dùng INSERT...ON CONFLICT (an toàn 100%)
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', true, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE SET public = true;
```

### Bước 2.3 — RUN
Click nút **RUN** (góc dưới phải) hoặc bấm **Ctrl+Enter**

**Anh sẽ thấy**: *"Success. No rows returned"* hoặc *"UPDATE 1"*.

---

## ✅ Verify (kiểm tra đã thành công)

### Cách 1 — Nhanh (qua UI)
Quay lại tab Storage → row `payment-proofs` có chữ **"Public"** màu xanh cạnh tên ✅

### Cách 2 — Chắc chắn 100% (qua SQL)
SQL Editor → New query → paste:
```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'payment-proofs';
```
RUN → kết quả: cột `public` phải là `true` ✅

### Cách 3 — Test thực tế trên /thuythang
1. Vào https://www.thuyjapan.com/thuythang
2. Login admin
3. Tab Đơn Hàng → click 1 đơn có biên lai
4. **Anh sẽ thấy**: ảnh biên lai hiển thị bình thường, không phải icon vỡ

> ⚠️ Nếu ảnh CŨ vẫn không hiện sau khi public → đó là đơn cũ trước khi em fix code (column rename + signed URL). Đơn MỚI sẽ ok ngay.

---

## 🆘 Troubleshooting

| Vấn đề | Fix |
|---|---|
| **Không tìm thấy bucket `payment-proofs`** | Có thể chưa tạo. Click **"+ New bucket"** → name: `payment-proofs`, Public: ON, file size: 10MB → Create |
| **Không thấy toggle "Public bucket"** | Dùng CÁCH 2 (SQL) |
| **Click Save báo lỗi** | Refresh trang (F5), login lại, thử lại |
| **Đã public mà /thuythang vẫn không hiện ảnh** | Ctrl+Shift+R hard refresh browser. Nếu vẫn không → ảnh đó từ đơn CŨ trước khi em fix code, đơn mới sẽ ok |
| **Lo ngại bảo mật về public bucket** | URL có random hash dài, người ngoài không đoán được. Bucket `product-images` cũng public. Receipt không phải data siêu nhạy cảm. |
| **Quên password Supabase** | Click "Forgot password" trên trang login |

---

## ⏭️ Sau khi xong BƯỚC 1

→ Sang **BƯỚC 2**: chạy SQL `supabase-2-step-verify.sql`
→ Xem hướng dẫn: `HUONG-DAN-BUOC-2-SQL-2STEP.md`

Hoặc báo em **"xong bước 1"** → em surface bước tiếp theo trong chat.

---

📌 **Update sau khi xong**: anh nhớ tích vào `pending_thuyjapan_action_items.md` (file todo của anh) hoặc báo em để em update giùm.
