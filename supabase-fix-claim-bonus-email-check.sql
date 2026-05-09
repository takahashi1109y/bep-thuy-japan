-- ============================================================
-- ⚠️ KHONG CHAY FILE NAY — da duoc gop vao:
--   supabase-anti-fraud-canonical-email.sql (Section 7)
-- File nay chi con lam reference, KHONG chay doc lap.
-- ============================================================
-- D1: ADD EMAIL VERIFIED CHECK TO claim_welcome_bonus_by_token
-- ============================================================
-- Anti-fraud: khach PHAI verify email truoc khi claim 100 diem.
-- Ngan khach tao account voi email rac roi claim bonus ngay.
-- ============================================================

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
BEGIN
  -- Must be authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- D1 NEW: Check email verified
  SELECT email_confirmed_at INTO v_email_verified
    FROM auth.users WHERE id = v_user_id;
  IF v_email_verified IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_not_verified',
      'message', 'Vui long xac nhan email truoc khi nhan diem thuong');
  END IF;

  -- Lookup owner of token
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

-- ============================================================
-- VERIFY
-- ============================================================
SELECT routine_name, security_type
  FROM information_schema.routines
 WHERE routine_schema = 'public'
   AND routine_name = 'claim_welcome_bonus_by_token';
