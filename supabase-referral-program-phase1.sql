-- ============================================================
-- REFERRAL PROGRAM — PHASE 1: DB Schema Migration
-- ============================================================
-- Anh-Approved 2026-05-11
-- SPEC: K:\bep-thuy-japan\SPEC-REFERRAL-FEATURE.md
--
-- Idempotent — chay nhieu lan OK.
-- Sau khi chay, anh chup 8 verify queries (Section 9) gui em.
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 1: Add columns vao profiles                       ║
-- ╚══════════════════════════════════════════════════════════╝

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles' AND column_name='referral_code') THEN
    ALTER TABLE public.profiles ADD COLUMN referral_code text;
    RAISE NOTICE 'ADDED profiles.referral_code';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles' AND column_name='referred_by') THEN
    ALTER TABLE public.profiles ADD COLUMN referred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    RAISE NOTICE 'ADDED profiles.referred_by';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles' AND column_name='referral_count') THEN
    ALTER TABLE public.profiles ADD COLUMN referral_count int DEFAULT 0;
    RAISE NOTICE 'ADDED profiles.referral_count';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles' AND column_name='device_fingerprint') THEN
    ALTER TABLE public.profiles ADD COLUMN device_fingerprint text;
    RAISE NOTICE 'ADDED profiles.device_fingerprint';
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 2: Add columns vao orders                         ║
-- ╚══════════════════════════════════════════════════════════╝

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='orders' AND column_name='referral_discount') THEN
    ALTER TABLE public.orders ADD COLUMN referral_discount int DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='orders' AND column_name='referral_applied') THEN
    ALTER TABLE public.orders ADD COLUMN referral_applied boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='orders' AND column_name='referral_awarded') THEN
    ALTER TABLE public.orders ADD COLUMN referral_awarded boolean DEFAULT false;
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 3: Create table referral_notifications            ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.referral_notifications (
  id           bigserial PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_no     text REFERENCES public.orders(order_no) ON DELETE SET NULL,
  points       int NOT NULL,
  referee_name text,
  seen         boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.referral_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User reads own notifs" ON public.referral_notifications;
CREATE POLICY "User reads own notifs" ON public.referral_notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "User updates own notifs" ON public.referral_notifications;
CREATE POLICY "User updates own notifs" ON public.referral_notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access notifs" ON public.referral_notifications;
CREATE POLICY "Service role full access notifs" ON public.referral_notifications
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_referral_notifs_user_unseen
  ON public.referral_notifications(user_id, seen)
 WHERE seen = false;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 4: generate_referral_code function                ║
-- ╚══════════════════════════════════════════════════════════╝
-- Format: 4 chars name (strip diacritics + uppercase) + 2 last digits phone
-- Vd: "Hoàng Thắng" + "0904237886" → "HOAN86"
-- Collision: append "_2", "_3", ... up to "_99"

CREATE OR REPLACE FUNCTION public.generate_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name       text;
  v_phone      text;
  v_base_code  text;
  v_final_code text;
  v_attempt    int := 0;
BEGIN
  SELECT display_name, phone INTO v_name, v_phone
    FROM public.profiles WHERE id = p_user_id;

  -- Step 1: Strip Vietnamese diacritics + uppercase + take first 4 letters
  v_name := COALESCE(NULLIF(v_name, ''), 'USER');
  v_name := translate(upper(v_name),
    'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ',
    'AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD');
  v_name := regexp_replace(v_name, '[^A-Z]', '', 'g');
  IF length(v_name) < 4 THEN
    v_name := rpad(v_name, 4, 'X');
  END IF;
  v_name := substring(v_name, 1, 4);

  -- Step 2: Last 2 digits of phone (strip non-digit)
  v_phone := COALESCE(v_phone, '00');
  v_phone := regexp_replace(v_phone, '[^0-9]', '', 'g');
  IF length(v_phone) < 2 THEN
    v_phone := '00';
  ELSE
    v_phone := right(v_phone, 2);
  END IF;

  -- Step 3: Combine + collision check
  v_base_code := v_name || v_phone;
  v_final_code := v_base_code;
  WHILE EXISTS (
    SELECT 1 FROM public.profiles
     WHERE referral_code = v_final_code
       AND id != p_user_id
  ) LOOP
    v_attempt := v_attempt + 1;
    v_final_code := v_base_code || '_' || v_attempt;
    IF v_attempt > 99 THEN
      RAISE EXCEPTION 'Referral code collision exceeded 99 retries for user %', p_user_id;
    END IF;
  END LOOP;

  RETURN v_final_code;
END;
$$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 5: Backfill existing profiles                     ║
-- ╚══════════════════════════════════════════════════════════╝
-- Gen referral_code cho tat ca profiles chua co
DO $$
DECLARE
  v_user record;
  v_count int := 0;
BEGIN
  FOR v_user IN
    SELECT id FROM public.profiles WHERE referral_code IS NULL
  LOOP
    UPDATE public.profiles
       SET referral_code = public.generate_referral_code(v_user.id)
     WHERE id = v_user.id;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Backfilled % profiles with referral_code', v_count;
END $$;

-- Add UNIQUE constraint sau khi backfill xong
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code_unique
  ON public.profiles(referral_code)
 WHERE referral_code IS NOT NULL;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 6: Update handle_new_user trigger                 ║
-- ╚══════════════════════════════════════════════════════════╝
-- Auto-gen referral_code khi user moi signup + accept ?ref=XXX param

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ref_code text;
  v_referrer_id uuid;
BEGIN
  INSERT INTO public.profiles (
    id, customer_code, display_name, phone, prefecture, postal,
    address, gender, birthday, canonical_email, signup_ip, device_fingerprint
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
    NEW.raw_user_meta_data->>'signup_ip',
    NEW.raw_user_meta_data->>'device_fingerprint'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Gen referral_code cho user moi
  UPDATE public.profiles
     SET referral_code = public.generate_referral_code(NEW.id)
   WHERE id = NEW.id AND referral_code IS NULL;

  -- Process ?ref= param: lookup referrer + set referred_by
  v_ref_code := NEW.raw_user_meta_data->>'ref_code';
  IF v_ref_code IS NOT NULL AND v_ref_code != '' THEN
    SELECT id INTO v_referrer_id
      FROM public.profiles
     WHERE referral_code = v_ref_code
     LIMIT 1;
    IF v_referrer_id IS NOT NULL AND v_referrer_id != NEW.id THEN
      UPDATE public.profiles SET referred_by = v_referrer_id WHERE id = NEW.id;
    END IF;
  END IF;

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
-- ║ SECTION 7: validate_ref_code RPC (frontend signup check)  ║
-- ╚══════════════════════════════════════════════════════════╝
-- Validate ref code + check anti-fraud TRUOC khi signup
-- Frontend goi: sb.rpc('validate_ref_code', { p_ref_code, p_email, p_phone, p_ip, p_fingerprint })

CREATE OR REPLACE FUNCTION public.validate_ref_code(
  p_ref_code    text,
  p_email       text DEFAULT NULL,
  p_phone       text DEFAULT NULL,
  p_ip          text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer public.profiles%rowtype;
  v_canonical text;
BEGIN
  IF p_ref_code IS NULL OR p_ref_code = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'missing_code');
  END IF;

  SELECT * INTO v_referrer
    FROM public.profiles
   WHERE referral_code = p_ref_code
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_code',
      'message', 'Mã giới thiệu không tồn tại');
  END IF;

  -- Check 1: lifetime cap
  IF v_referrer.referral_count >= 20 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'referrer_limit_reached',
      'message', 'Người giới thiệu đã đạt giới hạn 20 lần. Vui lòng dùng mã khác.');
  END IF;

  -- Check 2: same canonical_email (self-refer email)
  IF p_email IS NOT NULL THEN
    v_canonical := public.normalize_email(p_email);
    IF v_referrer.canonical_email = v_canonical THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'self_refer_email',
        'message', 'Bạn không thể tự giới thiệu chính mình (cùng email).');
    END IF;
  END IF;

  -- Check 3: same phone (self-refer phone)
  IF p_phone IS NOT NULL AND p_phone != '' AND v_referrer.phone = p_phone THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'self_refer_phone',
      'message', 'Bạn không thể tự giới thiệu chính mình (cùng số điện thoại).');
  END IF;

  -- Check 4: same IP in 24h (self-refer IP)
  IF p_ip IS NOT NULL AND p_ip != ''
     AND v_referrer.signup_ip = p_ip
     AND v_referrer.created_at > now() - INTERVAL '24 hours' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'self_refer_ip',
      'message', 'Phát hiện đăng ký từ cùng mạng Internet trong 24h. Vui lòng liên hệ support.');
  END IF;

  -- Check 5: same device fingerprint
  IF p_fingerprint IS NOT NULL AND p_fingerprint != ''
     AND v_referrer.device_fingerprint = p_fingerprint THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'self_refer_device',
      'message', 'Phát hiện sử dụng cùng thiết bị. Mã giới thiệu không hợp lệ.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'referrer_id', v_referrer.id,
    'referrer_name', v_referrer.display_name,
    'message', 'Mã giới thiệu hợp lệ! Bạn sẽ được giảm 10% đơn đầu tiên.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_ref_code(text, text, text, text, text) TO anon, authenticated;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 8: award_referrer_on_delivered trigger             ║
