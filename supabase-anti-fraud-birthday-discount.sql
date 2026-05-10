-- ============================================================
-- ANTI-FRAUD BIRTHDAY DISCOUNT — Option B (4 layers)
-- 2026-05-11
-- ============================================================
-- Block khach abuse 10% sinh nhat bang cach:
--   1. Account age ≥ 30 days
--   2. Birthday set_at ≥ 30 days ago (lock after first set)
--   3. Last claim ≥ 365 days ago (1 lan/nam dương lich)
--   4. Birthday match today (timezone JST)
--
-- Trigger lock birthday: khach KHONG sua duoc qua frontend.
-- Admin/service_role van overide neu can support thu cong.
--
-- Idempotent — chay nhieu lan OK.
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 1: Add columns birthday tracking                 ║
-- ╚══════════════════════════════════════════════════════════╝

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND column_name = 'birthday_set_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN birthday_set_at timestamptz;
    RAISE NOTICE 'ADDED birthday_set_at to profiles';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND column_name = 'birthday_last_claim_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN birthday_last_claim_at timestamptz;
    RAISE NOTICE 'ADDED birthday_last_claim_at to profiles';
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 2: Backfill birthday_set_at for existing users   ║
-- ╚══════════════════════════════════════════════════════════╝
-- Trust legacy data: backfill = profiles.created_at
-- (existing users daydoc ≥ 30 days neu da created ≥ 30 days)

