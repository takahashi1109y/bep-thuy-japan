-- ============================================================
-- Bếp Thuỷ Japan — INACTIVE REMINDERS V3 (final tier structure)
-- 45 days: "We miss you" (no discount)
-- 60 days: 5% discount
-- 90 days: 8% discount
-- 120 days: 10% discount
-- + reminder_7 (7 days after discount email)
-- + reminder_last (1 day before expiry)
-- Run in Supabase SQL Editor (2026-04-25)
-- ============================================================

-- 1. Update constraint to accept new email types
ALTER TABLE public.inactive_email_log
  DROP CONSTRAINT IF EXISTS inactive_email_log_email_type_check;
ALTER TABLE public.inactive_email_log
  ADD CONSTRAINT inactive_email_log_email_type_check
  CHECK (email_type IN ('inactive_45', 'inactive_60', 'inactive_90', 'inactive_120', 'reminder_7', 'reminder_last'));

-- 2. Rebuild RPC: 4 tiers
CREATE OR REPLACE FUNCTION public.get_inactive_customers()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  gender text,
  last_order_at timestamptz,
  days_inactive int,
  email_type text,
  discount_percent int
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
      WHEN c.days_since >= 120 THEN 'inactive_120'
      WHEN c.days_since >= 90 THEN 'inactive_90'
      WHEN c.days_since >= 60 THEN 'inactive_60'
      WHEN c.days_since >= 45 THEN 'inactive_45'
    END AS etype,
    CASE
      WHEN c.days_since >= 120 THEN 10
      WHEN c.days_since >= 90 THEN 8
      WHEN c.days_since >= 60 THEN 5
      WHEN c.days_since >= 45 THEN 0    -- Just reminder, no discount
    END AS disc_pct
  FROM customer_last_order c
  WHERE c.days_since >= 45
    AND c.days_since < 240            -- Skip very old (>8 months)
    AND NOT EXISTS (
      SELECT 1 FROM public.inactive_email_log l
      WHERE l.user_id = c.uid
        AND l.email_type = (
          CASE
            WHEN c.days_since >= 120 THEN 'inactive_120'
            WHEN c.days_since >= 90 THEN 'inactive_90'
            WHEN c.days_since >= 60 THEN 'inactive_60'
            WHEN c.days_since >= 45 THEN 'inactive_45'
          END
        )
        AND l.last_order_at = c.last_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_inactive_customers() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_inactive_customers() TO service_role;

-- 3. mark_inactive_email_sent — 4 tiers
CREATE OR REPLACE FUNCTION public.mark_inactive_email_sent(
  p_user_id uuid,
  p_email_type text,
  p_last_order_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_percent int := 0;
BEGIN
  INSERT INTO public.inactive_email_log (user_id, email_type, last_order_at)
  VALUES (p_user_id, p_email_type, p_last_order_at)
  ON CONFLICT (user_id, email_type) DO UPDATE SET
    last_order_at = EXCLUDED.last_order_at,
    sent_at = now();

  -- 45 days: NO discount (reminder only)
  -- 60/90/120 days: set discount %
  IF p_email_type = 'inactive_60' THEN v_percent := 5;
  ELSIF p_email_type = 'inactive_90' THEN v_percent := 8;
  ELSIF p_email_type = 'inactive_120' THEN v_percent := 10;
  END IF;

  IF v_percent > 0 THEN
    UPDATE public.profiles
    SET inactive_discount_percent = v_percent,
        inactive_discount_expires_at = now() + INTERVAL '14 days'
    WHERE id = p_user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_inactive_email_sent(uuid, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inactive_email_sent(uuid, text, timestamptz) TO service_role;

-- 4. get_discount_reminders unchanged (still works with any active discount)
--    (from v2, already handles 7-day + last-day reminders regardless of tier)

-- ============================================================
-- DONE. Test:
--   SELECT * FROM public.get_inactive_customers();
--   SELECT * FROM public.get_discount_reminders();
-- ============================================================
