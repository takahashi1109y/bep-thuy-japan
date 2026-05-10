-- ============================================================
-- REFERRAL PROGRAM — PHASE 1.5 PATCH (2026-05-11)
-- ============================================================
-- Anh sửa logic 2026-05-11:
--   - B's discount: 10% off → 300 yen FLAT off (1 lần duy nhất)
--   - A reward: chỉ award 1 lần khi B's FIRST order delivered (không award đơn 2+)
--
-- Idempotent. Run AFTER Phase 1.
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 1: Add column profiles.referral_redeemed_at       ║
-- ╚══════════════════════════════════════════════════════════╝
-- Track khi B đã redeem 300 yen off (block re-redeem)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles'
     AND column_name='referral_redeemed_at') THEN
    ALTER TABLE public.profiles ADD COLUMN referral_redeemed_at timestamptz;
    RAISE NOTICE 'ADDED profiles.referral_redeemed_at';
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 2: RPC check_referral_eligibility                  ║
-- ╚══════════════════════════════════════════════════════════╝
-- Frontend call để biết khách (B) có được giảm 300 yen không
-- Return: { eligible: bool, reason: text, message: text, discount_amount: int }

CREATE OR REPLACE FUNCTION public.check_referral_eligibility()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid;
  v_referred_by  uuid;
  v_redeemed_at  timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_authenticated', 'discount_amount', 0);
  END IF;

  SELECT referred_by, referral_redeemed_at
    INTO v_referred_by, v_redeemed_at
    FROM public.profiles WHERE id = v_uid;

  IF v_referred_by IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_referrer', 'discount_amount', 0,
      'message', 'Bạn chưa có người giới thiệu — không áp dụng giảm 300đ.');
  END IF;

  IF v_redeemed_at IS NOT NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'already_redeemed', 'discount_amount', 0,
      'message', 'Bạn đã sử dụng ưu đãi 300đ giới thiệu rồi.');
  END IF;

  RETURN jsonb_build_object(
    'eligible', true,
    'reason', 'eligible',
    'discount_amount', 300,
    'min_subtotal', 3000,
    'message', 'Bạn được giảm 300¥ cho đơn đầu tiên (chỉ áp dụng đơn > 3000¥).');
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_referral_eligibility() TO authenticated;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 3: RPC mark_referral_redeemed_for_order             ║
-- ╚══════════════════════════════════════════════════════════╝
-- Goi sau khi order tao thanh cong + co referral_applied=true.
-- Set profiles.referral_redeemed_at = now() để block re-apply.

CREATE OR REPLACE FUNCTION public.mark_referral_redeemed_for_order(p_order_no text)
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

  IF v_role != 'service_role' AND v_user_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE order_no = p_order_no;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_role != 'service_role' AND v_order.user_id != v_user_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_your_order');
  END IF;

  IF v_order.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'guest_order_no_user');
  END IF;

  UPDATE public.profiles
     SET referral_redeemed_at = COALESCE(referral_redeemed_at, now())
   WHERE id = v_order.user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_referral_redeemed_for_order(text) TO authenticated, service_role;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 4: Update award_referrer trigger function          ║
-- ╚══════════════════════════════════════════════════════════╝
-- Logic giữ nguyên (đã đúng từ Phase 1):
-- - Fire khi NEW.status='delivered' VA NEW.referral_applied=true VA referral_awarded=false
-- - referral_applied=true CHI CO o đơn đầu B (frontend chỉ apply khi check_referral_eligibility=true)
-- - Sau khi award → set referral_awarded=true → idempotent
-- - 1 referee = 1 award (vì B chỉ có 1 đơn với referral_applied=true)
--
-- KHÔNG cần update — logic Phase 1 đã đúng. Section này chỉ verify.

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 5: VERIFY                                          ║
-- ╚══════════════════════════════════════════════════════════╝

-- Q1: Column exists?
SELECT 'Q1_COLUMN' AS test,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='profiles'
           AND column_name='referral_redeemed_at'
       ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- Q2: check_referral_eligibility works?
SELECT 'Q2_RPC_TEST' AS test,
       public.check_referral_eligibility() AS result;
-- Expected: not_authenticated (vì postgres role)

-- Q3: Existing profiles có referred_by setup chưa?
SELECT 'Q3_REFERRED_USERS' AS test,
       COUNT(*) FILTER (WHERE referred_by IS NOT NULL) AS users_with_referrer,
       COUNT(*) AS total
  FROM public.profiles;
-- Expected: 0/169 (chưa có ai signup qua ref)

-- Q4: Trigger award_referrer vẫn active
SELECT 'Q4_TRIGGER_OK' AS test, tgname, tgenabled::text
  FROM pg_trigger
 WHERE tgrelid = 'public.orders'::regclass
   AND tgname = 'trg_award_referrer';

-- ╔══════════════════════════════════════════════════════════╗
-- ║ ROLLBACK                                                   ║
-- ╚══════════════════════════════════════════════════════════╝
-- DROP FUNCTION IF EXISTS public.check_referral_eligibility();
-- DROP FUNCTION IF EXISTS public.mark_referral_redeemed_for_order(text);
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS referral_redeemed_at;
