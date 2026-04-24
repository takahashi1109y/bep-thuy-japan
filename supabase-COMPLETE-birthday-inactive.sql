-- ============================================================================
-- Bếp Thuỷ Japan — COMPLETE BIRTHDAY + INACTIVE REMINDERS SYSTEM
-- Run once in Supabase SQL Editor (2026-04-25)
-- Includes:
--   • Gender + birthday columns on profiles
--   • Birthday emails (14/7/3 days before + on birthday) with 10% discount
--   • Inactive customer emails:
--       - 45 days: reminder only (no discount)
--       - 60 days: 5% discount for 14 days
--       - 90 days: 8% discount for 14 days
--       - 120 days: 10% discount for 14 days
--   • 2 reminder emails: 7 days after discount + last day before expiry
--   • Updated get_member_dashboard RPC (returns birthday + discount info)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────
-- PART 1: PROFILE COLUMNS (gender, birthday, inactive discount)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male','female','other')),
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS inactive_discount_percent int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inactive_discount_expires_at timestamptz;

-- ─────────────────────────────────────────────────────────────────
-- PART 2: SIGNUP TRIGGER — save gender + birthday from signup metadata
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone, prefecture, postal, address, gender, birthday)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.raw_user_meta_data->>'prefecture',
    NEW.raw_user_meta_data->>'postal',
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'gender',
    (NEW.raw_user_meta_data->>'birthday')::date
  );
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- PART 3: LOCK BIRTHDAY (ko cho doi sau khi da set)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_birthday_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.birthday IS NOT NULL AND NEW.birthday IS DISTINCT FROM OLD.birthday THEN
    RAISE EXCEPTION 'Birthday cannot be changed after it is set';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS lock_birthday ON public.profiles;
CREATE TRIGGER lock_birthday
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_birthday_change();

-- ─────────────────────────────────────────────────────────────────
-- PART 4: BIRTHDAY EMAIL SYSTEM (14/7/3/0 days before birthday)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.birthday_email_log (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email_type text CHECK (email_type IN ('advance_14', 'advance_7', 'advance_3', 'birthday')) NOT NULL,
  sent_year int NOT NULL,
  sent_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, email_type, sent_year)
);

ALTER TABLE public.birthday_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.birthday_email_log FROM anon, authenticated;

-- Get users whose birthday is in {0, 3, 7, 14} days (JST)
CREATE OR REPLACE FUNCTION public.get_upcoming_birthdays()
RETURNS TABLE (
  user_id uuid, email text, display_name text, gender text,
  birthday date, days_until int, email_type text
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_today date;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Tokyo')::date;
  RETURN QUERY
  SELECT p.id, u.email::text, p.display_name, p.gender, p.birthday,
    CASE
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today, 'MM-DD') THEN 0
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 3, 'MM-DD') THEN 3
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 7, 'MM-DD') THEN 7
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 14, 'MM-DD') THEN 14
    END,
    CASE
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today, 'MM-DD') THEN 'birthday'
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 3, 'MM-DD') THEN 'advance_3'
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 7, 'MM-DD') THEN 'advance_7'
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 14, 'MM-DD') THEN 'advance_14'
    END
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE p.birthday IS NOT NULL
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    AND to_char(p.birthday, 'MM-DD') IN (
      to_char(v_today, 'MM-DD'),
      to_char(v_today + 3, 'MM-DD'),
      to_char(v_today + 7, 'MM-DD'),
      to_char(v_today + 14, 'MM-DD')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.birthday_email_log l
      WHERE l.user_id = p.id
        AND l.email_type = CASE
            WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today, 'MM-DD') THEN 'birthday'
            WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 3, 'MM-DD') THEN 'advance_3'
            WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 7, 'MM-DD') THEN 'advance_7'
            WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 14, 'MM-DD') THEN 'advance_14'
          END
        AND l.sent_year = EXTRACT(YEAR FROM v_today)::int
    );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_upcoming_birthdays() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_birthdays() TO service_role;

