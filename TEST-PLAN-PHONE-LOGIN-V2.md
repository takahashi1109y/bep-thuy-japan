# Test Plan — Phone Login V2 (Quy chuẩn 11 digits JP)

> **Mục đích**: Verify bug "anh test phone login báo lỗi" đã được fix triệt để
> **Phone test chính**: `09042376886` (số của anh)
> **Thời gian dự kiến**: 30-40 phút (gồm chạy SQL + test UI desktop + mobile)
> **Người test**: Anh Thắng (founder)
> **Ngày**: 2026-05-03
> **Version**: V2 — Strict 11-digit validation, error tách riêng, live hint

---

## Tổng quan: Anh sẽ làm gì?

Anh đi qua **3 phần lớn**:

1. **Pre-test (BẮT BUỘC)** — Chạy 3 file SQL trên Supabase trước khi test UI
2. **Frontend Test Suite** — 10 test case trên trình duyệt
3. **Signup Test Suite** — 3 test case đăng ký mới
4. **Mobile Test** — Test trên iPhone Safari (5 phút)

Sau mỗi test case, anh đánh dấu **PASS** hoặc **FAIL**. Nếu FAIL, anh chụp màn hình + báo em số TC.

---

## Mẹo DevTools (mở Console + Network để debug)

| OS | Mở DevTools | Tab cần xem |
|---|---|---|
| Windows (Chrome/Edge) | `F12` hoặc `Ctrl + Shift + I` | **Console** + **Network** |
| Mac (Chrome/Safari) | `Cmd + Option + I` | **Console** + **Network** |
| iPhone Safari | Bật Developer trong Settings → Connect Mac → Safari Develop menu | (mobile inspect) |

**Cách dùng**:
- **Console tab**: xem log `[PHONE LOGIN]` em đã thêm. Nếu có lỗi đỏ → screenshot gửi em.
- **Network tab**: filter `phone-login` hoặc `auth` → coi request có gửi lên server không. Nếu không gửi = frontend reject sớm (đúng).

---

## PHẦN 1: Pre-test (BẮT BUỘC làm trước UI test)

### Step A — Diagnose status hiện tại (5 phút)

**Mục đích**: Coi DB hiện tại đang ở version nào, có cần migration không, có data sai format không.

**Cách làm**:

1. Mở browser, vào: **https://supabase.com/dashboard/project/_/sql/new**
   - Nếu chưa login Supabase → login bằng email anh dùng cho thuyjapan
   - Pick project **thuyjapan-com** (hoặc tên project chính)

2. Mở file `K:\bep-thuy-japan\DIAGNOSE-PHONE-LOGIN.sql` bằng Notepad / VS Code

3. **Chạy từng BLOCK 1-8**:
   - Copy nội dung **BLOCK 1**
   - Paste vào Supabase SQL Editor
   - Click nút **Run** (hoặc `Ctrl + Enter`)
   - Đọc kết quả ở panel dưới
   - Lặp lại cho BLOCK 2, 3, ..., 8

4. **Quan trọng phải xem**:
   - **BLOCK 1** — `chan_doan` column: phải báo gì? (ví dụ: "Migration v2 chưa chạy" / "RPC cũ" / "OK")
   - **BLOCK 3** — `sai_format` count: nếu > 0 → phải chạy backfill (Step C)
   - **BLOCK 5** — RPC test: paste `09042376886` → phải return email anh

5. **Action**:
   - Mở Notepad, copy output 8 blocks vào → save thành `diagnose-output.txt`
   - Gửi em (Zalo / paste vào chat) để em coi cần làm Step B + C không

**Expected sau Step A**:
- Anh có file `diagnose-output.txt` hoặc 8 screenshots
- Em đọc xong báo: "OK skip Step B" hoặc "phải chạy Step B vì..."

---

### Step B — Chạy migration V2 (10 phút, NẾU diagnose báo migration cũ)

**Skip nếu**: BLOCK 1 báo "Migration v2 đã chạy" + BLOCK 5 RPC test return đúng email

**Cách làm** (nếu cần):

1. Mở file `K:\bep-thuy-japan\supabase-phone-login-v2.sql`

