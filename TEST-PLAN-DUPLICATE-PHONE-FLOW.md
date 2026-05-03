# Test Plan — Duplicate Phone Resolve + Mandatory Update Flow

> **Phone test chính**: `09042376886` (số của anh — 9 accounts trùng)
> **Thời gian dự kiến**: 30–40 phút
> **Người chạy**: anh Thắng (non-dev — em viết click-by-click)
> **Ngày**: 2026-05-03

---

## Mục lục

1. [Pre-test SQL (BẮT BUỘC)](#pre-test-sql-bắt-buộc)
2. [Frontend Flow Test (10 cases)](#frontend-flow-test-10-cases)
3. [SQL Verify Test](#sql-verify-test)
4. [Action map nếu FAIL](#action-map-nếu-fail)
5. [PASS hết → next steps](#pass-hết--next-steps)

---

## Pre-test SQL (BẮT BUỘC)

> Chạy đúng thứ tự. Nếu Step nào FAIL thì DỪNG, báo em ngay — không chạy tiếp.

### Step 1 — Run resolve-duplicates SQL

**Mục đích**: Backup 18 account trùng + clear `phone = NULL` → để index UNIQUE chạy được.

1. Mở **Supabase Dashboard** → menu trái chọn **SQL Editor** → bấm **+ New query**
2. Mở file `K:\bep-thuy-japan\supabase-phone-resolve-duplicates.sql` trong VS Code
3. Copy-paste **BLOCK 1** (CREATE backup table) → bấm **RUN** (hoặc Ctrl+Enter)
   - **Expect kết quả**: 1 row trả về với cột `so_account_da_backup = 18`
   - Nếu khác 18 → DỪNG, screenshot báo em
4. Copy-paste **BLOCK 2** (UPDATE phone = NULL cho 18 accounts) → bấm **RUN**
   - **Expect kết quả**: notice `UPDATE 18` ở tab Results
   - Nếu khác 18 → DỪNG, báo em
5. Copy-paste **BLOCK 3** (verify không còn duplicate) → bấm **RUN**
   - **Expect kết quả**: **0 rows** (table trống)
   - Nếu còn rows → DỪNG, screenshot báo em
6. Copy-paste **BLOCK 4** (export 18 accounts đã clear) → bấm **RUN**
   - **Expect kết quả**: 18 rows hiện ra với cột `email`, `phone_da_xoa`, `full_name`...
   - Bấm icon **Download CSV** ở góc phải bảng → lưu file `accounts_da_clear_phone.csv`
   - File này dùng để liên hệ KH sau (mục PASS hết)

---

### Step 2 — Quay lại migration V1 (Step 3-5)

**Mục đích**: Tạo UNIQUE INDEX + trigger + RPC v1 — giờ không còn duplicate, sẽ tạo OK.

1. Mở file `K:\bep-thuy-japan\supabase-phone-login.sql` trong VS Code
2. Trong Supabase SQL Editor, mở **+ New query** mới
3. Copy-paste **Step 3** (CREATE UNIQUE INDEX `profiles_phone_unique`) → bấm **RUN**
   - **Expect**: `Success. No rows returned`
   - Nếu lỗi `duplicate key value violates unique constraint` → DỪNG, báo em (chứng tỏ Block 2 chưa clear sạch)
4. Copy-paste **Step 4** (trigger `validate_phone_format`) → bấm **RUN**
   - **Expect**: `Success. No rows returned`
5. Copy-paste **Step 5** (RPC `update_user_phone` v1 — bản cũ) → bấm **RUN**
   - **Expect**: `Success. No rows returned`

---

### Step 3 — Run V2 enhance

**Mục đích**: Nâng RPC + trigger lên v2 (12 test cases pass nội bộ trong SQL).

1. Mở file `K:\bep-thuy-japan\supabase-phone-login-v2.sql`
2. Trong SQL Editor mở query mới
3. Copy-paste **Block 1** (drop + recreate trigger v2) → **RUN** → Success
4. Copy-paste **Block 2** (drop + recreate RPC v2) → **RUN** → Success
5. Copy-paste **Block 3** (test cases — 12 cases) → **RUN**
   - **Expect**: 12 rows, cột `result` toàn bộ là `PASS`
   - Nếu có `FAIL` → screenshot báo em
6. Copy-paste **Block 4** (verify index) → **RUN** → 1 row `profiles_phone_unique`
7. Copy-paste **Block 5** (verify RPC exists) → **RUN** → 1 row `update_user_phone`

---

### Step 4 — Run RPC update_user_phone (mới — bản full validation)

**Mục đích**: Cài RPC mà frontend modal sẽ gọi.

1. Mở file `K:\bep-thuy-japan\supabase-update-user-phone-rpc.sql`
2. Trong SQL Editor mở query mới
3. Copy-paste **Block 1** (DROP function cũ nếu có) → **RUN** → Success
4. Copy-paste **Block 2** (CREATE OR REPLACE function update_user_phone) → **RUN** → Success
5. Copy-paste **Block 3** (GRANT permission cho authenticated role) → **RUN** → Success
6. **Block 4 test cases**: KHÔNG chạy ở đây — sẽ test qua frontend modal ở mục dưới (hoặc set jwt claim manual nếu anh muốn)

---

## Frontend Flow Test (10 cases)

> Mở web app `https://thuyjapan.com` (hoặc local dev nếu test staging)
> Mỗi TC bắt đầu bằng **logout sạch** rồi đăng nhập lại theo setup

### TC1 — KH bị clear phone đăng nhập → modal prompt hiện

**Setup**: Chọn 1 trong 18 account đã bị clear phone (lấy email từ CSV `accounts_da_clear_phone.csv` — VD: `ly@example.com`)

**Steps**:
1. Mở `https://thuyjapan.com` trong tab incognito (Ctrl+Shift+N) để tránh cache
2. Bấm **Đăng nhập**
3. Nhập email + password của KH `Ly` → bấm **Đăng nhập**

**Expect**:
- Dashboard load thành công
- Sau khoảng 200ms (gần như tức thì) → **Modal "Cập nhật số điện thoại" tự động mở**
- Modal có dòng giải thích reason: *"Số điện thoại của anh/chị đã bị xoá khỏi hệ thống do trùng với tài khoản khác..."*
- Ô input phone tự động **focus** (con trỏ nhấp nháy sẵn trong ô)

**Nếu KHÔNG hiện modal**: TC1 FAIL → báo em (modal không trigger)

---

### TC2 — Submit phone đúng → success

**Steps** (tiếp từ TC1):
1. Trong ô input phone của modal, gõ: `09099998888`
2. Bấm nút **Lưu**

**Expect**:
- Modal **đóng**
- Hiện alert/toast: **"✅ Cập nhật SĐT thành công"**
- F5 reload page → **modal KHÔNG còn hiện nữa** (đã có phone hợp lệ)
- Vào Supabase → Table `profiles` → tìm row email Ly → cột `phone` = `09099998888`

**Nếu submit lỗi**: TC2 FAIL → báo em (RPC `update_user_phone` error — kèm screenshot console F12)

---

### TC3 — Submit phone trùng tài khoản khác → DUPLICATE error

**Setup**: 
- Account A (đã có sẵn phone `09011112222` trong DB)
- Account B (đã clear phone) — login as B

**Steps**:
1. Logout, login as account B
2. Modal mở → nhập `09011112222` (số đang thuộc account A)
3. Bấm **Lưu**

**Expect**:
- Modal vẫn mở
- Hiện error đỏ: **"Số điện thoại này đã được tài khoản khác sử dụng. Anh/chị kiểm tra lại hoặc liên hệ admin..."**

**Nếu cho qua hoặc báo lỗi sai**: TC3 FAIL → báo em (unique check broken)

---

### TC4 — Submit phone format sai (10 số) → INVALID_FORMAT

**Steps** (tiếp từ TC3, vẫn trong modal):
1. Xoá ô input
2. Nhập `0901234567` (chỉ có 10 chữ số)
3. Bấm **Lưu**

**Expect**:
- Hiện error: **"Số điện thoại phải đủ 11 số bắt đầu bằng 0..."**

**Nếu cho qua**: TC4 FAIL → báo em (frontend validation thiếu)

---

### TC5 — Submit phone có dấu `-` → SEP error

**Steps** (vẫn trong modal):
1. Xoá ô input
2. Nhập `090-1234-5678`
3. Bấm **Lưu**

**Expect**:
- Hiện error: **"Anh/chị xoá dấu - giúp em..."** (hoặc tương tự)

**Nếu cho qua**: TC5 FAIL → báo em (regex validation thiếu)

---

### TC6 — Click "Để cập nhật sau" → reminder banner xuất hiện

**Setup**: Logout, login lại as KH bị clear phone (TC1 setup)

**Steps**:
1. Modal "Cập nhật số điện thoại" tự mở
2. Bấm nút **"Để cập nhật sau"** (hoặc link/text Dismiss)

**Expect**:
- Modal **đóng**
- Ở **đầu trang dashboard** xuất hiện banner subtle (màu vàng/cam nhẹ): **"📱 Anh/chị chưa cập nhật SĐT — [Cập nhật ngay]"**
- F5 reload page → **modal prompt lại** (vì flag dismiss chỉ là session-only, không persist)

**Nếu banner KHÔNG hiện**: TC6 FAIL → báo em (banner state broken)

---

### TC7 — Click "Cập nhật ngay" trong banner → modal mở lại

**Steps** (tiếp TC6):
1. Click vào link/nút **"Cập nhật ngay"** trong banner

**Expect**:
- Modal "Cập nhật số điện thoại" **mở lại** đúng như TC1
- Input focus tự động

**Nếu không mở**: TC7 FAIL → báo em (handler banner click broken)

---

### TC8 — Click "×" close banner → banner ẩn vĩnh viễn (session)

**Steps** (vẫn TC6 — đóng modal nếu lỡ mở từ TC7):
1. Click nút **"×"** ở góc phải banner

**Expect**:
- Banner **ẩn ngay**
- Click các tab dashboard (Inventory, Orders…) → banner **không hiện lại** trong session này
- Chỉ khi F5 hoặc login lại mới reset

**Nếu banner vẫn lì**: TC8 FAIL → báo em (close handler thiếu)

---

### TC9 — KH có phone đúng format → KHÔNG có modal, KHÔNG banner

**Setup**: Login bằng account đã có phone đúng (VD chính account anh `09042376886` — số đúng format 11 số)

**Steps**:
1. Logout, login bằng account anh
2. Đợi dashboard load 2-3 giây

**Expect**:
- Dashboard load **bình thường**
- **KHÔNG modal** prompt
- **KHÔNG banner** reminder
- Vào tab Profile/Settings xem phone → vẫn là `09042376886`

**Nếu vẫn hiện modal**: TC9 FAIL → báo em (false positive prompt — logic check phone bị sai)

---

### TC10 — Live hint trong modal (UX detail)

**Setup**: Login lại as KH bị clear phone → modal mở

**Steps**:
1. Trong ô input modal, gõ từng ký tự — quan sát hint dưới ô:

| Anh gõ | Hint hiện |
|---|---|
| `0` | Màu **amber** (vàng cam): *"Còn 10 số nữa…"* |
| `09` | Amber: *"Còn 9 số nữa…"* |
| `090` | Amber: *"Còn 8 số nữa…"* |
| `0904237688` | Amber: *"Còn 1 số nữa…"* |
| `09042376886` | Màu **green** (xanh): *"✅ Số điện thoại đúng định dạng"* |
| `09042376886a` | Màu **red**: *"Chỉ chứa chữ số 0-9"* |

**Expect**: Hint update real-time đúng theo bảng trên

**Nếu hint không hiện hoặc sai màu**: TC10 FAIL → báo em (UX live validation broken)

---

## SQL Verify Test

> Mở Supabase Dashboard → SQL Editor → query mới

### TC-SQL-1 — Verify 18 accounts đã clear phone đúng

```sql
SELECT count(*) AS phone_NULL_sau_clear
FROM public.profiles
WHERE id IN (SELECT id FROM public._phone_dup_backup_2026_05_03)
  AND phone IS NULL;
```

**Expect**: 1 row, cột `phone_null_sau_clear` = `18` (trừ những account anh đã update qua TC2)

> Nếu anh đã chạy TC2 rồi thì số sẽ giảm: 18 - (số TC2 đã update)

---

### TC-SQL-2 — Test RPC update_user_phone trực tiếp

> Trick: set JWT claim giả lập user

```sql
-- Lấy UUID của anh
SELECT id, email FROM public.profiles WHERE phone = '09042376886' LIMIT 1;
-- Copy UUID ra

-- Set claim giả lập
SELECT set_config('request.jwt.claim.sub', '<paste_uuid_anh_vào_đây>', true);

-- Gọi RPC
SELECT public.update_user_phone('09042376886');
```

**Expect**: Trả về JSON:
```json
{ "success": true, "message": "Cập nhật SĐT thành công", "phone": "09042376886" }
```

**Nếu return `success: false`**: TC-SQL-2 FAIL → screenshot error code báo em

---

## Action map nếu FAIL

| TC fail | Nguyên nhân khả năng | Action |
|---|---|---|
| **TC1** | Modal không trigger | Báo em — check `useEffect` + flag `phone_needs_update` ở frontend |
| **TC2** | RPC `update_user_phone` lỗi | Báo em — check Supabase logs (Functions → update_user_phone) |
| **TC3** | Unique check broken | Báo em — verify index `profiles_phone_unique` còn tồn tại |
| **TC4-5** | Frontend validation thiếu | Báo em — check regex `/^0\d{10}$/` ở component modal |
| **TC6** | Banner state broken | Báo em — check state `dismissedThisSession` |
| **TC7** | Banner click handler thiếu | Báo em — check onClick "Cập nhật ngay" |
| **TC8** | Close × handler thiếu | Báo em — check setState `bannerHidden = true` |
| **TC9** | False positive prompt | Báo em — check logic `if (!phone || phone === '')` |
| **TC10** | UX live validation | Báo em — check `onChange` handler hint logic |
| **TC-SQL-1** | Clear chưa sạch | Chạy lại Block 2 của resolve-duplicates SQL |
| **TC-SQL-2** | RPC config sai | Báo em — check GRANT permission |

---

## PASS hết → next steps

Khi TC1–TC10 + TC-SQL-1, TC-SQL-2 **đều PASS**:

### 1. Anh download CSV 18 KH
- File `accounts_da_clear_phone.csv` (đã lưu ở Step 1.6 của Pre-test SQL)
- 18 dòng = 18 KH cần liên hệ

### 2. Liên hệ KH theo template

> Theo file `K:\bep-thuy-japan\CUSTOMER-OUTREACH-DUPLICATE-PHONE.md`

- Chia 2 batch (kênh anh có sẵn):
  - **Batch A — Email**: KH có cột email valid
  - **Batch B — Zalo/Messenger**: KH thường liên hệ qua chat
- Template message: copy từ file `CUSTOMER-OUTREACH-DUPLICATE-PHONE.md` (em viết sẵn — ngắn gọn, lịch sự, có CTA "đăng nhập + cập nhật")
- Track tiến độ liên hệ: dùng cột status trong CSV (`đã gửi`, `đã reply`, `đã cập nhật phone`)

### 3. Em làm gì tiếp
- ✅ Update memory `pending_thuyjapan_action_items.md` — đánh dấu task **"Resolve duplicate phone"** = DONE
- ✅ Viết handover doc **V8** ở `K:\bep-thuy-japan\thuyjapan-com-project-v8.md` covering:
  - Migration phone-login V1 + V2 + RPC update đã apply production
  - 18 KH cleared, đang outreach
  - Stats: bao nhiêu KH đã re-update phone qua modal sau 1 tuần
- ✅ Set lịch follow-up sau **7 ngày** (2026-05-10) — query lại `_phone_dup_backup_2026_05_03` xem KH nào chưa cập nhật phone để gửi reminder lần 2

---

## Checklist cuối

- [ ] Pre-test SQL Step 1-4 PASS
- [ ] Frontend TC1-TC10 PASS
- [ ] SQL TC-SQL-1, TC-SQL-2 PASS
- [ ] CSV 18 KH downloaded
- [ ] Outreach plan ready
- [ ] Báo em → em làm V8 handover

---

> **Anh có vấn đề ở bất kỳ TC nào → screenshot + paste vào chat, em fix ngay.**
> **Đừng chạy production migration nào khác trước khi TC này PASS hết — risk đụng UNIQUE INDEX.**
