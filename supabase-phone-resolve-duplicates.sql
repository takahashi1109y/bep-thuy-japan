-- ════════════════════════════════════════════════════════════
-- RESOLVE DUPLICATE PHONES (2026-05-03)
--
-- Anh's rule:
--   "Nếu khách dùng cùng 1 số phone đăng ký cho nhiều email
--    thì xóa số phone đó ở tất cả các tài khoản và chỉ cho phép
--    đăng nhập bằng email, sau đó sẽ yêu cầu cập nhật lại số phone."
--
--   → CLEAR phone TẤT CẢ accounts dính duplicate (không giữ ai).
--   → KH login bằng email → frontend prompt cập nhật phone mới.
--
-- Block 2 V1 migration báo có 5 phones duplicate (18 accounts):
--   - 09042376886 (9 — anh's test accounts)
--   - 08012345678 (3 — test accounts)
--   - 08016417132 (2 — KH "Ly")
--   - 07042204406 (2 — "Khánh Chi", "Thanh Tâm")
--   - 09020911794 (2 — "NGUYỄN THỊ KHUYÊN")
--
-- 👉 Cách dùng:
--   1. Mở: https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
--   2. Chạy TỪNG BLOCK theo thứ tự 1 → 4
--   3. Block 1 (BACKUP) BẮT BUỘC trước Block 2 (UPDATE)
--   4. Block 3 verify 0 duplicate trước khi Block 4 export CSV
--
-- ⚠️  TUYỆT ĐỐI KHÔNG paste cả file 1 lần.
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- BLOCK 1: BACKUP — lưu thông tin trước khi clear
-- ════════════════════════════════════════════════════════════

-- 1.1) Tạo bảng backup riêng cho duplicate accounts
CREATE TABLE IF NOT EXISTS public._phone_dup_backup_2026_05_03 (
  id              uuid        PRIMARY KEY,
  phone_cleared   text        NOT NULL,
  display_name    text,
  email           text,
  cleared_at      timestamptz DEFAULT now(),
  reason          text        DEFAULT 'duplicate_phone'
);

-- 1.2) SECURITY: enable RLS + revoke grants (chứa email + phone)
ALTER TABLE public._phone_dup_backup_2026_05_03 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._phone_dup_backup_2026_05_03 FROM anon, authenticated;

-- 1.3) Insert snapshot — chỉ accounts có phone duplicate
INSERT INTO public._phone_dup_backup_2026_05_03 (id, phone_cleared, display_name, email)
SELECT
  p.id,
  p.phone,
  p.display_name,
  u.email
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.phone IN (
  SELECT phone FROM public.profiles
  WHERE phone IS NOT NULL AND phone <> ''
  GROUP BY phone HAVING count(*) > 1
)
ON CONFLICT (id) DO NOTHING;

-- 1.4) Verify backup có data
SELECT
  count(*)                              AS so_account_da_backup,
  count(DISTINCT phone_cleared)         AS so_phone_duplicate
FROM public._phone_dup_backup_2026_05_03;
-- Expected: so_account_da_backup = 18, so_phone_duplicate = 5


-- ════════════════════════════════════════════════════════════
-- BLOCK 2: CLEAR — set phone = NULL cho tất cả accounts duplicate
-- ════════════════════════════════════════════════════════════
-- ⚠️  CHỈ CHẠY KHI Block 1.4 đã thấy so_account_da_backup = 18
-- ────────────────────────────────────────────────────────────
UPDATE public.profiles
   SET phone = NULL
 WHERE phone IN (
   SELECT phone FROM public.profiles
   WHERE phone IS NOT NULL AND phone <> ''
   GROUP BY phone HAVING count(*) > 1
 );


-- ════════════════════════════════════════════════════════════
-- BLOCK 3: VERIFY — đã không còn duplicate
-- ════════════════════════════════════════════════════════════
SELECT
  phone,
  count(*) AS dup_count
FROM public.profiles
WHERE phone IS NOT NULL AND phone <> ''
GROUP BY phone
HAVING count(*) > 1;
-- Expected: 0 rows


-- ════════════════════════════════════════════════════════════
-- BLOCK 4: EXPORT CSV — list 18 KH cần email/Zalo nhắc cập nhật
-- ════════════════════════════════════════════════════════════
SELECT
  b.email,
  p.customer_code,
  b.display_name,
  b.phone_cleared    AS phone_cu,
  b.reason,
  p.created_at
FROM public._phone_dup_backup_2026_05_03 b
JOIN public.profiles p ON p.id = b.id
ORDER BY b.phone_cleared, p.created_at;
-- Expected: 18 rows


-- ════════════════════════════════════════════════════════════
-- ROLLBACK (emergency only)
-- ════════════════════════════════════════════════════════════
-- ⚠️ Lưu ý: rollback sẽ TẠO LẠI duplicate phones!
--
-- UPDATE public.profiles p
--    SET phone = b.phone_cleared
--   FROM public._phone_dup_backup_2026_05_03 b
--  WHERE p.id = b.id
--    AND p.phone IS NULL;
--
-- DROP TABLE public._phone_dup_backup_2026_05_03;


-- ════════════════════════════════════════════════════════════
-- CHEATSHEET
-- ════════════════════════════════════════════════════════════
-- BLOCK 1.4 — backup
--   so_account_da_backup = 18  → ok, tiếp Block 2
--   = 0                         → KHÔNG chạy Block 2
--
-- BLOCK 2 — UPDATE
--   "UPDATE 18"  → đúng
--   "UPDATE 0"   → có vấn đề
--
-- BLOCK 3 — verify
--   0 rows  → ✅ thành công
--   N rows  → ❌ debug
--
-- BLOCK 4 — export CSV
--   18 rows  → list KH cần email/Zalo
-- ════════════════════════════════════════════════════════════
-- SAU KHI HOÀN TẤT:
--   1. CSV export → mail-merge → gửi 18 KH (xem CUSTOMER-OUTREACH-DUPLICATE-PHONE.md)
--   2. Quay lại migration phone-login V1 → Step 3 unique index (giờ đã sạch)
--   3. Frontend (đã build): KH login bằng email → modal prompt cập nhật phone
-- ════════════════════════════════════════════════════════════