-- ╚══════════════════════════════════════════════════════════╝
-- Khi order chuyen status='delivered' VA referral_applied=true VA
-- referral_awarded=false → award diem cho referrer (A) + INSERT notif.

CREATE OR REPLACE FUNCTION public.award_referrer_on_delivered_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id   uuid;
  v_referrer_email text;
  v_referee_name  text;
  v_points        int;
BEGIN
  -- Only fire when status changes TO 'delivered' AND referral applied AND not yet awarded
  IF NEW.status != 'delivered' OR
     COALESCE(OLD.status, '') = 'delivered' OR
     NOT COALESCE(NEW.referral_applied, false) OR
     COALESCE(NEW.referral_awarded, false) THEN
    RETURN NEW;
  END IF;

  -- Lookup B's referrer
  SELECT p.referred_by, COALESCE(p.display_name, '')
    INTO v_referrer_id, v_referee_name
    FROM public.profiles p
   WHERE p.id = NEW.user_id;

  IF v_referrer_id IS NULL THEN
    RETURN NEW;  -- B's referrer not set, skip
  END IF;

  -- Calculate points: MIN(subtotal × 10%, 500), exclude shipping
  v_points := LEAST(FLOOR(COALESCE(NEW.subtotal, 0) * 0.1)::int, 500);
  IF v_points <= 0 THEN
    RETURN NEW;
  END IF;

  -- Award referrer
  INSERT INTO public.points_transactions(user_id, order_no, order_total, points, type, description)
  VALUES (v_referrer_id, NEW.order_no, NEW.subtotal, v_points, 'referral',
          'Thưởng giới thiệu — đơn #' || NEW.order_no || ' của ' || v_referee_name);

  -- Increment referral_count
  UPDATE public.profiles
     SET referral_count = COALESCE(referral_count, 0) + 1
   WHERE id = v_referrer_id;

  -- Insert in-app notification
  INSERT INTO public.referral_notifications(user_id, order_no, points, referee_name)
  VALUES (v_referrer_id, NEW.order_no, v_points, v_referee_name);

  -- Mark order as awarded (idempotent)
  NEW.referral_awarded := true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_referrer ON public.orders;
