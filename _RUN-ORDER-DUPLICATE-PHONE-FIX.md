# 🚀 RUN ORDER — Duplicate Phone Fix (2026-05-03)

> **Đọc file này TRƯỚC** khi chạy SQL hoặc test. Đây là master checklist.
> **Tổng thời gian**: ~45 phút (15 phút SQL + 20 phút test + 10 phút email)
> **Prefix `_`** → Supabase Studio sort lên đầu để dễ tìm.

---

## ✅ Checklist tổng (7 phases)

- [ ] **Phase 1** — Resolve duplicates (5 phút) 🔵
- [ ] **Phase 2** — Re-run V1 migration (5 phút) 🔵
- [ ] **Phase 3** — V2 enhance (3 phút) 🟢
- [ ] **Phase 4** — RPC `update_user_phone` (2 phút) 🟡
- [ ] **Phase 5** — Test frontend 10 TCs (15 phút) 🟠
- [ ] **Phase 6** — Email/Zalo 18 khách (10 phút) 🔴
- [ ] **Phase 7** — Anh báo em PASS → em commit + push ✅

---

## 🔵 Phase 1 — Resolve Duplicates (5 phút)

**Mục đích**: Clear `phone` field của 18 accounts dính 5 cụm duplicate (để Phase 2 tạo unique index thành công).

**File**: `K:\bep-thuy-japan\supabase-phone-resolve-duplicates.sql`

**Steps** (chạy từng block, KHÔNG copy hết file paste 1 lần):

- [ ] **Block 1 (BACKUP)** — `INSERT INTO so_account_da_backup`
  - Verify: `so_account_da_backup` count = **18**
  - ⚠️ BẮT BUỘC trước Block 2 để có rollback safety
- [ ] **Block 2 (CLEAR phone)** — `UPDATE so_account SET phone = NULL`
  - Expect output: `UPDATE 18`
- [ ] **Block 3 (VERIFY zero duplicates)** — `SELECT phone, COUNT(*) ... HAVING COUNT(*) > 1`
  - Expect: **0 rows** trả về
- [ ] **Block 4 (EXPORT CSV)** — `SELECT email, full_name, old_phone FROM so_account_da_backup`
  - Click "Download CSV" trên Supabase Studio
  - File này dùng cho Phase 6 (email khách)

⚠️ **Nếu Block 1 verify ≠ 18** → STOP, ping em check lại duplicate count trước khi clear.

---

## 🔵 Phase 2 — Re-run V1 Migration (5 phút)

**Mục đích**: Tạo unique index trên `phone` (giờ không còn duplicate sau Phase 1).

**File**: `K:\bep-thuy-japan\supabase-phone-login.sql`

**Steps**:

- [ ] **Step 1 (UPDATE normalize)** — đã chạy rồi từ trước, có thể **SKIP**
- [ ] **Step 2 (CHECK duplicates)** — expect **0 rows** (vì Phase 1 đã clear)
- [ ] **Step 3 (CREATE UNIQUE INDEX)** — expect `CREATE INDEX`
  - ⚠️ Nếu fail "duplicate key value" → có duplicate sót → **STOP, ping em**
- [ ] **Step 4 (CREATE TRIGGER normalize_phone)** — expect `CREATE FUNCTION` + `CREATE TRIGGER`
- [ ] **Step 5 (CREATE RPC v1 get_email_by_phone)** — expect `CREATE FUNCTION`
  - (Sẽ bị override ở Phase 3 — đó là chủ ý)

---

## 🟢 Phase 3 — V2 Enhance (3 phút)

**Mục đích**: Override trigger + RPC với:
- Auto-convert `+81` → `0`
- Strict regex `^0\d{10}$` (chỉ cho phép 11 digits, prefix `0`)

**File**: `K:\bep-thuy-japan\supabase-phone-login-v2.sql`

**Steps**:

