-- ============================================================
-- Bếp Thuỷ Japan — AUTO BIRTHDAY EMAILS
-- 4 emails: 14 days before, 7 days before, 3 days before, on birthday
-- Run in Supabase SQL Editor (2026-04-25)
-- ============================================================

-- 1. LOG TABLE: track which emails were sent (prevent duplicates)
CREATE TABLE IF NOT EXISTS public.birthday_email_log (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email_type text CHECK (email_type IN ('advance_14', 'advance_7', 'advance_3', 'birthday')) NOT NULL,
  sent_year int NOT NULL,
  sent_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, email_type, sent_year)
);

ALTER TABLE public.birthday_email_log ENABLE ROW LEVEL SECURITY;

-- Only service_role can write (Apps Script uses service_role)
REVOKE ALL ON public.birthday_email_log FROM anon, authenticated;

-- 2. RPC: get_upcoming_birthdays() — returns list of users whose birthday is in {0, 3, 7, 14} days
-- Skip users who already received that email type this year
CREATE OR REPLACE FUNCTION public.get_upcoming_birthdays()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  gender text,
  birthday date,
  days_until int,
  email_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today date;
BEGIN
  -- Use JST timezone
  v_today := (now() AT TIME ZONE 'Asia/Tokyo')::date;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    u.email::text,
    p.display_name,
    p.gender,
    p.birthday,
    CASE
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today, 'MM-DD') THEN 0
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 3, 'MM-DD') THEN 3
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 7, 'MM-DD') THEN 7
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 14, 'MM-DD') THEN 14
    END AS days_until,
    CASE
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today, 'MM-DD') THEN 'birthday'
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 3, 'MM-DD') THEN 'advance_3'
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 7, 'MM-DD') THEN 'advance_7'
      WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 14, 'MM-DD') THEN 'advance_14'
    END AS email_type
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE p.birthday IS NOT NULL
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL  -- Chi gui email da xac nhan
    AND (
      to_char(p.birthday, 'MM-DD') = to_char(v_today, 'MM-DD')
      OR to_char(p.birthday, 'MM-DD') = to_char(v_today + 3, 'MM-DD')
      OR to_char(p.birthday, 'MM-DD') = to_char(v_today + 7, 'MM-DD')
      OR to_char(p.birthday, 'MM-DD') = to_char(v_today + 14, 'MM-DD')
    )
    -- Skip neu da gui email loai nay trong nam nay
    AND NOT EXISTS (
      SELECT 1 FROM public.birthday_email_log l
      WHERE l.user_id = p.id
        AND l.email_type = (
          CASE
            WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today, 'MM-DD') THEN 'birthday'
            WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 3, 'MM-DD') THEN 'advance_3'
            WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 7, 'MM-DD') THEN 'advance_7'
            WHEN to_char(p.birthday, 'MM-DD') = to_char(v_today + 14, 'MM-DD') THEN 'advance_14'
          END
        )
        AND l.sent_year = EXTRACT(YEAR FROM v_today)::int
    );
END;
$$;

-- Only service_role can call
REVOKE EXECUTE ON FUNCTION public.get_upcoming_birthdays() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_birthdays() TO service_role;

-- 3. RPC: mark_birthday_email_sent(user_id, email_type)
CREATE OR REPLACE FUNCTION public.mark_birthday_email_sent(p_user_id uuid, p_email_type text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.birthday_email_log (user_id, email_type, sent_year)
  VALUES (p_user_id, p_email_type, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo'))::int)
  ON CONFLICT (user_id, email_type, sent_year) DO NOTHING;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_birthday_email_sent(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_birthday_email_sent(uuid, text) TO service_role;

-- ============================================================
-- DONE. Test: SELECT * FROM public.get_upcoming_birthdays();
-- ============================================================
