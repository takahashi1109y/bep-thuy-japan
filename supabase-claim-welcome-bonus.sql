-- ============================================================
-- Migration: Claim welcome bonus 100 điểm khi khách đăng ký
-- ============================================================
-- Run ONE time in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================
-- Bug: Frontend gọi sb.rpc('claim_welcome_bonus') khi URL có
-- ?claim=welcome (link từ email chào mừng GetResponse), nhưng RPC
-- chưa tồn tại → khách không nhận được 100 điểm.
-- ============================================================

-- 1) Cho phép points_transactions chấp nhận NULL cho order_no/order_total
--    (welcome bonus không gắn đơn hàng nào)
ALTER TABLE public.points_transactions
  ALTER COLUMN order_no DROP NOT NULL,
  ALTER COLUMN order_total DROP NOT NULL;

-- 2) Thêm cột welcome_claimed_at vào profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_claimed_at timestamptz;

-- 3) RPC claim_welcome_bonus()
--    Atomic test-and-set qua UPDATE WHERE → race-safe (2 click cùng lúc
--    chỉ award 1 lần)
-- Drop trước nếu version cũ tồn tại với return type khác
DROP FUNCTION IF EXISTS public.claim_welcome_bonus();

CREATE FUNCTION public.claim_welcome_bonus()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_already timestamptz;
  v_points int := 100;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Đảm bảo profile tồn tại (rare: khách click trước khi handle_new_user trigger chạy)
  INSERT INTO public.profiles (id)
  VALUES (v_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- Atomic test-and-set: chỉ UPDATE nếu chưa claim
  UPDATE public.profiles
     SET welcome_claimed_at = now()
   WHERE id = v_user_id
     AND welcome_claimed_at IS NULL;

  -- UPDATE không trúng dòng nào → đã claim trước đó
  IF NOT FOUND THEN
    SELECT welcome_claimed_at INTO v_already
      FROM public.profiles WHERE id = v_user_id;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'already_claimed',
      'claimed_at', v_already
    );
  END IF;

  -- Award 100 điểm
  INSERT INTO public.points_transactions
    (user_id, order_no, order_total, points, type, description)
  VALUES
    (v_user_id, NULL, NULL, v_points, 'welcome',
     'Thưởng chào mừng đăng ký thành viên 🎁');

  RETURN jsonb_build_object('ok', true, 'points', v_points);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_welcome_bonus() TO authenticated;

-- 4) Verify trạng thái sau migration
SELECT
  count(*) FILTER (WHERE welcome_claimed_at IS NOT NULL) AS already_claimed,
  count(*) FILTER (WHERE welcome_claimed_at IS NULL)     AS pending_claim,
  count(*) AS total_profiles
FROM public.profiles;