- [ ] **Block 1** — Override trigger với +81 conversion logic
- [ ] **Block 2** — Override RPC `get_email_by_phone` với strict regex `^0\d{10}$`
- [ ] **Block 3** — Re-grant `EXECUTE` tới `anon` + `authenticated`
- [ ] **Block 4** — Verify: `SELECT proname FROM pg_proc WHERE ...` → expect **2 rows** (function + trigger)
- [ ] **Block 5** — Test 12 cases inline:
  - test_1 → test_6 (valid formats: 0xxx, +81xxx, có space, có dash) → trả **email anh**
  - test_7 → test_12 (invalid: 10 digits, 12 digits, chữ, NULL, empty, prefix khác 0) → trả **NULL**

⚠️ **Nếu test_1 không trả email** → STOP, RPC v2 có vấn đề → ping em.

---

## 🟡 Phase 4 — RPC `update_user_phone` (2 phút)

**Mục đích**: Tạo RPC để frontend modal "Cập nhật SĐT" có thể save được.

**File**: `K:\bep-thuy-japan\supabase-update-user-phone-rpc.sql`

**Steps**:

- [ ] **Block 1** — `CREATE FUNCTION update_user_phone` (SECURITY DEFINER)
- [ ] **Block 2** — `GRANT EXECUTE` tới `authenticated`
- [ ] **Block 3** — Verify: `SELECT proname, prosecdef FROM pg_proc WHERE proname = 'update_user_phone'`
  - Expect: **1 row**, `prosecdef = true` (security definer ON)

ℹ️ **Block 4 test cases**: SKIP — cần `auth.uid()` từ session login, sẽ test qua frontend ở Phase 5.

---

## 🟠 Phase 5 — Test Frontend (15 phút)

**File chi tiết**: `K:\bep-thuy-japan\TEST-PLAN-DUPLICATE-PHONE-FLOW.md`

**Setup**: Mở https://thuyjapan.com trên Chrome incognito + DevTools console.

**10 test cases** (anh tick từng cái):

- [ ] **TC1** — KH bị clear phone login bằng email → modal "Cập nhật SĐT" prompt sau 1.5s
- [ ] **TC2** — Submit phone đúng format `09012345678` → success, modal close, banner ẩn
- [ ] **TC3** — Submit phone trùng với account khác → error `DUPLICATE_PHONE`, modal stay open
- [ ] **TC4** — Phone 10 digits `0901234567` → error `INVALID_FORMAT`
- [ ] **TC5** — Phone có dấu `-` `090-1234-5678` → error `INVALID_SEPARATOR` (hoặc auto-strip)
- [ ] **TC6** — Click "Để sau" / Dismiss → modal close, reminder banner xuất hiện top page
- [ ] **TC7** — Click "Cập nhật ngay" trên reminder banner → modal mở lại
- [ ] **TC8** — Click `×` close button trên reminder banner → banner ẩn (không hiện lại session này)
- [ ] **TC9** — KH có phone đúng format từ đầu → KHÔNG modal, KHÔNG banner
- [ ] **TC10** — Live hint count down: typing `090` → "8 digits left", typing đủ 11 → "✓ valid"

⚠️ **Nếu TC1 không trigger modal** → ping em check `setTimeout(1500)` + `currentProfile?.phone === null`.

---

## 🔴 Phase 6 — Email/Zalo 18 Khách (10 phút)

**File chi tiết**: `K:\bep-thuy-japan\CUSTOMER-OUTREACH-DUPLICATE-PHONE.md`

**Steps**:

- [ ] Mở CSV download từ Phase 1 Block 4
- [ ] **Phân loại 18 accounts**:
  - Skip ~12 test accounts (anh + "Test Nat..." accounts)
  - Liên hệ ~6 KH thật:
    - 4 KH thường → email blast
    - 2 KH share phone (vợ chồng case) → Zalo cá nhân giải thích
- [ ] **Email blast qua GetResponse** (template trong file outreach):
  - Subject: "Vui lòng cập nhật SĐT đăng nhập trên Thuyjapan.com"
  - CTA button → https://thuyjapan.com (auto-trigger modal sau login)
- [ ] **Zalo cá nhân** cho 2 KH share phone:
  - Giải thích: "Mỗi tài khoản giờ cần 1 SĐT riêng. Anh/chị vui lòng dùng SĐT thứ 2."