2. **Chạy tuần tự BLOCK 1-5** (KHÔNG skip block):
   - **BLOCK 1**: Drop functions cũ → expected: `Success. No rows returned`
   - **BLOCK 2**: Create `normalize_phone_jp()` helper → expected: `Success`
   - **BLOCK 3**: Create `phone_login_lookup()` RPC → expected: `Success`
   - **BLOCK 4**: Verify 2 functions tồn tại → expected: query trả 2 rows (`normalize_phone_jp` + `phone_login_lookup`)
   - **BLOCK 5**: Test 12 cases — đây là phần QUAN TRỌNG NHẤT

3. **BLOCK 5 expected results**:

| Test case | Input | Expected Output |
|---|---|---|
| test_1 | `09042376886` | Email của anh (vd `thanghoang1109@gmail.com`) |
| test_2 | `090-4237-6886` | Email của anh (normalize bỏ dấu `-`) |
| test_3 | `090 4237 6886` | Email của anh (normalize bỏ space) |
| test_4 | `+819042376886` | Email của anh (convert +81 → 0) |
| test_5 | `81-9042-376886` | Email của anh |
| test_6 | `０９０４２３７６８８６` (full-width) | Email của anh |
| test_7 | `0904237688` (10 digits) | NULL (sai format) |
| test_8 | `19042376886` (không start 0) | NULL |
| test_9 | `09099999999` (chưa đăng ký) | NULL |
| test_10 | `abc123` | NULL |
| test_11 | (empty) | NULL |
| test_12 | `123456789012` (12 digits) | NULL |

4. **PASS criteria**: test_1 → test_6 đều ra email anh, test_7 → test_12 đều NULL

5. **Action**: Copy output → gửi em verify

**Nếu FAIL**:
- test_1-6 không ra email → RPC sai logic, báo em ngay
- test_7-12 ra email (đáng lẽ NULL) → validation lỏng, báo em

---

### Step C — Backfill data cũ (10 phút, NẾU `sai_format > 0`)

**Skip nếu**: BLOCK 3 của diagnose báo `sai_format = 0`

**Cách làm** (nếu cần):

1. Mở file `K:\bep-thuy-japan\supabase-phone-backfill.sql`

2. **Chạy tuần tự**:

   **BLOCK 1 — PRE-CHECK**:
   - Run → đọc số lượng row sẽ bị update
   - Expected: số `can_update` > 0

   **BLOCK 2 — DRY-RUN (review)**:
   - Run → Supabase trả ra bảng list tất cả row sẽ update (KHÔNG thực sự update)
   - **Anh ngồi đọc list này CẨN THẬN**: coi có ai phone format kỳ lạ không (vd phone Thái, phone Mỹ lẫn vào)
   - Nếu thấy bất thường → screenshot gửi em TRƯỚC khi sang BLOCK 4

   **BLOCK 3 — BACKUP** (BẮT BUỘC):
   - Run → tạo bảng backup `profiles_phone_backup_2026_05_03`
   - Expected: `Success. X rows backed up`
   - **Đây là cứu cánh nếu update sai → có thể restore**

   **BLOCK 4 — UPDATE THẬT**:
   - Run → cập nhật phone về format `09xxx...`
   - Expected: `UPDATE X` (X = số row đã update)

   **BLOCK 5 — POST-CHECK**:
   - Run → verify
   - Expected: `van_sai_format = 0`
   - Nếu `van_sai_format > 0` → còn data lỗi, báo em

   **BLOCK 6 — EXPORT CSV**:
   - Run → Supabase trả ra list khách cần liên hệ (phone không normalize được)
   - Click **Download CSV** ở góc Supabase (icon download)
   - Save file: `khach-can-update-phone-2026-05-03.csv`
   - Sau khi PASS toàn bộ test → email/Zalo nhắc khách

3. **Action**: Báo em output `van_sai_format` + số rows trong CSV

---

## PHẦN 2: Frontend Test Suite (10 cases — 15 phút)

**Setup chung trước khi test**:
1. Mở **Chrome Incognito** (`Ctrl + Shift + N` Windows / `Cmd + Shift + N` Mac)
2. Mở DevTools (F12) → tab **Console** + **Network**
3. Vào: **https://www.thuyjapan.com/thanh-vien**
4. Verify đang ở tab **Đăng nhập** (không phải Đăng ký)

---

### TC1 — Phone đúng format đăng nhập OK (HAPPY PATH)

**Steps**:
1. Trong ô phone/email, nhập: `09042376886`
2. Trong ô password, nhập password thật của anh
3. Click nút **Đăng nhập**

