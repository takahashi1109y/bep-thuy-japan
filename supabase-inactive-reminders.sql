-- ============================================================
-- Bếp Thuỷ Japan — INACTIVE CUSTOMER REMINDERS
-- 45 days: "We miss you" reminder
-- 60 days: 5% discount on next order (auto-apply, ship fee separate)
-- Run in Supabase SQL Editor (2026-04-25)
-- ============================================================

-- 1. Add column to profiles for inactive discount tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inactive_discount_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS inactive_discount_percent int DEFAULT 0;

-- 2. Email log table (prevent duplicate sends)
CREATE TABLE IF NOT EXISTS public.inactive_email_log (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email_type text CHECK (email_type IN ('inactive_45', 'inactive_60')) NOT NULL,
  last_order_at timestamptz,
  sent_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, email_type)
);

ALTER TABLE public.inactive_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inactive_email_log FROM anon, authenticated;

-- 3. RPC: get_inactive_customers() — returns users who should receive reminder
CREATE OR REPLACE FUNCTION public.get_inactive_customers()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  gender text,
  last_order_at timestamptz,
  days_inactive int,
  email_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH customer_last_order AS (
    SELECT
      p.id AS uid,
      u.email::text AS email_addr,
      p.display_name AS name,
      p.gender AS gen,
      COALESCE(MAX(o.created_at), p.created_at) AS last_at,
      EXTRACT(DAY FROM (now() - COALESCE(MAX(o.created_at), p.created_at)))::int AS days_since
    FROM public.profiles p
    INNER JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.orders o ON o.user_id = p.id AND o.status NOT IN ('cancelled')
    WHERE u.email IS NOT NULL
      AND u.email_confirmed_at IS NOT NULL
    GROUP BY p.id, u.email, p.display_name, p.gender, p.created_at
  )
  SELECT
    c.uid,
    c.email_addr,
    c.name,
    c.gen,
    c.last_at,
    c.days_since,
    CASE
      WHEN c.days_since >= 60 AND c.days_since < 120 THEN 'inactive_60'
      WHEN c.days_since >= 45 AND c.days_since < 60 THEN 'inactive_45'
    END AS etype
  FROM customer_last_order c
  WHERE c.days_since >= 45
    AND c.days_since < 120  -- Skip very old (>4 months) to avoid spam
    AND NOT EXISTS (
      -- Skip if same email type was sent for this "inactive period" (using last_order_at)
      SELECT 1 FROM public.inactive_email_log l
      WHERE l.user_id = c.uid
        AND l.email_type = CASE
            WHEN c.days_since >= 60 THEN 'inactive_60'
            WHEN c.days_since >= 45 THEN 'inactive_45'
          END
        AND l.last_order_at = c.last_at  -- Cung last_order_at -> da gui roi
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_inactive_customers() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_inactive_customers() TO service_role;

-- 4. RPC: mark_inactive_email_sent (by Apps Script after sending)
-- For inactive_60, also activate the 5% discount (expires in 14 days)
CREATE OR REPLACE FUNCTION public.mark_inactive_email_sent(
  p_user_id uuid,
  p_email_type text,
  p_last_order_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.inactive_email_log (user_id, email_type, last_order_at)
  VALUES (p_user_id, p_email_type, p_last_order_at)
  ON CONFLICT (user_id, email_type) DO UPDATE SET
    last_order_at = EXCLUDED.last_order_at,
    sent_at = now();

  -- For inactive_60: kich hoat 10% discount trong 14 ngay
  IF p_email_type = 'inactive_60' THEN
    UPDATE public.profiles
    SET inactive_discount_percent = 10,
        inactive_discount_expires_at = now() + INTERVAL '14 days'
    WHERE id = p_user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_inactive_email_sent(uuid, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inactive_email_sent(uuid, text, timestamptz) TO service_role;

-- 5. RPC: get_my_active_discount() — frontend calls to check active discount
CREATE OR REPLACE FUNCTION public.get_my_active_discount()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_uid uuid;
  v_percent int;
  v_expires timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('percent', 0, 'expires_at', null);
  END IF;

  SELECT inactive_discount_percent, inactive_discount_expires_at
    INTO v_percent, v_expires
    FROM public.profiles WHERE id = v_uid;

  IF v_expires IS NULL OR v_expires < now() OR COALESCE(v_percent, 0) = 0 THEN
    RETURN jsonb_build_object('percent', 0, 'expires_at', null);
  END IF;

  RETURN jsonb_build_object(
    'percent', v_percent,
    'expires_at', v_expires,
    'days_left', GREATEST(0, EXTRACT(DAY FROM (v_expires - now()))::int)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_active_discount() TO authenticated;

-- 6. Auto-clear discount when order is placed (trigger)
CREATE OR REPLACE FUNCTION public.clear_inactive_discount_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET inactive_discount_percent = 0,
        inactive_discount_expires_at = NULL
    WHERE id = NEW.user_id
      AND inactive_discount_percent > 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_discount_on_order ON public.orders;
CREATE TRIGGER clear_discount_on_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_inactive_discount_on_order();

-- 7. Also include inactive_discount in get_member_dashboard RPC
-- (Update existing function to return discount info)
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
  v_inactive_percent int := 0;
  v_inactive_expires timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT birthday, inactive_discount_percent, inactive_discount_expires_at
    INTO v_birthday, v_inactive_percent, v_inactive_expires
    FROM public.profiles WHERE id = v_uid;

  IF v_birthday IS NOT NULL THEN
    v_is_birthday := (
      EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')) = EXTRACT(MONTH FROM v_birthday)
      AND EXTRACT(DAY FROM (now() AT TIME ZONE 'Asia/Tokyo')) = EXTRACT(DAY FROM v_birthday)
    );
  END IF;

  -- Clear expired discount
  IF v_inactive_expires IS NOT NULL AND v_inactive_expires < now() THEN
    v_inactive_percent := 0;
  END IF;

  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = v_uid),
    'balance', COALESCE((SELECT total_points FROM public.points_balance WHERE user_id = v_uid), 0),
    'orders', COALESCE((
      SELECT jsonb_agg(o ORDER BY o.created_at DESC)
      FROM (SELECT * FROM public.orders WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 30) o
    ), '[]'::jsonb),
    'transactions', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.created_at DESC)
      FROM (SELECT * FROM public.points_transactions WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 50) t
    ), '[]'::jsonb),
    'coupons', COALESCE((
      SELECT jsonb_agg(c ORDER BY c.created_at DESC)
      FROM (SELECT * FROM public.coupons WHERE user_id = v_uid ORDER BY created_at DESC) c
    ), '[]'::jsonb),
    'is_birthday', v_is_birthday,
    'inactive_discount', jsonb_build_object(
      'percent', COALESCE(v_inactive_percent, 0),
      'expires_at', v_inactive_expires
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_dashboard() TO authenticated;

-- ============================================================
-- DONE
-- ============================================================
