-- ════════════════════════════════════════════════════════════
-- DIAGNOSE PHONE LOGIN (2026-05-03)
-- Mục đích: tìm root cause "phone login không được"
--
-- 👉 Cách dùng:
--   1. Mở: https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
--   2. Paste TỪNG block một (block 1 → block 8), click "Run"
--   3. Đọc cột `chan_doan` ở mỗi block để biết status
--   4. Copy kết quả gửi lại em → em phân tích root cause
--
-- ⚠️ TUYỆT ĐỐI KHÔNG paste cả file 1 lúc — phải chạy từng block để
--    đọc kết quả riêng từng cái.
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- BLOCK 1: RPC find_email_by_phone có tồn tại trong DB chưa?
-- ════════════════════════════════════════════════════════════
-- Kết quả mong đợi:
--   ✅ 1 row trả về với chan_doan = "Tồn tại"  → migration đã chạy bước 5
--   ❌ 0 rows                                    → migration CHƯA chạy → root cause #1
-- ────────────────────────────────────────────────────────────
SELECT
  proname                                  AS function_name,
  prosecdef                                AS is_security_definer,
  pg_get_function_arguments(oid)           AS args,
  pg_get_function_result(oid)              AS return_type,
  '✅ Tồn tại — migration STEP 5 đã chạy' AS chan_doan
FROM pg_proc
WHERE proname = 'find_email_by_phone'
  AND pronamespace = 'public'::regnamespace;
-- 👉 Nếu BLOCK 1 trả 0 rows: dừng diagnose, báo em ngay.
--    Có nghĩa migration supabase-phone-login.sql CHƯA chạy → đó là root cause.


-- ════════════════════════════════════════════════════════════
-- BLOCK 2: Trigger trg_normalize_phone có active không?
-- ════════════════════════════════════════════════════════════
-- Kết quả mong đợi:
--   ✅ 1 row, tgenabled = 'O' (Origin = enabled) → trigger OK
--   ❌ 0 rows                                     → migration STEP 4 chưa chạy
-- ────────────────────────────────────────────────────────────
SELECT
  tgname                       AS trigger_name,
  tgrelid::regclass            AS table_name,
  tgenabled                    AS enabled_status,
  CASE tgenabled
    WHEN 'O' THEN '✅ Enabled (Origin)'
    WHEN 'D' THEN '❌ DISABLED'
    WHEN 'R' THEN '⚠️ Replica only'
    WHEN 'A' THEN '✅ Always enabled'
    ELSE      '🤔 Unknown: ' || tgenabled::text
  END                          AS chan_doan
FROM pg_trigger
WHERE tgname = 'trg_normalize_phone'
  AND NOT tgisinternal;


-- ════════════════════════════════════════════════════════════
-- BLOCK 3: Unique partial index idx_profiles_phone_unique?
-- ════════════════════════════════════════════════════════════
-- Kết quả mong đợi:
--   ✅ 1 row, indisunique = true             → constraint OK
--   ❌ 0 rows                                  → migration STEP 3 chưa chạy
-- ────────────────────────────────────────────────────────────
SELECT
  i.relname                              AS index_name,
  t.relname                              AS table_name,
  ix.indisunique                         AS is_unique,
  pg_get_indexdef(ix.indexrelid)         AS definition,
  CASE
    WHEN ix.indisunique THEN '✅ Unique partial index OK'
    ELSE '⚠️ Index có nhưng KHÔNG unique'
  END                                    AS chan_doan
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
WHERE i.relname = 'idx_profiles_phone_unique'
  AND t.relname = 'profiles';


-- ════════════════════════════════════════════════════════════
-- BLOCK 4: Phone của anh `09042376886` đang lưu format gì?
-- ════════════════════════════════════════════════════════════
-- Kết quả mong đợi:
--   ✅ phone_in_db = '09042376886', email_confirmed = true → đăng ký xong, format chuẩn
--   ⚠️ phone_in_db = '090-4237-6886' hoặc tương tự         → cần backfill
--   ❌ 0 rows                                                → phone của anh CHƯA có trong DB
-- ────────────────────────────────────────────────────────────
SELECT
  p.id,
  p.phone                                            AS phone_in_db,
  length(coalesce(p.phone, ''))                     AS phone_length,
  regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') AS phone_after_strip,
  u.email,
  u.email_confirmed_at IS NOT NULL                  AS email_confirmed,
  p.display_name,
  p.created_at,
  CASE
    WHEN p.phone IS NULL OR p.phone = ''      THEN '❌ Phone trống — chưa có'
    WHEN p.phone = '09042376886'              THEN '✅ Đúng format chuẩn (11 digits liền)'
    WHEN p.phone ~ '\D'                       THEN '⚠️ Có ký tự không phải số (-/space/+) → cần backfill'
    WHEN length(p.phone) <> 11                THEN '⚠️ Toàn số nhưng KHÔNG đủ 11 digits'
    ELSE                                          '🤔 Format khác — em xem cụ thể'
  END                                                AS chan_doan_format
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE
     p.phone LIKE '%4237%'
  OR p.phone LIKE '%9042376886%'
  OR regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = '09042376886';


