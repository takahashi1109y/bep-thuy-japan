-- ════════════════════════════════════════════════════════════
-- PHONE BACKFILL — chuẩn hóa phone cũ về format 11 digits JP local
-- Created: 2026-05-03
-- Mục đích: convert tất cả phone đã đăng ký (có dấu, +81, 81-prefix)
--           về dạng chuẩn `09xxxxxxxxx` (11 digits liền, prefix 0)
--
-- 👉 Cách dùng:
--   1. Mở: https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
--   2. Chạy TỪNG BLOCK theo thứ tự 1 → 6, KHÔNG skip block nào
--   3. Block 3 (BACKUP) BẮT BUỘC chạy trước Block 4 (UPDATE) — để rollback được
--   4. Sau block 2 (DRY-RUN), anh review kết quả TRƯỚC khi sang block 4
--
-- ⚠️  TUYỆT ĐỐI KHÔNG paste cả file 1 lần — phải dừng review giữa block 2 và 4.
-- ⚠️  Chạy trong giờ ít traffic (đêm/sáng sớm) — UPDATE lock rows ngắn.
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- BLOCK 1: PRE-CHECK — đếm khách hàng theo từng loại format
-- ════════════════════════════════════════════════════════════
-- Mục đích: anh biết scope của backfill — bao nhiêu KH cần fix.
-- Action sau khi chạy:
--   - Nếu sai_format = 0  → DB đã sạch, KHÔNG cần chạy các block sau, dừng ở đây.
--   - Nếu sai_format > 0  → tiếp tục Block 2 (dry-run review).
-- ────────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (
    WHERE phone IS NOT NULL
      AND phone <> ''
      AND (phone ~ '\D' OR length(regexp_replace(phone, '\D', '', 'g')) <> 11)
  )                                                                 AS sai_format,

  count(*) FILTER (
    WHERE phone ~ '^0\d{10}$'
  )                                                                 AS dung_format,

  count(*) FILTER (
    WHERE phone IS NULL OR phone = ''
  )                                                                 AS phone_trong,

  count(*)                                                          AS tong_so
FROM public.profiles;


-- ════════════════════════════════════════════════════════════
-- BLOCK 2: DRY-RUN — preview mapping phone_cu → phone_moi cho từng KH
-- ════════════════════════════════════════════════════════════
-- Mục đích: anh xem TRƯỚC khi UPDATE, kiểm tra có ai bị set NULL nhầm không.
-- Logic chuẩn hóa (giống Block 4):
--   - Nhánh A: 11 digits, đầu 0  (vd 090-4237-6886 → 09042376886) → strip-only
--   - Nhánh B: 12 digits, prefix 81 (vd +81 90-4237-6886 → 819042376886) → drop 81, prepend 0
--   - Nhánh C: data còn lại không cứu được → set NULL, anh liên hệ khách
--
-- Cột `chan_doan`:
--   ✅ "Tự động normalize OK"          → strip dấu xong là chuẩn
--   🔄 "Convert E.164 → JP local OK"   → +81/81 prefix → 0
--   ❌ "Không cứu được — set NULL"     → cần liên hệ khách thủ công
-- ────────────────────────────────────────────────────────────
SELECT
  p.id,
  p.display_name,
  p.phone                                              AS phone_cu,
  CASE
    WHEN regexp_replace(p.phone, '\D', '', 'g') ~ '^0\d{10}$'
      THEN regexp_replace(p.phone, '\D', '', 'g')
    WHEN length(regexp_replace(p.phone, '\D', '', 'g')) = 12
     AND regexp_replace(p.phone, '\D', '', 'g') LIKE '81%'
      THEN '0' || substring(regexp_replace(p.phone, '\D', '', 'g') FROM 3)
    ELSE NULL
  END                                                  AS phone_moi,
  CASE
    WHEN regexp_replace(p.phone, '\D', '', 'g') ~ '^0\d{10}$'
      THEN '✅ Tự động normalize OK'
    WHEN length(regexp_replace(p.phone, '\D', '', 'g')) = 12
     AND regexp_replace(p.phone, '\D', '', 'g') LIKE '81%'
      THEN '🔄 Convert E.164 → JP local OK'
    ELSE '❌ Không cứu được — set NULL, cần liên hệ khách'
  END                                                  AS chan_doan,
  u.email,
  p.created_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.phone IS NOT NULL
  AND p.phone <> ''
  AND (
        p.phone ~ '\D'
     OR length(p.phone) <> 11
  )
