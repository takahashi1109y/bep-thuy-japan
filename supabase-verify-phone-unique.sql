-- ============================================================
-- VERIFY: Phone UNIQUE constraint van active sau cleanup hom qua
-- ============================================================

-- Q1: Index ton tai?
SELECT 'Q1_INDEX_EXISTS' AS test,
       indexname,
       indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND indexname = 'idx_profiles_phone_unique';

-- Q2: Co duplicates phone hien tai khong?
SELECT 'Q2_DUPLICATES' AS test,
       phone,
       COUNT(*) AS num_accounts
FROM public.profiles
WHERE phone IS NOT NULL AND phone <> ''
GROUP BY phone
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;
-- Expected: 0 rows

-- Q3: Trigger normalize_phone active?
SELECT 'Q3_TRIGGER' AS test,
       tgname,
       tgenabled::text
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND tgname = 'trg_normalize_phone';

-- Q4: Statistics
SELECT 'Q4_STATS' AS test,
       COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone <> '') AS has_phone,
       COUNT(*) FILTER (WHERE phone IS NULL OR phone = '') AS no_phone,
       COUNT(*) AS total
FROM public.profiles;