-- ════════════════════════════════════════════════════════════
-- BLOCK 5: Test RPC trực tiếp với phone của anh
-- ════════════════════════════════════════════════════════════
-- Kết quả mong đợi:
--   ✅ trả 1 row với email = '...@...' và chan_doan = "RPC OK trả email"
--      → RPC chạy, frontend chỉ cần gọi đúng tên function
--   ⚠️ trả 1 row với email = NULL
--      → RPC chạy nhưng phone không match record nào → format DB khác
--   ❌ Lỗi "function public.find_email_by_phone(text) does not exist"
--      → migration CHƯA chạy → root cause #1
-- ────────────────────────────────────────────────────────────
SELECT
  public.find_email_by_phone('09042376886') AS email_tra_ve,
  CASE
    WHEN public.find_email_by_phone('09042376886') IS NULL
      THEN '⚠️ NULL — phone không match profile nào (format DB khác hoặc chưa đăng ký)'
    ELSE '✅ RPC OK trả email — phone login phải work'
  END AS chan_doan;


-- ════════════════════════════════════════════════════════════
-- BLOCK 6: Đếm số khách hàng có phone format SAI cần backfill
-- ════════════════════════════════════════════════════════════
-- Kết quả mong đợi:
--   ✅ so_KH_phone_co_dau_can_backfill = 0
--      AND so_KH_phone_digits_nhung_khong_11_so = 0
--      → Toàn bộ phone đã chuẩn 11 digits liền, không cần backfill
--   ⚠️ so_KH_phone_co_dau_can_backfill > 0
--      → Cần chạy UPDATE strip non-digits (xem agent backfill)
-- ────────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (
    WHERE phone IS NOT NULL AND phone <> '' AND phone ~ '\D'
  ) AS so_KH_phone_co_dau_can_backfill,

  count(*) FILTER (
    WHERE phone IS NOT NULL AND phone <> ''
      AND length(phone) <> 11
      AND phone ~ '^\d+$'
  ) AS so_KH_phone_digits_nhung_khong_11_so,

  count(*) FILTER (
    WHERE phone IS NULL OR phone = ''
  ) AS so_KH_phone_trong,

  count(*) FILTER (
    WHERE phone ~ '^0\d{10}$'
  ) AS so_KH_dung_chuan_11_digits,

  count(*) FILTER (
    WHERE phone LIKE '+81%'
  ) AS so_KH_phone_E164_plus_81,

  count(*) AS tong_so_profiles
FROM public.profiles;


-- ════════════════════════════════════════════════════════════
-- BLOCK 7: List 20 KH gần nhất có phone format SAI (cụ thể từng người)
-- ════════════════════════════════════════════════════════════
-- Mục đích: cho anh xem case cụ thể trước khi quyết định backfill.
-- Kết quả mong đợi:
--   ✅ 0 rows                                  → tất cả phone đều chuẩn
--   ⚠️ N rows với loai_loi cụ thể             → cần backfill (xem agent backfill)
-- ────────────────────────────────────────────────────────────
SELECT
  p.id,
  p.phone                                              AS phone_hien_tai,
  regexp_replace(p.phone, '\D', '', 'g')               AS phone_sau_strip,
  length(regexp_replace(p.phone, '\D', '', 'g'))       AS digits_count,
  u.email,
  p.display_name,
  p.created_at,
  CASE
    WHEN p.phone ~ '-'                                 THEN 'Có dấu gạch (vd 090-4237-6886)'
    WHEN p.phone ~ ' '                                 THEN 'Có dấu cách'
    WHEN p.phone LIKE '+81%'                           THEN 'Format E.164 (+81xxx)'
    WHEN p.phone LIKE '81%' AND p.phone !~ '\D'        THEN 'Có prefix 81 (không +)'
    WHEN p.phone ~ '\D'                                THEN 'Có ký tự đặc biệt khác'
    WHEN length(p.phone) <> 11                         THEN 'Số nhưng không đủ 11 digits (' || length(p.phone)::text || ')'
    ELSE                                                    'Khác'
  END                                                  AS loai_loi
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE
      p.phone IS NOT NULL
  AND p.phone <> ''
  AND (
        p.phone ~ '\D'
     OR length(regexp_replace(p.phone, '\D', '', 'g')) <> 11
  )