ORDER BY chan_doan DESC, p.created_at DESC;


-- ════════════════════════════════════════════════════════════
-- BLOCK 3: BACKUP — lưu phone gốc trước UPDATE (BẮT BUỘC, không skip)
-- ════════════════════════════════════════════════════════════
-- Mục đích: nếu UPDATE block 4 sai → có table này để rollback.
-- Đặc điểm:
--   - Tên có suffix `_2026_05_03` → có thể chạy nhiều wave nếu cần
--   - CREATE TABLE IF NOT EXISTS → idempotent, an toàn chạy lại
--   - INSERT chỉ rows có phone NOT NULL & NOT empty
-- ⚠️  PHẢI thấy "Success" + count > 0 ở 3 query con TRƯỚC khi sang Block 4.
-- ────────────────────────────────────────────────────────────

-- 3.1) Tạo bảng backup (nếu chưa có)
CREATE TABLE IF NOT EXISTS public._phone_backfill_backup_2026_05_03 (
  id             uuid        PRIMARY KEY,
  phone_original text        NOT NULL,
  phone_new      text,
  backfill_at    timestamptz DEFAULT now()
);

-- 3.1.1) SECURITY: enable RLS + revoke grants để bảng KHÔNG bị leak
-- (bảng này chứa phone gốc của TẤT CẢ khách → CHỈ admin SQL Editor được query)
-- Reference: SECURITY-AUDIT-PHONE-LOGIN-V2.md Concern #1 (HIGH)
ALTER TABLE public._phone_backfill_backup_2026_05_03 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._phone_backfill_backup_2026_05_03 FROM anon, authenticated;
-- Postgres role (anh dùng SQL Editor) vẫn full access vì là superuser bypass RLS

-- 3.2) Insert snapshot (idempotent — ON CONFLICT DO NOTHING)
INSERT INTO public._phone_backfill_backup_2026_05_03 (id, phone_original, phone_new)
SELECT
  p.id,
  p.phone AS phone_original,
  CASE
    WHEN regexp_replace(p.phone, '\D', '', 'g') ~ '^0\d{10}$'
      THEN regexp_replace(p.phone, '\D', '', 'g')
    WHEN length(regexp_replace(p.phone, '\D', '', 'g')) = 12
     AND regexp_replace(p.phone, '\D', '', 'g') LIKE '81%'
      THEN '0' || substring(regexp_replace(p.phone, '\D', '', 'g') FROM 3)
    ELSE NULL
  END   AS phone_new
FROM public.profiles p
WHERE p.phone IS NOT NULL
  AND p.phone <> ''
ON CONFLICT (id) DO NOTHING;

-- 3.3) Verify backup có data
SELECT
  count(*)                                                        AS so_dong_backup,
  count(*) FILTER (WHERE phone_new IS NULL)                       AS so_dong_se_set_null,
  count(*) FILTER (WHERE phone_new IS NOT NULL
                     AND phone_new <> phone_original)             AS so_dong_se_doi_format,
  count(*) FILTER (WHERE phone_new = phone_original)              AS so_dong_da_dung_format
FROM public._phone_backfill_backup_2026_05_03;


-- ════════════════════════════════════════════════════════════
-- BLOCK 4: UPDATE THẬT — backfill phone về format chuẩn
-- ════════════════════════════════════════════════════════════
-- ⚠️  CHỈ CHẠY KHI:
--   - Block 1 đã thấy `sai_format > 0`
--   - Block 2 dry-run đã review xong, không có case bất thường
--   - Block 3 backup table đã có `so_dong_backup > 0`
-- ────────────────────────────────────────────────────────────
UPDATE public.profiles
   SET phone = CASE
     WHEN regexp_replace(phone, '\D', '', 'g') ~ '^0\d{10}$'
       THEN regexp_replace(phone, '\D', '', 'g')
     WHEN length(regexp_replace(phone, '\D', '', 'g')) = 12
      AND regexp_replace(phone, '\D', '', 'g') LIKE '81%'
       THEN '0' || substring(regexp_replace(phone, '\D', '', 'g') FROM 3)
     ELSE NULL
   END
 WHERE phone IS NOT NULL
   AND phone <> ''
   AND (
         phone ~ '\D'
      OR length(phone) <> 11
   );