**Expected**:
- Redirect vào dashboard `/tai-khoan` hoặc trang chính
- Header hiện tên anh
- Console log: `[PHONE LOGIN] Format OK, calling RPC...` + `[PHONE LOGIN] RPC returned email: thang...`
- Network tab: thấy request `phone-login-lookup` status `200`, response có email

**PASS / FAIL**:
- [ ] PASS
- [ ] FAIL → screenshot console + network → báo em

---

### TC2 — Phone có dấu `-` bị reject + live hint hiện

**Steps**:
1. Logout (nếu TC1 đã login)
2. Vào lại `/thanh-vien`
3. Nhập phone: `090-4237-6886` (gõ từ từ để xem hint)
4. **Quan sát DURING typing**: hint amber phải hiện DƯỚI ô input
5. Click **Đăng nhập** (không nhập password)

**Expected**:
- **During typing**: hint amber: `"Vui lòng xoá dấu - và nhập 11 số liền nhau (ví dụ: 09042376886)"`
- **After click submit**: error đỏ: `"Anh/chị xoá dấu - (hoặc khoảng trắng / +81) và nhập 11 số liền nhau, ví dụ 09042376886"`
- **Network tab**: KHÔNG có request lên server (frontend chặn)
- **Console**: log `[PHONE LOGIN] Format invalid, blocked client-side`

**PASS / FAIL**:
- [ ] PASS (cả hint + error + không gửi network)
- [ ] FAIL — chi tiết phần nào sai? __________

---

### TC3 — Phone format `+81` E.164 bị reject

**Steps**:
1. Logout. Vào `/thanh-vien`
2. Nhập: `+819042376886`
3. Click Đăng nhập

**Expected**:
- Error đỏ: `"Anh/chị xoá dấu + (hoặc khoảng trắng / -) và nhập 11 số liền nhau bắt đầu bằng 0, ví dụ 09042376886"`
- Network: KHÔNG gửi request

**PASS / FAIL**:
- [ ] PASS
- [ ] FAIL

---

### TC4 — Phone với khoảng trắng bị reject

**Steps**:
1. Nhập: `090 4237 6886` (có space)
2. Click Đăng nhập

**Expected**:
- Hint amber DURING typing
- Error đỏ AFTER submit
- Network KHÔNG fire

**PASS / FAIL**:
- [ ] PASS
- [ ] FAIL

---

### TC5 — Phone 10 digits (thiếu 1 số) → error format

**Steps**:
1. Nhập: `0904237688` (đếm chỉ 10 digits)
2. Click Đăng nhập

**Expected**:
- Error đỏ format: `"Số điện thoại Nhật phải gồm 11 số bắt đầu bằng 0 (ví dụ: 09042376886)"`
- Network KHÔNG fire

**PASS / FAIL**:
- [ ] PASS
- [ ] FAIL

---

### TC6 — Phone 11 digits không bắt đầu bằng `0` → error format

**Steps**:
1. Nhập: `19042376886` (start bằng `1`, không phải `0`)
2. Click Đăng nhập

**Expected**:
- Error format giống TC5
- Network KHÔNG fire

**PASS / FAIL**:
- [ ] PASS
- [ ] FAIL

---

### TC7 — Phone đúng + password SAI → error PASSWORD CỤ THỂ (KHÔNG GỘP)

**Quan trọng**: TC này verify error đã tách — KHÔNG còn câu gộp legacy "phone chưa đăng ký hoặc sai mật khẩu".

**Steps**:
1. Nhập phone: `09042376886` (đúng số anh)
2. Nhập password: `sai-mat-khau-test-123` (cố tình sai)
3. Click Đăng nhập

**Expected**:
- Error đỏ: **"Email hoặc mật khẩu không đúng"** (hoặc tương đương — error nói rõ về password)
- **KHÔNG XUẤT HIỆN**: câu cũ `"Số điện thoại chưa đăng ký hoặc sai mật khẩu"` (gộp 2)
- Network: thấy 2 request:
  1. `phone-login-lookup` → status 200, return email
  2. `auth/v1/token?grant_type=password` → status 400 (sai password)
- Console: `[PHONE LOGIN] RPC found email, attempting auth...` rồi `[PHONE LOGIN] Auth failed: invalid_credentials`

**PASS / FAIL**:
- [ ] PASS — error nói về password
- [ ] FAIL — vẫn ra câu gộp cũ → báo em ngay (frontend chưa tách error)

