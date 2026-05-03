-- ════════════════════════════════════════════════════════════
-- UPDATE USER PHONE RPC (2026-05-03)
-- KH tự update phone qua frontend (modal mandatory sau login email)
-- Validate format ^0\d{10}$ + check unique + update profile
--
-- PRECONDITION:
--   - supabase-phone-login.sql đã chạy (UNIQUE index + trigger).
--   - supabase-phone-login-v2.sql đã chạy (normalize_phone v2).
--   - supabase-phone-resolve-duplicates.sql đã chạy (clear dup phones).
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- BLOCK 1: Function definition — update_user_phone(p_phone)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_user_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid          uuid;
  v_normalized   text;
  v_existing_uid uuid;
BEGIN
  -- Step 1: Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'NOT_AUTHENTICATED',
      'message', 'Anh/chị chưa đăng nhập. Vui lòng đăng nhập lại rồi thử.'
    );
  END IF;

  -- Step 2: Empty/NULL guard
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'EMPTY_PHONE',
      'message', 'Số điện thoại không được để trống.'
    );
  END IF;

  -- Step 3: Normalize
  v_normalized := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_normalized) = 12 AND v_normalized LIKE '81%' THEN
    v_normalized := '0' || substring(v_normalized FROM 3);
  END IF;

  -- Step 4: Validate STRICT 11 digits start với 0
  IF v_normalized !~ '^0\d{10}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'INVALID_FORMAT',
      'message', 'Số điện thoại phải là 11 số viết liền nhau, bắt đầu bằng 0 (ví dụ 09042376886).'
    );
  END IF;

  -- Step 5: Unique pre-check (race-safe với UNIQUE INDEX backstop ở Step 6)
  SELECT id INTO v_existing_uid
    FROM public.profiles
   WHERE phone = v_normalized
     AND id <> v_uid
   LIMIT 1;

  IF v_existing_uid IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'DUPLICATE',
      'message', 'Số điện thoại này đã được tài khoản khác sử dụng. Vui lòng nhập số khác hoặc liên hệ Bếp Thuỷ qua Zalo nếu nghĩ là nhầm.'
    );
  END IF;

  -- Step 6: UPDATE với EXCEPTION cho race condition
  BEGIN
    UPDATE public.profiles
       SET phone = v_normalized
     WHERE id = v_uid;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error',   'DUPLICATE',
        'message', 'Số điện thoại này vừa được tài khoản khác đăng ký. Vui lòng nhập số khác.'
      );
  END;

  -- Step 7: Success
  RETURN jsonb_build_object(
    'success', true,
    'phone',   v_normalized,
    'message', 'Cập nhật số điện thoại thành công.'
  );
END;
$$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 2: Permissions — chỉ authenticated, KHÔNG cho anon
-- ════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.update_user_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_phone(text) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- BLOCK 3: Verify
-- ════════════════════════════════════════════════════════════
SELECT proname,
       pg_get_function_identity_arguments(oid) AS args,
       prosecdef                               AS is_security_definer
  FROM pg_proc
 WHERE proname = 'update_user_phone'
   AND pronamespace = 'public'::regnamespace;
-- Expected: 1 row, is_security_definer = true


-- ════════════════════════════════════════════════════════════
-- BLOCK 4: Test cases (COMMENTED OUT để tránh chạy nhầm cả file)
-- ⚠️  KHÔNG paste cả file — chỉ paste Block 1, 2, 3 sequentially.
-- Block 4 dưới đây CHỈ DÙNG để copy 1 dòng test riêng khi cần.
-- ⚠️  Test trên SQL Editor (postgres role) sẽ trả NOT_AUTHENTICATED
-- vì auth.uid() = NULL. Cách test thật:
--   1. Login frontend bằng tài khoản test → modal phone-update mở
--   2. DevTools Console: await sb.rpc('update_user_phone', { p_phone: '09042376886' })
-- HOẶC trong SQL Editor:
--   SELECT set_config('request.jwt.claim.sub', '<uuid_test_user>', true);
--   SELECT public.update_user_phone('09042376886');
-- ════════════════════════════════════════════════════════════

-- SELECT public.update_user_phone('09042376886')      AS test_1_canonical;
-- SELECT public.update_user_phone('090-4237-6886')    AS test_2_with_dashes;     -- success (auto strip)
-- SELECT public.update_user_phone('+819042376886')    AS test_3_e164;            -- success (auto convert)
-- SELECT public.update_user_phone('1234567890')       AS test_4_short;           -- INVALID_FORMAT
-- SELECT public.update_user_phone('12345678901')      AS test_5_no_zero;         -- INVALID_FORMAT
-- SELECT public.update_user_phone('')                 AS test_6_empty;           -- EMPTY_PHONE
-- SELECT public.update_user_phone(NULL)               AS test_7_null;            -- EMPTY_PHONE
-- SELECT public.update_user_phone('   ')              AS test_8_whitespace;      -- EMPTY_PHONE
-- SELECT public.update_user_phone('abc')              AS test_9_letters;         -- INVALID_FORMAT