-- ════════════════════════════════════════════════════════════
-- BLOCK 5: POST-CHECK — verify backfill thành công
-- ════════════════════════════════════════════════════════════
-- Kết quả mong đợi:
--   - dung_format_sau_backfill   = (dung_format + sai_format ✅ + 🔄 từ Block 2)
--   - phone_NULL_sau_backfill    = (phone_trong cũ + số ❌ ở Block 2)
--   - van_sai_format             = 0  ← QUAN TRỌNG, phải = 0
-- ────────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE phone ~ '^0\d{10}$')                AS dung_format_sau_backfill,
  count(*) FILTER (WHERE phone IS NULL OR phone = '')        AS phone_NULL_sau_backfill,
  count(*) FILTER (
    WHERE phone IS NOT NULL
      AND phone <> ''
      AND (phone ~ '\D' OR length(phone) <> 11)
  )                                                          AS van_sai_format,
  count(*)                                                   AS tong_so
FROM public.profiles;


-- ════════════════════════════════════════════════════════════
-- BLOCK 6: EXPORT — list khách cần liên hệ thông báo cập nhật phone
-- ════════════════════════════════════════════════════════════
-- Mục đích: KH có phone bị set NULL ở Block 4 → cần email/Zalo nhắc.
-- Cách export ra CSV (Supabase Studio):
--   1. Click "Run" để xem kết quả
--   2. Click icon "Download CSV" góc phải bảng kết quả
--   3. File CSV → mở Excel/Google Sheets → mail-merge gửi khách
-- ────────────────────────────────────────────────────────────
SELECT
  u.email,
  p.customer_code,
  p.display_name,
  b.phone_original,
  p.phone                              AS phone_after_backfill,
  p.created_at
FROM public.profiles p
JOIN auth.users u                                ON u.id = p.id
JOIN public._phone_backfill_backup_2026_05_03 b  ON b.id = p.id
WHERE p.phone IS NULL          -- bị set NULL bởi backfill
  AND b.phone_original IS NOT NULL
ORDER BY p.created_at DESC;


-- ════════════════════════════════════════════════════════════
-- ROLLBACK (nếu UPDATE sai — chỉ dùng trong emergency)
-- ════════════════════════════════════════════════════════════
-- UPDATE public.profiles p
--    SET phone = b.phone_original
--   FROM public._phone_backfill_backup_2026_05_03 b
--  WHERE p.id = b.id;
--
-- Sau khi rollback, có thể drop bảng backup:
-- DROP TABLE public._phone_backfill_backup_2026_05_03;
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- CHEATSHEET ĐỌC NHANH KẾT QUẢ
-- ════════════════════════════════════════════════════════════
-- BLOCK 1 — biết scope
--   sai_format = 0       → DB sạch, KHÔNG chạy block 2-6
--   sai_format > 0       → tiếp tục
--
-- BLOCK 2 — dry-run
--   Đếm ❌. Nếu nhiều bất thường → STOP, ping em.
--
-- BLOCK 3 — backup
--   so_dong_backup > 0   → ok, tiếp Block 4
--   so_dong_backup = 0   → có vấn đề, không chạy Block 4
--
-- BLOCK 4 — UPDATE
--   "UPDATE N"           → N = sai_format ở Block 1
--
-- BLOCK 5 — verify
--   van_sai_format = 0   → ✅ thành công
--   van_sai_format > 0   → ❌ có row fail, debug
--
-- BLOCK 6 — export CSV
--   N rows               → list KH cần email/Zalo
--   0 rows               → không ai bị mất phone, hoàn hảo
-- ════════════════════════════════════════════════════════════