- [ ] **Tracking sheet** Google Sheet: cột `email`, `contacted_at`, `replied`, `phone_updated`

---

## ✅ Phase 7 — Báo em PASS

Anh nhắn em: **"Phase 1-6 PASS hết, em commit nhé"**

Em sẽ làm:

- [ ] **Commit 1** — SQL files: `supabase-phone-resolve-duplicates.sql` + `supabase-update-user-phone-rpc.sql`
- [ ] **Commit 2** — Frontend diffs: modal `UpdatePhoneModal.tsx` + reminder banner + auth flow integration
- [ ] **Commit 3** — Docs: `TEST-PLAN-DUPLICATE-PHONE-FLOW.md` + `SECURITY-AUDIT-PHONE-LOGIN-V2.md` + `CUSTOMER-OUTREACH-DUPLICATE-PHONE.md` + run order này
- [ ] `git push origin main` → Cloudflare Pages auto-deploy (~2 phút)
- [ ] Em xác nhận URL deploy → anh smoke test 1 lần cuối trên prod

---

## 🚨 Nếu có vấn đề (Troubleshooting)

| Phase | Triệu chứng | Action |
|---|---|---|
| **1.1** | Backup count ≠ 18 | STOP, ping em check duplicate query |
| **1.3** | Verify còn rows | STOP, có duplicate sót → ping em |
| **2.3** | `CREATE UNIQUE INDEX` fail | STOP, có duplicate chưa clear → quay lại Phase 1 |
| **3.5** | test_1 không trả email anh | RPC v2 có vấn đề → ping em xem regex |
| **4.3** | `prosecdef = false` | Function không SECURITY DEFINER → ping em |
| **5.TC1** | Modal không trigger | Check `setTimeout(1500)` + `currentProfile?.phone` |
| **5.TC3** | Duplicate không báo lỗi | RPC `update_user_phone` chưa raise → ping em |
| **6** | KH không reply | Đợi 3-7 ngày, follow-up Zalo cá nhân |

**Quy tắc chung**: gặp lỗi nào → screenshot Supabase Studio output + ping em → em debug ngay, không tự fix forward.

---

## 📂 File map quick reference

| Phase | File path | Purpose |
|---|---|---|
| 1 | `K:\bep-thuy-japan\supabase-phone-resolve-duplicates.sql` | Clear 18 accounts dính duplicate |
| 2 | `K:\bep-thuy-japan\supabase-phone-login.sql` | V1 migration (unique index + trigger + RPC v1) |
| 3 | `K:\bep-thuy-japan\supabase-phone-login-v2.sql` | V2 enhance (+81 convert + strict regex) |
| 4 | `K:\bep-thuy-japan\supabase-update-user-phone-rpc.sql` | RPC cho frontend save phone |
| 5 | `K:\bep-thuy-japan\TEST-PLAN-DUPLICATE-PHONE-FLOW.md` | 10 test cases frontend |
| 6 | `K:\bep-thuy-japan\CUSTOMER-OUTREACH-DUPLICATE-PHONE.md` | Email + Zalo template |
| ref | `K:\bep-thuy-japan\SECURITY-AUDIT-PHONE-LOGIN-V2.md` | Security review (đọc nếu có hỏi) |
| ref | `K:\bep-thuy-japan\DIAGNOSE-PHONE-LOGIN.sql` | Debug queries (nếu có lỗi) |

---

## 📊 Time budget

| Phase | Thời gian | Cumulative |
|---|---|---|
| 1 | 5 phút | 0:05 |
| 2 | 5 phút | 0:10 |
| 3 | 3 phút | 0:13 |
| 4 | 2 phút | 0:15 |
| 5 | 15 phút | 0:30 |
| 6 | 10 phút | 0:40 |
| 7 (em commit) | 5 phút | 0:45 |

**Tổng**: ~45 phút (nếu mọi thứ smooth, không có lỗi).

---

> Em đứng cạnh anh suốt 7 phases. Có gì lạ → ping em **NGAY**, đừng tự fix forward. 🙏