---

### TC8 — Phone CHƯA đăng ký → error PHONE CỤ THỂ

**Steps**:
1. Nhập phone: `09099999999` (số fake chưa có trong DB)
2. Nhập password: bất kỳ (vd `test123456`)
3. Click Đăng nhập

**Expected**:
- Error đỏ: **"Số điện thoại 09099999999 chưa đăng ký tài khoản. Anh/chị đăng ký mới hoặc kiểm tra lại số."**
- Network: chỉ 1 request `phone-login-lookup` → return NULL (không có email)
- KHÔNG fire request auth (vì không có email để auth)
- Console: `[PHONE LOGIN] RPC returned NULL — phone not registered`

**PASS / FAIL**:
- [ ] PASS — error nói về phone chưa đăng ký
- [ ] FAIL

---

### TC9 — Live hint count down khi gõ từng ký tự

**Mục đích**: Verify hint amber dynamic (đếm còn bao nhiêu số nữa).

**Steps**:
1. Click vào ô phone (focus)
2. Gõ TỪNG KÝ TỰ một, ngừng 0.5 giây giữa mỗi lần để đọc hint:

| Sau khi gõ | Hint expected |
|---|---|
| `0` | amber: "Còn 10 số nữa…" |
| `09` | amber: "Còn 9 số nữa…" |
| `090` | amber: "Còn 8 số nữa…" |
| `0904` | amber: "Còn 7 số nữa…" |
| `09042` | amber: "Còn 6 số nữa…" |
| `090423` | amber: "Còn 5 số nữa…" |
| `0904237` | amber: "Còn 4 số nữa…" |
| `09042376` | amber: "Còn 3 số nữa…" |
| `090423768` | amber: "Còn 2 số nữa…" |
| `0904237688` | amber: "Còn 1 số nữa…" |
| `09042376886` | **green**: "Số điện thoại đúng định dạng" |

**Expected**:
- Mỗi keystroke update hint ngay (không lag > 200ms)
- Khi đủ 11 digits + start bằng 0 → đổi từ amber sang green

**PASS / FAIL**:
- [ ] PASS — count down hoạt động + chuyển green ở step cuối
- [ ] FAIL — hint không update / không chuyển color

---

### TC10 — Email login vẫn work (REGRESSION TEST)

**Mục đích**: Verify fix không phá email login.

**Steps**:
1. Logout
2. Trong ô phone/email, nhập **email** anh dùng đăng ký (vd `thanghoang1109@gmail.com`)
3. Nhập password thật
4. Click Đăng nhập

**Expected**:
- Login OK như cũ
- Vào dashboard
- Network: KHÔNG fire `phone-login-lookup` (vì input là email)
- Console: KHÔNG có log `[PHONE LOGIN]`

**PASS / FAIL**:
- [ ] PASS
- [ ] FAIL — REGRESSION CRITICAL → báo em ngay

---

## PHẦN 3: Signup Test Suite (3 cases — 5 phút)

**Setup**: Mở incognito mới, vào `/thanh-vien` → click tab **Đăng ký**

### TC11 — Signup phone đúng format OK

**Steps**:
1. Tab Đăng ký
2. Email: `test-tc11-{timestamp}@gmail.com` (anh thay timestamp = thời điểm test, vd `test-tc11-20260503@gmail.com`)
3. Phone: `09011112222` (số fake chưa dùng)
4. Password: `Test123456!`
5. Họ tên: `Test TC11`
6. Click **Đăng ký**

**Expected**:
- Success message hoặc redirect
- Email confirmation gửi đến inbox
- (Optional) Check Supabase Auth → user mới có phone = `09011112222` (đúng format)

**PASS / FAIL**:
- [ ] PASS
- [ ] FAIL

**Cleanup**: Sau test, vào Supabase → xoá user `test-tc11-...` để không rác data.

---

### TC12 — Signup phone có dấu bị reject (frontend block)

**Steps**:
1. Email mới
2. Phone: `090-1111-2222`
3. Password + name bất kỳ
4. Click Đăng ký

**Expected**:
- Error: format phone sai
- Form KHÔNG submit
- Network KHÔNG fire signup request

**PASS / FAIL**:
- [ ] PASS
- [ ] FAIL

---

### TC13 — Signup phone đúng + verify DB lưu format chuẩn