ORDER BY p.created_at DESC
LIMIT 20;


-- ════════════════════════════════════════════════════════════
-- BLOCK 8: Check duplicate phone (sau khi normalize)
-- ════════════════════════════════════════════════════════════
-- Mục đích: sau khi strip non-digits, có 2 user nào share cùng số phone không?
-- Kết quả mong đợi:
--   ✅ 0 rows  → không duplicate, có thể tạo unique index an toàn
--   ⚠️ N rows → phải xử lý duplicate TRƯỚC khi backfill (clear phone của 1 user)
-- ────────────────────────────────────────────────────────────
SELECT
  regexp_replace(phone, '\D', '', 'g')               AS phone_normalized,
  count(*)                                           AS so_account_trung,
  array_agg(p.id ORDER BY p.created_at)              AS user_ids,
  array_agg(p.display_name ORDER BY p.created_at)    AS display_names,
  array_agg(p.created_at ORDER BY p.created_at)      AS created_dates,
  '⚠️ Duplicate — cần clear phone của user dư thừa' AS chan_doan
FROM public.profiles p
WHERE phone IS NOT NULL AND phone <> ''
GROUP BY regexp_replace(phone, '\D', '', 'g')
HAVING count(*) > 1
ORDER BY count(*) DESC;


-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- TÓM TẮT KẾT QUẢ MONG ĐỢI (cheatsheet đọc nhanh)
-- ════════════════════════════════════════════════════════════
--
-- BLOCK 1 (RPC tồn tại?)
--   ✅ 1 row "Tồn tại"          → migration STEP 5 đã chạy
--   ❌ 0 rows                    → ⛔ ROOT CAUSE #1: migration CHƯA chạy
--                                  → Action: anh chạy file supabase-phone-login.sql
--
-- BLOCK 2 (Trigger active?)
--   ✅ 1 row enabled             → STEP 4 OK
--   ❌ 0 rows                    → migration STEP 4 chưa chạy
--
-- BLOCK 3 (Unique index?)
--   ✅ 1 row indisunique=true   → STEP 3 OK
--   ❌ 0 rows                    → migration STEP 3 chưa chạy
--
-- BLOCK 4 (Phone của anh format gì?)
--   ✅ phone_in_db='09042376886', email_confirmed=true → format chuẩn
--   ⚠️ phone_in_db có dấu/space/+81  → ⛔ ROOT CAUSE #2: cần backfill
--   ❌ 0 rows                                        → phone anh chưa có trong DB
--   ⚠️ email_confirmed=false                        → ⛔ ROOT CAUSE phụ: chưa verify email
--
-- BLOCK 5 (Test RPC end-to-end)
--   ✅ Trả email                 → RPC + format đều OK → bug ở frontend
--   ⚠️ Trả NULL                  → format DB không match → cần backfill
--   ❌ Error "function not exist" → migration chưa chạy
--
-- BLOCK 6 (Đếm KH cần backfill)
--   so_KH_phone_co_dau_can_backfill = 0  → DB sạch
--   so_KH_phone_co_dau_can_backfill > 0  → cần chạy backfill UPDATE
--
-- BLOCK 7 (List cụ thể KH sai format)
--   0 rows → tất cả phone đã chuẩn
--   N rows → từng user cụ thể, xem loai_loi để biết pattern lỗi
--
-- BLOCK 8 (Duplicate?)
--   0 rows → không duplicate, an toàn backfill
--   N rows → phải clear phone của user dư thừa TRƯỚC backfill
--
-- ════════════════════════════════════════════════════════════
-- CÁC ROOT CAUSE CÓ THỂ (theo thứ tự ưu tiên kiểm tra):
--   1. Migration phone-login chưa chạy (BLOCK 1, 2, 3 đều ❌)
--   2. Phone DB lưu format có dấu, RPC strip nhưng vẫn không match
--      → Cần backfill (BLOCK 4 ⚠️ hoặc BLOCK 6 > 0)
--   3. Phone của anh chưa có trong profiles (BLOCK 4 ❌ 0 rows)
--   4. Email chưa confirmed → Supabase chặn signIn (BLOCK 4 email_confirmed=false)
--   5. Frontend gọi sai tên RPC / sai params (BLOCK 1, 5 đều ✅ → bug ở client)
-- ════════════════════════════════════════════════════════════