UPDATE public.profiles
   SET birthday_set_at = created_at
 WHERE birthday IS NOT NULL
   AND birthday_set_at IS NULL;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 3: Trigger lock birthday after set               ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.lock_birthday_after_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');

  -- Service role + admin van overide duoc (ho tro thu cong)
  IF v_role = 'service_role' OR
     EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
    -- Update birthday_set_at if changing
    IF OLD.birthday IS DISTINCT FROM NEW.birthday AND NEW.birthday IS NOT NULL THEN
      NEW.birthday_set_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- Khach: lock birthday neu da set
  IF OLD.birthday IS NOT NULL AND NEW.birthday IS DISTINCT FROM OLD.birthday THEN
    RAISE EXCEPTION 'Ngày sinh không thể thay đổi sau khi đã khai báo. Vui lòng liên hệ support@thuyjapan.com nếu cần sửa.';
  END IF;

  -- Lan dau set birthday: ghi timestamp
  IF OLD.birthday IS NULL AND NEW.birthday IS NOT NULL THEN
    NEW.birthday_set_at := COALESCE(NEW.birthday_set_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_birthday ON public.profiles;
CREATE TRIGGER trg_lock_birthday
  BEFORE UPDATE OF birthday ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.lock_birthday_after_set();

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 4: Update check_birthday_discount() — 4 layers   ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.check_birthday_discount()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             uuid;
  v_birthday        date;
  v_birthday_set_at timestamptz;
  v_last_claim_at   timestamptz;
  v_created_at      timestamptz;
  v_is_birthday     boolean;
  v_today_jst       date;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('is_birthday', false, 'discount', 0, 'eligible', false, 'reason', 'not_authenticated');
  END IF;

  SELECT birthday, birthday_set_at, birthday_last_claim_at, created_at
    INTO v_birthday, v_birthday_set_at, v_last_claim_at, v_created_at
    FROM public.profiles WHERE id = v_uid;

  IF v_birthday IS NULL THEN
    RETURN jsonb_build_object('is_birthday', false, 'discount', 0, 'eligible', false, 'reason', 'no_birthday');
  END IF;

  -- Compare in JST timezone
  v_today_jst := (now() AT TIME ZONE 'Asia/Tokyo')::date;
  v_is_birthday := (
    EXTRACT(MONTH FROM v_birthday) = EXTRACT(MONTH FROM v_today_jst)
    AND EXTRACT(DAY FROM v_birthday) = EXTRACT(DAY FROM v_today_jst)
  );

  IF NOT v_is_birthday THEN
    RETURN jsonb_build_object('is_birthday', false, 'discount', 0, 'eligible', false, 'reason', 'not_birthday_today');
  END IF;

  -- LAYER 1: Account age ≥ 30 days
  IF v_created_at > now() - INTERVAL '30 days' THEN
    RETURN jsonb_build_object(
      'is_birthday', true, 'discount', 0, 'eligible', false,
      'reason', 'account_too_new',
      'message', 'Tài khoản cần đủ 30 ngày để nhận giảm giá sinh nhật. Năm sau bạn sẽ được giảm 10%!');
  END IF;

  -- LAYER 2: Birthday set_at ≥ 30 days ago
  IF v_birthday_set_at IS NULL OR v_birthday_set_at > now() - INTERVAL '30 days' THEN
    RETURN jsonb_build_object(
      'is_birthday', true, 'discount', 0, 'eligible', false,
      'reason', 'birthday_set_too_recent',
      'message', 'Ngày sinh được khai báo gần đây nên chưa thể nhận giảm giá năm này. Năm sau sẽ được giảm 10%!');
  END IF;

  -- LAYER 3: Last claim ≥ 365 days ago (or NULL)
  IF v_last_claim_at IS NOT NULL AND v_last_claim_at > now() - INTERVAL '365 days' THEN
    RETURN jsonb_build_object(
      'is_birthday', true, 'discount', 0, 'eligible', false,
      'reason', 'already_claimed_this_year',
      'message', 'Bạn đã nhận giảm giá sinh nhật trong 12 tháng qua. Năm sau sẽ được tiếp tục!');
  END IF;

  -- ALL 4 LAYERS PASSED
  RETURN jsonb_build_object(
    'is_birthday', true, 'discount', 10, 'eligible', true,
    'reason', 'eligible',
    'message', '🎂 Chúc mừng sinh nhật! Bạn được giảm 10% đơn hàng hôm nay.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_birthday_discount() TO authenticated;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 5: RPC mark_birthday_claim_for_order             ║
-- ╚══════════════════════════════════════════════════════════╝
-- Goi sau khi order tao thanh cong + co birthday discount.
-- Set birthday_last_claim_at = now() de chan claim lan 2 trong 365 ngay.

CREATE OR REPLACE FUNCTION public.mark_birthday_claim_for_order(p_order_no text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role     text;
  v_order    public.orders%rowtype;
  v_user_uid uuid;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_user_uid := auth.uid();

  -- Allow authenticated users (own orders) and service_role (Apps Script)
  IF v_role != 'service_role' AND v_user_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE order_no = p_order_no;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- Customer can only mark their own order
  IF v_role != 'service_role' AND v_order.user_id != v_user_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_your_order');
  END IF;

  IF v_order.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'guest_order_no_user');
  END IF;

  UPDATE public.profiles
     SET birthday_last_claim_at = now()
   WHERE id = v_order.user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_birthday_claim_for_order(text) TO authenticated, service_role;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 6: VERIFY                                        ║
-- ╚══════════════════════════════════════════════════════════╝

-- Q1: Columns added?
SELECT 'Q1_COLUMNS' AS test,
       COUNT(*) FILTER (WHERE column_name = 'birthday_set_at') AS has_set_at,
       COUNT(*) FILTER (WHERE column_name = 'birthday_last_claim_at') AS has_claim_at
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles';
-- Expected: has_set_at=1, has_claim_at=1

-- Q2: Backfill stats
SELECT 'Q2_BACKFILL' AS test,
       COUNT(*) FILTER (WHERE birthday IS NOT NULL AND birthday_set_at IS NOT NULL) AS backfilled,
       COUNT(*) FILTER (WHERE birthday IS NOT NULL AND birthday_set_at IS NULL) AS missing_set_at,
       COUNT(*) FILTER (WHERE birthday IS NULL) AS no_birthday,
       COUNT(*) AS total_profiles
  FROM public.profiles;

-- Q3: Trigger active?
SELECT 'Q3_TRIGGER' AS test, tgname, tgenabled::text
  FROM pg_trigger
 WHERE tgrelid = 'public.profiles'::regclass
   AND tgname = 'trg_lock_birthday';

-- Q4: RPC has 4 layers?
SELECT 'Q4_RPC_4_LAYERS' AS test,
       CASE WHEN routine_definition ILIKE '%account_too_new%'
             AND routine_definition ILIKE '%birthday_set_too_recent%'
             AND routine_definition ILIKE '%already_claimed_this_year%'
            THEN 'PASS' ELSE 'FAIL' END AS result
  FROM information_schema.routines
 WHERE routine_schema = 'public'
   AND routine_name = 'check_birthday_discount';

-- Q5: Test function khi chua login (auth.uid() = null)
-- Khi chay tu SQL Editor (postgres role), auth.uid() = null → not_authenticated
SELECT 'Q5_RPC_TEST' AS test,
       public.check_birthday_discount() AS result;