**Steps**:
1. Signup với phone `09033334444` (số fake mới)
2. Sau khi signup thành công, vào **Supabase Dashboard → Auth → Users**
3. Tìm user vừa tạo
4. Click vào user → coi field `phone`

**Expected**:
- DB lưu phone = `09033334444` (KHÔNG phải `+819033334444`, KHÔNG có dấu)
- Trigger `on_auth_user_created` đã chạy → có row trong table `profiles` với phone đúng format

**PASS / FAIL**:
- [ ] PASS
- [ ] FAIL — DB format sai → migration v2 trigger không hoạt động → báo em

---

## PHẦN 4: Mobile Test (5 phút) — iPhone Safari

**Anh dùng iPhone Safari test 3 case quan trọng nhất**:

### TM1 — Mobile login phone đúng (giống TC1)
1. iPhone → Safari → `https://www.thuyjapan.com/thanh-vien`
2. Phone: `09042376886` + password thật
3. Tap Đăng nhập
4. Expected: login OK, vào dashboard

**PASS / FAIL**: ___

### TM2 — Mobile keyboard có hiện numeric pad không?
1. Tap vào ô phone
2. Expected: bàn phím Apple hiện **numeric pad** (chữ số to), KHÔNG phải full keyboard
3. (Verify HTML input có `type="tel"` hoặc `inputmode="numeric"`)

**PASS / FAIL**: ___

### TM3 — Mobile hint hiện đẹp (không tràn màn hình)
1. Gõ `090-4237-6886`
2. Expected: hint amber hiện gọn dưới input, không tràn ra ngoài, không che button submit

**PASS / FAIL**: ___

---

## Tổng kết — Action nếu FAIL

| TC fail | Mức độ | Action |
|---|---|---|
| TC1 | CRITICAL | Báo em NGAY (Zalo) — phone login broken |
| TC2-TC4 | HIGH | Báo em — frontend strict validation thiếu |
| TC5-TC6 | MEDIUM | Báo em — error format chưa hiện |
| TC7 | HIGH | Báo em — error vẫn gộp legacy, chưa tách |
| TC8 | HIGH | Báo em — error phone-not-registered chưa hiện |
| TC9 | MEDIUM | Báo em — live hint không fire |
| TC10 | CRITICAL | REGRESSION — email login broken — fix gấp |
| TC11-TC13 | HIGH | Báo em — signup flow có vấn đề |
| TM1 | CRITICAL | Mobile broken — báo em |
| TM2-TM3 | LOW | Báo em — UX mobile cần polish |

**Cách báo em**:
1. Screenshot màn hình (Print Screen Windows / Cmd+Shift+4 Mac / volume + power iPhone)
2. Copy console log nếu có
3. Copy network response nếu có
4. Gửi qua Zalo / chat với em + ghi rõ "TC số mấy fail"

---

## Nếu PASS HẾT — Anh báo em

Em sẽ làm:
1. Update **handover doc V8** (`thuyjapan-com-project-v8.md`) — đánh dấu phone login bug fixed
2. Update **memory** (`pending_thuyjapan_action_items.md`) — remove item "phone login bug" + add "follow up khách CSV backfill"
3. Đề xuất template email/Zalo gửi khách trong CSV (Block 6 backfill) để nhắc cập nhật phone đúng format khi đăng nhập lần sau
4. Đóng task — chuyển sang feature kế tiếp anh muốn làm

---

## Phụ lục — Files reference

| File | Path | Khi nào dùng |
|---|---|---|
| Diagnose | `K:\bep-thuy-japan\DIAGNOSE-PHONE-LOGIN.sql` | Step A (BẮT BUỘC trước test) |
| Migration V2 | `K:\bep-thuy-japan\supabase-phone-login-v2.sql` | Step B (nếu diagnose báo cần) |
| Backfill | `K:\bep-thuy-japan\supabase-phone-backfill.sql` | Step C (nếu sai_format > 0) |
| Frontend | `thanh-vien.html` (đã deploy) | Test trực tiếp trên thuyjapan.com |
| Test plan này | `K:\bep-thuy-japan\TEST-PLAN-PHONE-LOGIN-V2.md` | Document anh đang đọc |

---

**Anh đọc xong test plan này, bắt đầu từ PHẦN 1 — Step A. Em đứng đợi output diagnose để guide tiếp.**

**Em — Agent 6/10 (QA test plan author)**
**2026-05-03**