CREATE TRIGGER trg_award_referrer
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.award_referrer_on_delivered_fn();

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 9: VERIFY queries                                 ║
-- ╚══════════════════════════════════════════════════════════╝

-- Q1: 4 columns added to profiles
SELECT 'Q1_PROFILES_COLS' AS test,
       COUNT(*) FILTER (WHERE column_name = 'referral_code')      AS has_code,
       COUNT(*) FILTER (WHERE column_name = 'referred_by')        AS has_referred_by,
       COUNT(*) FILTER (WHERE column_name = 'referral_count')     AS has_count,
       COUNT(*) FILTER (WHERE column_name = 'device_fingerprint') AS has_fp
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='profiles';
-- Expected: 4×1

-- Q2: 3 columns added to orders
SELECT 'Q2_ORDERS_COLS' AS test,
       COUNT(*) FILTER (WHERE column_name = 'referral_discount') AS has_disc,
       COUNT(*) FILTER (WHERE column_name = 'referral_applied')  AS has_applied,
       COUNT(*) FILTER (WHERE column_name = 'referral_awarded')  AS has_awarded
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='orders';
-- Expected: 3×1

-- Q3: Table referral_notifications exists
SELECT 'Q3_NOTIF_TABLE' AS test,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='referral_notifications'
       ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- Q4: Backfill — bao nhieu profiles co referral_code
