-- ============================================================
-- D2+D3: ANTI-FRAUD — CANONICAL EMAIL + GMAIL ALIAS DEDUP
-- ============================================================
-- Problem: Khach tao nhieu account voi:
--   user+1@gmail.com, user+2@gmail.com (Gmail alias)
--   u.ser@gmail.com, us.er@gmail.com (Gmail dot trick)
--   → Moi acc nhan 100 diem welcome bonus
--
-- Solution:
--   1. Add column canonical_email (normalized)
--   2. Gmail: strip +tag + remove dots from local part
--   3. Other: strip +tag only
--   4. UNIQUE constraint → block duplicate signups
--   5. Update handle_new_user trigger → auto-normalize
--
-- Idempotent — chay nhieu lan OK.
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 1: Helper function — normalize email             ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_local  text;
  v_domain text;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RETURN NULL;
  END IF;

  -- Split email into local@domain
  v_local  := split_part(lower(p_email), '@', 1);
  v_domain := split_part(lower(p_email), '@', 2);

  -- Strip +tag (e.g. user+tag → user)
  v_local := split_part(v_local, '+', 1);

  -- Gmail/Googlemail: dots in local part are ignored
  IF v_domain IN ('gmail.com', 'googlemail.com') THEN
    v_local := replace(v_local, '.', '');
  END IF;

  RETURN v_local || '@' || v_domain;
END;
$$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 2: Add column canonical_email to profiles        ║
-- ╚══════════════════════════════════════════════════════════╝

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND column_name = 'canonical_email'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN canonical_email text;
    RAISE NOTICE 'ADDED canonical_email column to profiles';
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 3: Backfill canonical_email from auth.users      ║
-- ╚══════════════════════════════════════════════════════════╝

UPDATE public.profiles p
   SET canonical_email = public.normalize_email(u.email)
  FROM auth.users u
 WHERE u.id = p.id
   AND (p.canonical_email IS NULL OR p.canonical_email = '');

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 4: Check for duplicates BEFORE adding constraint ║
-- ╚══════════════════════════════════════════════════════════╝

-- This query shows duplicates. If >0 rows, anh needs to decide
-- which accounts to keep before adding UNIQUE constraint.
SELECT 'DUPLICATE CHECK' AS test,
       canonical_email,
       COUNT(*) AS num_accounts,
       array_agg(p.id::text) AS user_ids
  FROM public.profiles p
 WHERE canonical_email IS NOT NULL
 GROUP BY canonical_email
HAVING COUNT(*) > 1
 ORDER BY COUNT(*) DESC;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 5: UNIQUE constraint (chi chay neu Section 4=0)  ║
-- ╚══════════════════════════════════════════════════════════╝
-- IMPORTANT: Neu Section 4 tra ve duplicates, KHONG chay Section 5!
-- Gui ket qua Section 4 cho em de xu ly truoc.

-- Uncomment khi da xac nhan KHONG co duplicates:

-- DROP INDEX IF EXISTS idx_profiles_canonical_email;
-- CREATE UNIQUE INDEX idx_profiles_canonical_email
--     ON public.profiles (canonical_email)
--  WHERE canonical_email IS NOT NULL;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 6: Update handle_new_user trigger                ║
-- ╚══════════════════════════════════════════════════════════╝

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
    canonical_email
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
    public.normalize_email(NEW.email)
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
-- ║ SECTION 7: Update claim_welcome_bonus — check canonical  ║
-- ╚══════════════════════════════════════════════════════════╝
-- Them check: neu canonical_email da co account khac claimed bonus
-- → block claim (khach dung alias de tao account moi)

CREATE OR REPLACE FUNCTION public.claim_welcome_bonus_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_owner          uuid;
  v_already        boolean;
  v_points         int := 100;
  v_email_verified timestamptz;
  v_canonical      text;
  v_dup_claimed    boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- D1: Check email verified
  SELECT email_confirmed_at INTO v_email_verified
    FROM auth.users WHERE id = v_user_id;
  IF v_email_verified IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_not_verified',
      'message', 'Vui long xac nhan email truoc khi nhan diem thuong');
  END IF;

  -- D2: Check canonical email — da co account khac claimed bonus chua?
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
-- ║ SECTION 8: VERIFY                                        ║
-- ╚══════════════════════════════════════════════════════════╝

-- 8.1: canonical_email column exists?
SELECT 'canonical_email_column' AS test,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'profiles'
            AND column_name = 'canonical_email'
       ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- 8.2: normalize_email function works?
SELECT 'normalize_test' AS test,
       public.normalize_email('User+tag@Gmail.com') AS gmail_result,
       public.normalize_email('u.s.e.r@gmail.com') AS dots_result,
       public.normalize_email('user+tag@yahoo.co.jp') AS yahoo_result;
-- Expected: user@gmail.com, user@gmail.com, user@yahoo.co.jp

-- 8.3: How many profiles have canonical_email?
SELECT 'backfill_status' AS test,
       COUNT(*) FILTER (WHERE canonical_email IS NOT NULL) AS has_canonical,
       COUNT(*) FILTER (WHERE canonical_email IS NULL) AS missing_canonical,
       COUNT(*) AS total
  FROM public.profiles;

-- 8.4: handle_new_user trigger active?
SELECT 'trigger_active' AS test, tgname, tgenabled::text
  FROM pg_trigger
 WHERE tgrelid = 'auth.users'::regclass
   AND tgname = 'on_auth_user_created';
