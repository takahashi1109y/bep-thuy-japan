-- ============================================================
-- Bếp Thuỷ Japan — FAST DASHBOARD RPC (Performance boost)
-- Goi 1 lan thay vi 5 queries song song -> tiet kiem 100-300ms
-- Run in Supabase SQL Editor (2026-04-24)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_member_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
  v_birthday date;
  v_is_birthday boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Get birthday to check if today
  SELECT birthday INTO v_birthday FROM public.profiles WHERE id = v_uid;
  IF v_birthday IS NOT NULL THEN
    v_is_birthday := (
      EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')) = EXTRACT(MONTH FROM v_birthday)
      AND EXTRACT(DAY FROM (now() AT TIME ZONE 'Asia/Tokyo')) = EXTRACT(DAY FROM v_birthday)
    );
  END IF;

  -- Single roundtrip: gop profile + balance + orders + transactions + coupons
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = v_uid),
    'balance', COALESCE((SELECT total_points FROM public.points_balance WHERE user_id = v_uid), 0),
    'orders', COALESCE((
      SELECT jsonb_agg(o ORDER BY o.created_at DESC)
      FROM (
        SELECT * FROM public.orders
        WHERE user_id = v_uid
        ORDER BY created_at DESC
        LIMIT 30
      ) o
    ), '[]'::jsonb),
    'transactions', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.created_at DESC)
      FROM (
        SELECT * FROM public.points_transactions
        WHERE user_id = v_uid
        ORDER BY created_at DESC
        LIMIT 50
      ) t
    ), '[]'::jsonb),
    'coupons', COALESCE((
      SELECT jsonb_agg(c ORDER BY c.created_at DESC)
      FROM (
        SELECT * FROM public.coupons
        WHERE user_id = v_uid
        ORDER BY created_at DESC
      ) c
    ), '[]'::jsonb),
    'is_birthday', v_is_birthday,
    'ts', extract(epoch from now())::bigint
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_dashboard() TO authenticated;

-- ============================================================
-- Test: SELECT public.get_member_dashboard();
-- Neu chua login -> tra ve {"error": "not_authenticated"}
-- Neu login -> tra ve object co profile, balance, orders, transactions, coupons
-- ============================================================