SELECT 'Q4_BACKFILL' AS test,
       COUNT(*) FILTER (WHERE referral_code IS NOT NULL) AS has_code,
       COUNT(*) FILTER (WHERE referral_code IS NULL) AS missing_code,
       COUNT(*) AS total
  FROM public.profiles;

-- Q5: Sample 5 referral codes generated
SELECT 'Q5_SAMPLE_CODES' AS test, display_name, phone, referral_code
  FROM public.profiles
 WHERE referral_code IS NOT NULL
 ORDER BY created_at DESC
 LIMIT 5;

-- Q6: Test generate_referral_code function works
SELECT 'Q6_GEN_TEST' AS test,
       public.generate_referral_code(
         (SELECT id FROM public.profiles ORDER BY created_at DESC LIMIT 1)
       ) AS sample_code;

-- Q7: validate_ref_code function works (with anh's own code)
SELECT 'Q7_VALIDATE_TEST' AS test,
       public.validate_ref_code(
         (SELECT referral_code FROM public.profiles
          WHERE id = (SELECT id FROM auth.users WHERE email = 'thanghoang1109@gmail.com')),
         'test@example.com', '09099887766', '1.2.3.4', 'test_fp'
       ) AS result;

-- Q8: Trigger award_referrer_on_delivered active
SELECT 'Q8_TRIGGER' AS test, tgname, tgenabled::text
  FROM pg_trigger
 WHERE tgrelid = 'public.orders'::regclass
   AND tgname = 'trg_award_referrer';

-- ╔══════════════════════════════════════════════════════════╗
-- ║ ROLLBACK (chi chay neu can revert)                         ║
-- ╚══════════════════════════════════════════════════════════╝
-- DROP TRIGGER IF EXISTS trg_award_referrer ON public.orders;
-- DROP FUNCTION IF EXISTS public.award_referrer_on_delivered_fn();
-- DROP FUNCTION IF EXISTS public.validate_ref_code(text,text,text,text,text);
-- DROP FUNCTION IF EXISTS public.generate_referral_code(uuid);
-- DROP TABLE IF EXISTS public.referral_notifications;
-- ALTER TABLE public.orders
--   DROP COLUMN IF EXISTS referral_discount,
--   DROP COLUMN IF EXISTS referral_applied,
--   DROP COLUMN IF EXISTS referral_awarded;
-- ALTER TABLE public.profiles
--   DROP COLUMN IF EXISTS referral_code,
--   DROP COLUMN IF EXISTS referred_by,
--   DROP COLUMN IF EXISTS referral_count,
--   DROP COLUMN IF EXISTS device_fingerprint;
