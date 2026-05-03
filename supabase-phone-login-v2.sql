-- ════════════════════════════════════════════════════════════
-- PHONE LOGIN V2 (2026-05-03) — Quy chuẩn JP phone = 11 digits
--
-- Improvements vs v1 (supabase-phone-login.sql):
-- 1. normalize_phone trigger: convert +81 E.164 → 0 prefix,
--    validate strict ^0\d{10}$, set NULL nếu format sai
-- 2. RPC find_email_by_phone: validate strict 11 digits start với 0,
--    anti-enumeration (không cho query bằng partial)
-- 3. Idempotent: CREATE OR REPLACE FUNCTION → safe re-run
--
-- PRECONDITION: v1 (supabase-phone-login.sql) đã chạy thành công
--   (UNIQUE index, trigger trg_normalize_phone đã exist).
--
-- KHÔNG có backfill data trong file này — xem `supabase-phone-backfill.sql`.
--
-- Run sequentially trên Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- BLOCK 1: Update normalize_phone() trigger function
-- Trigger trg_normalize_phone từ v1 vẫn point đến function này,
-- nên chỉ cần REPLACE function body, không cần DROP/CREATE trigger lại.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.normalize_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_digits text;
BEGIN
  -- NULL hoặc empty → set NULL, không validate
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    NEW.phone := NULL;
    RETURN NEW;
  END IF;

  -- Strip non-digits
  v_digits := regexp_replace(NEW.phone, '\D', '', 'g');

  -- Convert E.164 +81 → 0 prefix
  -- +819042376886 (after strip = 12 digits "819042376886") → 09042376886 (11 digits)
  IF length(v_digits) = 12 AND v_digits LIKE '81%' THEN
    v_digits := '0' || substring(v_digits FROM 3);
  END IF;

  -- Validate: phải đúng 11 digits start với 0 (quy chuẩn JP)
  IF v_digits ~ '^0\d{10}$' THEN
    NEW.phone := v_digits;
  ELSE
    -- Format không hợp lệ → set NULL để tránh lưu data rác.
    -- Frontend đã validate trước, đây là safety net DB-level.
    NEW.phone := NULL;
  END IF;

  RETURN NEW;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 2: Update RPC find_email_by_phone(p_phone text)
-- Tolerant với format input (dấu cách/dash/+81/no-prefix)
-- nhưng STRICT validate sau normalize: phải đúng 11 digits start với 0.
-- Anti-enumeration: không cho query bằng số ngắn / partial.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.find_email_by_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_normalized text;
  v_email      text;
BEGIN
  -- Guard: NULL hoặc empty
  IF p_phone IS NULL OR p_phone = '' THEN
    RETURN NULL;
  END IF;

  -- Strip non-digits
  v_normalized := regexp_replace(p_phone, '\D', '', 'g');

  -- Convert +81 E.164 → 0 prefix (cùng logic trigger để consistent)
  IF length(v_normalized) = 12 AND v_normalized LIKE '81%' THEN
    v_normalized := '0' || substring(v_normalized FROM 3);
  END IF;

  -- Validate STRICT: phải đúng 11 digits start với 0
  -- Đây là anti-enumeration: không cho dùng RPC này để guess số ngắn.
  IF v_normalized !~ '^0\d{10}$' THEN
    RETURN NULL;
  END IF;

  -- Lookup email (chỉ trả email, không leak field khác của profiles)
  SELECT u.email INTO v_email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE p.phone = v_normalized
   LIMIT 1;

  RETURN v_email;  -- NULL nếu không tìm thấy
END;
$$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 3: Re-grant permissions (idempotent)
-- ════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.find_email_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_email_by_phone(text) TO anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- BLOCK 4: Verify changes — kiểm tra function source đã update
-- ════════════════════════════════════════════════════════════
SELECT proname,
       pg_get_function_identity_arguments(oid) AS args,
       prosecdef AS is_security_definer
  FROM pg_proc
 WHERE proname IN ('normalize_phone', 'find_email_by_phone')
   AND pronamespace = 'public'::regnamespace
 ORDER BY proname;


-- ════════════════════════════════════════════════════════════
-- BLOCK 5: Test RPC — chạy từng dòng để verify
-- (Yêu cầu: profile của anh đang có phone = '09042376886' trong DB)
-- ════════════════════════════════════════════════════════════
SELECT public.find_email_by_phone('09042376886')      AS test_1_canonical;       -- expect: anh's email
SELECT public.find_email_by_phone('090-4237-6886')    AS test_2_with_dashes;     -- expect: anh's email
SELECT public.find_email_by_phone('090 4237 6886')    AS test_3_with_spaces;     -- expect: anh's email
SELECT public.find_email_by_phone('+819042376886')    AS test_4_e164_plus;       -- expect: anh's email
SELECT public.find_email_by_phone('819042376886')     AS test_5_e164_no_plus;    -- expect: anh's email
SELECT public.find_email_by_phone('+81 90-4237-6886') AS test_6_e164_messy;      -- expect: anh's email
SELECT public.find_email_by_phone('1234567890')       AS test_7_short_10digits;  -- expect: NULL (10 digits)
SELECT public.find_email_by_phone('12345678901')      AS test_8_no_zero_prefix;  -- expect: NULL (start 1)
SELECT public.find_email_by_phone('123456789012')     AS test_9_12digits_no_81;  -- expect: NULL
SELECT public.find_email_by_phone('')                 AS test_10_empty;          -- expect: NULL
SELECT public.find_email_by_phone(NULL)               AS test_11_null;           -- expect: NULL
SELECT public.find_email_by_phone('abc')              AS test_12_non_digits;     -- expect: NULL

-- Nếu test_1 → test_6 đều trả về email anh + test_7 → test_12 đều NULL → DEPLOY OK.
