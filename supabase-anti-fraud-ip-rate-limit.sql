-- ============================================================
-- P1.C — IP RATE LIMIT cho welcome bonus (2026-05-11)
-- ============================================================
-- Block claim 100d neu cung 1 IP da co > N signups trong 24h.
-- Logic: KHONG block signup → khach van tao acc, chi khong nhan bonus.
--
-- Threshold:
--   - Default 3 signups/IP/24h (cho phep gia dinh, ban be cung mang)
--   - Configurable qua function param
--
-- Storage:
--   - Add column profiles.signup_ip (text, nullable)
--   - Frontend pass IP via auth.signUp metadata
--   - Trigger handle_new_user extract va store
--
-- Idempotent — chay nhieu lan OK.
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 1: Add column profiles.signup_ip                 ║
-- ╚══════════════════════════════════════════════════════════╝

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND column_name = 'signup_ip'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN signup_ip text;
    RAISE NOTICE 'ADDED signup_ip column to profiles';
  END IF;
END $$;

-- Index cho query "same IP recent signups"
CREATE INDEX IF NOT EXISTS idx_profiles_signup_ip
  ON public.profiles(signup_ip, created_at)
 WHERE signup_ip IS NOT NULL;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 2: Update handle_new_user trigger                ║
-- ╚══════════════════════════════════════════════════════════╝
-- Extract signup_ip tu raw_user_meta_data (frontend pass them)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    customer_code,
    display_name,
    phone,
    prefecture,
    postal,
    address,
    gender,
    birthday,
    canonical_email,
    signup_ip
  )
  VALUES (
    NEW.id,
    public.generate_customer_code(),
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.raw_user_meta_data->>'prefecture',
    NEW.raw_user_meta_data->>'postal',
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'gender',
    (NEW.raw_user_meta_data->>'birthday')::date,
    public.normalize_email(NEW.email),
    NEW.raw_user_meta_data->>'signup_ip'  -- P1.C
  )
  ON CONFLICT (id) DO NOTHING;

  -- Link don guest cu qua email
  IF NEW.email IS NOT NULL THEN
    UPDATE public.orders
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND lower(customer_email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 3: Helper count_signups_same_ip                  ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.count_signups_same_ip(p_ip text, p_hours int DEFAULT 24)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
    FROM public.profiles
   WHERE signup_ip = p_ip
     AND signup_ip IS NOT NULL
     AND created_at >= now() - (p_hours || ' hours')::interval;
$$;

GRANT EXECUTE ON FUNCTION public.count_signups_same_ip(text, int) TO service_role;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 4: Update claim_welcome_bonus_by_token RPC       ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.claim_welcome_bonus_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_user_email     text;
  v_owner          uuid;
  v_already        boolean;
  v_points         int := 100;
  v_email_verified timestamptz;
  v_canonical      text;
  v_dup_claimed    boolean;
  v_user_ip        text;
  v_same_ip_count  int;
  v_max_per_ip     int := 3;  -- Toi da 3 signups/IP/24h duoc claim
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get user email + verified status
  SELECT email, email_confirmed_at INTO v_user_email, v_email_verified
    FROM auth.users WHERE id = v_user_id;

  -- D1: Check email verified
  IF v_email_verified IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_not_verified',
      'message', 'Vui long xac nhan email truoc khi nhan diem thuong');
  END IF;

  -- P1.B: Check disposable email
  IF public.is_email_blocked(v_user_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'disposable_email',
      'message', 'Email tam thoi (disposable) khong duoc nhan diem thuong. Vui long su dung email chinh thuc (Gmail, Yahoo, iCloud).');
  END IF;

  -- P1.C: Check IP rate limit (max 3 signups same IP per 24h get bonus)
  SELECT signup_ip INTO v_user_ip
    FROM public.profiles WHERE id = v_user_id;

  IF v_user_ip IS NOT NULL THEN
    SELECT public.count_signups_same_ip(v_user_ip, 24) INTO v_same_ip_count;
    IF v_same_ip_count > v_max_per_ip THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ip_rate_limited',
        'message', 'Da co qua nhieu tai khoan dang ky tu mang Internet cua ban trong 24h. Vui long lien he support@thuyjapan.com de duoc kich hoat thu cong.',
        'count', v_same_ip_count);
    END IF;
  END IF;

  -- D2: Check canonical email duplicate
  SELECT canonical_email INTO v_canonical
    FROM public.profiles WHERE id = v_user_id;

  IF v_canonical IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
       WHERE canonical_email = v_canonical
         AND id != v_user_id
         AND bonus_claimed = true
    ) INTO v_dup_claimed;

    IF v_dup_claimed THEN
      RETURN jsonb_build_object('ok', false, 'error', 'duplicate_email',
        'message', 'Email nay da duoc su dung de nhan thuong. Moi tai khoan chi duoc nhan 1 lan.');
    END IF;
  END IF;

  -- Lookup token owner
  SELECT id, bonus_claimed
    INTO v_owner, v_already
    FROM public.profiles
   WHERE bonus_token = p_token
   LIMIT 1;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF v_owner != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_your_token');
  END IF;

  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  -- Atomic test-and-set
  UPDATE public.profiles
     SET bonus_claimed        = true,
         welcome_claimed_at   = COALESCE(welcome_claimed_at, now())
   WHERE id           = v_user_id
     AND bonus_token  = p_token
     AND bonus_claimed = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  -- Award 100 diem
  INSERT INTO public.points_transactions
    (user_id, order_no, order_total, points, type, description)
  VALUES
    (v_user_id, NULL, NULL, v_points, 'welcome',
     'Thuong chao mung dang ky thanh vien');

  RETURN jsonb_build_object('ok', true, 'points', v_points);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_welcome_bonus_by_token(text) TO authenticated;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 5: VERIFY                                        ║
-- ╚══════════════════════════════════════════════════════════╝

-- 5.1: Column ton tai?
SELECT 'Q1_COLUMN' AS test,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'profiles'
            AND column_name = 'signup_ip'
       ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- 5.2: Function helper works
SELECT 'Q2_HELPER' AS test,
       public.count_signups_same_ip('1.2.3.4', 24) AS count_random_ip;
-- Expected: 0

-- 5.3: RPC has new check?
SELECT 'Q3_RPC_HAS_IP_CHECK' AS test,
       CASE WHEN routine_definition ILIKE '%ip_rate_limited%'
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'claim_welcome_bonus_by_token';

-- 5.4: Trigger handle_new_user has signup_ip?
SELECT 'Q4_TRIGGER_HAS_IP' AS test,
       CASE WHEN routine_definition ILIKE '%signup_ip%'
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'handle_new_user';
