-- =============================================================
-- supabase-claim-welcome-bonus-v2.sql
-- RPC: claim_welcome_bonus_by_token(p_token text)
-- Replaces: claim_welcome_bonus() (no-token legacy)
-- Created: 2026-05-08
-- =============================================================

CREATE OR REPLACE FUNCTION public.claim_welcome_bonus_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_owner   uuid;
  v_already boolean;
  v_points  int := 100;
BEGIN
  -- Must be authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Lookup owner of token (case-sensitive, index-friendly exact match)
  SELECT id, bonus_claimed
    INTO v_owner, v_already
    FROM public.profiles
   WHERE bonus_token = p_token
   LIMIT 1;

  -- Token không tồn tại trong DB
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- Token thuộc về người khác (security: tránh attacker forward link)
  IF v_owner != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_your_token');
  END IF;

  -- Đã claim rồi (early exit trước UPDATE để tránh tốn lock)
  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  -- Atomic test-and-set: chỉ UPDATE khi bonus_claimed vẫn còn false
  -- Handles race condition (2 click cùng lúc, 2 tab, 2 device)
  UPDATE public.profiles
     SET bonus_claimed        = true,
         welcome_claimed_at   = COALESCE(welcome_claimed_at, now())
   WHERE id           = v_user_id
     AND bonus_token  = p_token
     AND bonus_claimed = false;

  IF NOT FOUND THEN
    -- Race condition: row đã bị UPDATE bởi request khác trong cùng ms
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  -- Award 100 điểm vào points_transactions
  INSERT INTO public.points_transactions
    (user_id, order_no, order_total, points, type, description)
  VALUES
    (v_user_id, NULL, NULL, v_points, 'welcome',
     'Thưởng chào mừng đăng ký thành viên 🎁');

  RETURN jsonb_build_object('ok', true, 'points', v_points);
END;
$$;

-- Grant execute cho authenticated users (anonymous KHÔNG có access)
GRANT EXECUTE ON FUNCTION public.claim_welcome_bonus_by_token(text) TO authenticated;

-- =============================================================
-- VERIFY QUERIES (chạy sau khi migrate để confirm)
-- =============================================================

-- 1. Function tồn tại với đúng signature
SELECT routine_name, routine_type, security_type, data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name   = 'claim_welcome_bonus_by_token';

-- 2. GRANT đã áp dụng (nên thấy row với grantee = 'authenticated')
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND specific_name LIKE 'claim_welcome_bonus_by_token%';

-- 3. Sample test (thay UUID thật + token thật từ profiles)
-- SELECT public.claim_welcome_bonus_by_token('REPLACE_WITH_REAL_TOKEN_32HEX');
-- Expected khi chưa login: not_authenticated
-- Expected token sai: invalid_token
-- Expected token đúng, claim OK: { "ok": true, "points": 100 }
-- Expected claim lần 2: { "ok": false, "error": "already_claimed" }