CREATE OR REPLACE FUNCTION public.mark_birthday_email_sent(p_user_id uuid, p_email_type text)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.birthday_email_log (user_id, email_type, sent_year)
  VALUES (p_user_id, p_email_type, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo'))::int)
  ON CONFLICT (user_id, email_type, sent_year) DO NOTHING;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_birthday_email_sent(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_birthday_email_sent(uuid, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- PART 5: INACTIVE CUSTOMER EMAIL SYSTEM (45/60/90/120 days + 2 reminders)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inactive_email_log (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email_type text NOT NULL,
  last_order_at timestamptz,
  sent_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, email_type)
);

ALTER TABLE public.inactive_email_log
  DROP CONSTRAINT IF EXISTS inactive_email_log_email_type_check;
ALTER TABLE public.inactive_email_log
  ADD CONSTRAINT inactive_email_log_email_type_check
  CHECK (email_type IN ('inactive_45', 'inactive_60', 'inactive_90', 'inactive_120', 'reminder_7', 'reminder_last'));

ALTER TABLE public.inactive_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inactive_email_log FROM anon, authenticated;

-- Get inactive customers for 4 tiers
CREATE OR REPLACE FUNCTION public.get_inactive_customers()
RETURNS TABLE (
  user_id uuid, email text, display_name text, gender text,
  last_order_at timestamptz, days_inactive int, email_type text, discount_percent int
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH clo AS (
    SELECT p.id uid, u.email::text em, p.display_name nm, p.gender gen,
           COALESCE(MAX(o.created_at), p.created_at) lat,
           EXTRACT(DAY FROM (now() - COALESCE(MAX(o.created_at), p.created_at)))::int ds
    FROM public.profiles p
    INNER JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.orders o ON o.user_id = p.id AND o.status NOT IN ('cancelled')
    WHERE u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL
    GROUP BY p.id, u.email, p.display_name, p.gender, p.created_at
  )
  SELECT c.uid, c.em, c.nm, c.gen, c.lat, c.ds,
    CASE
      WHEN c.ds >= 120 THEN 'inactive_120'
      WHEN c.ds >= 90 THEN 'inactive_90'
      WHEN c.ds >= 60 THEN 'inactive_60'
      WHEN c.ds >= 45 THEN 'inactive_45'
    END,
    CASE
      WHEN c.ds >= 120 THEN 10
      WHEN c.ds >= 90 THEN 8
      WHEN c.ds >= 60 THEN 5
      WHEN c.ds >= 45 THEN 0
    END
  FROM clo c
  WHERE c.ds >= 45 AND c.ds < 240
    AND NOT EXISTS (
      SELECT 1 FROM public.inactive_email_log l
      WHERE l.user_id = c.uid
        AND l.email_type = CASE
            WHEN c.ds >= 120 THEN 'inactive_120'
            WHEN c.ds >= 90 THEN 'inactive_90'
            WHEN c.ds >= 60 THEN 'inactive_60'
            WHEN c.ds >= 45 THEN 'inactive_45'
          END
        AND l.last_order_at = c.lat
    );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_inactive_customers() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_inactive_customers() TO service_role;

-- Mark email sent + activate discount based on tier
CREATE OR REPLACE FUNCTION public.mark_inactive_email_sent(
  p_user_id uuid, p_email_type text, p_last_order_at timestamptz
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_pct int := 0;
BEGIN
  INSERT INTO public.inactive_email_log (user_id, email_type, last_order_at)
  VALUES (p_user_id, p_email_type, p_last_order_at)
  ON CONFLICT (user_id, email_type) DO UPDATE SET
    last_order_at = EXCLUDED.last_order_at, sent_at = now();

  IF p_email_type = 'inactive_60' THEN v_pct := 5;
  ELSIF p_email_type = 'inactive_90' THEN v_pct := 8;
  ELSIF p_email_type = 'inactive_120' THEN v_pct := 10;
  END IF;

  IF v_pct > 0 THEN
    UPDATE public.profiles
    SET inactive_discount_percent = v_pct,
        inactive_discount_expires_at = now() + INTERVAL '14 days'
    WHERE id = p_user_id;
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.mark_inactive_email_sent(uuid, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inactive_email_sent(uuid, text, timestamptz) TO service_role;

-- Get users needing 7-day / last-day reminders
CREATE OR REPLACE FUNCTION public.get_discount_reminders()
RETURNS TABLE (
  user_id uuid, email text, display_name text, gender text,
  discount_percent int, expires_at timestamptz, days_until_expiry int, reminder_type text
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, u.email::text, p.display_name, p.gender,
    p.inactive_discount_percent, p.inactive_discount_expires_at,
    EXTRACT(DAY FROM (p.inactive_discount_expires_at - now()))::int,
    CASE
      WHEN p.inactive_discount_expires_at - now() < INTERVAL '1 day 12 hours'
           AND p.inactive_discount_expires_at - now() > INTERVAL '12 hours' THEN 'reminder_last'
      WHEN p.inactive_discount_expires_at > now() + INTERVAL '6 days'
           AND p.inactive_discount_expires_at < now() + INTERVAL '8 days' THEN 'reminder_7'
    END
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL
    AND p.inactive_discount_percent > 0
    AND p.inactive_discount_expires_at > now()
    AND (
      (p.inactive_discount_expires_at > now() + INTERVAL '6 days'
       AND p.inactive_discount_expires_at < now() + INTERVAL '8 days')
      OR
      (p.inactive_discount_expires_at - now() < INTERVAL '1 day 12 hours'
       AND p.inactive_discount_expires_at - now() > INTERVAL '12 hours')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.inactive_email_log l
      WHERE l.user_id = p.id
        AND l.email_type = CASE
            WHEN p.inactive_discount_expires_at - now() < INTERVAL '1 day 12 hours'
                 AND p.inactive_discount_expires_at - now() > INTERVAL '12 hours' THEN 'reminder_last'
            ELSE 'reminder_7'
          END
        AND l.last_order_at = (
          SELECT COALESCE(MAX(o.created_at), p.created_at)
          FROM public.orders o
          WHERE o.user_id = p.id AND o.status NOT IN ('cancelled')
        )
    );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_discount_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_discount_reminders() TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- PART 6: AUTO-CLEAR DISCOUNT WHEN USER PLACES ORDER
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.clear_inactive_discount_on_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET inactive_discount_percent = 0,
        inactive_discount_expires_at = NULL
    WHERE id = NEW.user_id AND inactive_discount_percent > 0;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS clear_discount_on_order ON public.orders;
CREATE TRIGGER clear_discount_on_order
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.clear_inactive_discount_on_order();

-- ─────────────────────────────────────────────────────────────────
-- PART 7: FRONTEND RPC — check birthday + active discount
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_birthday_discount()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid; v_birthday date; v_is_birthday boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('is_birthday', false, 'discount', 0); END IF;
  SELECT birthday INTO v_birthday FROM public.profiles WHERE id = v_uid;
  IF v_birthday IS NULL THEN RETURN jsonb_build_object('is_birthday', false, 'discount', 0); END IF;
  v_is_birthday := (
    EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')) = EXTRACT(MONTH FROM v_birthday)
    AND EXTRACT(DAY FROM (now() AT TIME ZONE 'Asia/Tokyo')) = EXTRACT(DAY FROM v_birthday)
  );
  RETURN jsonb_build_object('is_birthday', v_is_birthday,
    'discount', CASE WHEN v_is_birthday THEN 10 ELSE 0 END,
    'birthday', v_birthday);
END; $$;

GRANT EXECUTE ON FUNCTION public.check_birthday_discount() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_active_discount()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_uid uuid; v_pct int; v_exp timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('percent', 0, 'expires_at', null); END IF;
  SELECT inactive_discount_percent, inactive_discount_expires_at
    INTO v_pct, v_exp FROM public.profiles WHERE id = v_uid;
  IF v_exp IS NULL OR v_exp < now() OR COALESCE(v_pct, 0) = 0 THEN
    RETURN jsonb_build_object('percent', 0, 'expires_at', null);
  END IF;
  RETURN jsonb_build_object('percent', v_pct, 'expires_at', v_exp,
    'days_left', GREATEST(0, EXTRACT(DAY FROM (v_exp - now()))::int));
END; $$;

GRANT EXECUTE ON FUNCTION public.get_my_active_discount() TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- PART 8: UPDATE get_member_dashboard to include birthday + discount
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_member_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_uid uuid; v_result jsonb; v_birthday date;
  v_is_birthday boolean := false;
  v_inactive_percent int := 0; v_inactive_expires timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;

  SELECT birthday, inactive_discount_percent, inactive_discount_expires_at
    INTO v_birthday, v_inactive_percent, v_inactive_expires
    FROM public.profiles WHERE id = v_uid;

  IF v_birthday IS NOT NULL THEN
    v_is_birthday := (
      EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')) = EXTRACT(MONTH FROM v_birthday)
      AND EXTRACT(DAY FROM (now() AT TIME ZONE 'Asia/Tokyo')) = EXTRACT(DAY FROM v_birthday)
    );
  END IF;

  IF v_inactive_expires IS NOT NULL AND v_inactive_expires < now() THEN
    v_inactive_percent := 0;
  END IF;

  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = v_uid),
    'balance', COALESCE((SELECT total_points FROM public.points_balance WHERE user_id = v_uid), 0),
    'orders', COALESCE((SELECT jsonb_agg(o ORDER BY o.created_at DESC)
      FROM (SELECT * FROM public.orders WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 30) o), '[]'::jsonb),
    'transactions', COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC)
      FROM (SELECT * FROM public.points_transactions WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 50) t), '[]'::jsonb),
    'coupons', COALESCE((SELECT jsonb_agg(c ORDER BY c.created_at DESC)
      FROM (SELECT * FROM public.coupons WHERE user_id = v_uid ORDER BY created_at DESC) c), '[]'::jsonb),
    'is_birthday', v_is_birthday,
    'inactive_discount', jsonb_build_object(
      'percent', COALESCE(v_inactive_percent, 0),
      'expires_at', v_inactive_expires
    )
  ) INTO v_result;

  RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_member_dashboard() TO authenticated;

-- ============================================================================
-- ✅ DONE! Verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='profiles' AND column_name IN ('gender','birthday','inactive_discount_percent','inactive_discount_expires_at');
--   SELECT * FROM public.get_inactive_customers();
--   SELECT * FROM public.get_upcoming_birthdays();
-- ============================================================================
