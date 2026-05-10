-- ============================================================
-- REFERRAL PROGRAM — PHASE 5: Email notification tracking
-- ============================================================
-- Add column email_sent vào referral_notifications de Apps Script cron
-- biet noti nao chua gui email cho A.
--
-- Idempotent.
-- ============================================================

-- Add column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='referral_notifications'
     AND column_name='email_sent') THEN
    ALTER TABLE public.referral_notifications ADD COLUMN email_sent boolean DEFAULT false;
    RAISE NOTICE 'ADDED referral_notifications.email_sent';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='referral_notifications'
     AND column_name='email_sent_at') THEN
    ALTER TABLE public.referral_notifications ADD COLUMN email_sent_at timestamptz;
    RAISE NOTICE 'ADDED referral_notifications.email_sent_at';
  END IF;
END $$;

-- Index for efficient cron query
CREATE INDEX IF NOT EXISTS idx_referral_notifs_unsent_email
  ON public.referral_notifications(created_at)
 WHERE email_sent = false;

-- RPC for Apps Script to query unsent + user email + name
-- Service role only (Apps Script uses service_role key)

CREATE OR REPLACE FUNCTION public.get_unsent_referral_emails(p_limit int DEFAULT 50)
RETURNS TABLE(
  notif_id     bigint,
  user_email   text,
  user_name    text,
  points       int,
  referee_name text,
  order_no     text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    n.id,
    u.email::text,
    COALESCE(p.display_name, '')::text,
    n.points,
    COALESCE(n.referee_name, '')::text,
    COALESCE(n.order_no, '')::text
  FROM public.referral_notifications n
  JOIN auth.users u ON u.id = n.user_id
  LEFT JOIN public.profiles p ON p.id = n.user_id
  WHERE n.email_sent = false
    AND u.email IS NOT NULL
  ORDER BY n.created_at ASC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.get_unsent_referral_emails(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unsent_referral_emails(int) TO service_role;

-- RPC for Apps Script to mark sent
CREATE OR REPLACE FUNCTION public.mark_referral_email_sent(p_notif_id bigint)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.referral_notifications
     SET email_sent = true,
         email_sent_at = now()
   WHERE id = p_notif_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_referral_email_sent(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_referral_email_sent(bigint) TO service_role;

-- VERIFY
SELECT 'Q1_COLUMNS' AS test,
       COUNT(*) FILTER (WHERE column_name = 'email_sent') AS has_email_sent,
       COUNT(*) FILTER (WHERE column_name = 'email_sent_at') AS has_sent_at
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='referral_notifications';

SELECT 'Q2_RPCS' AS test,
       COUNT(*) FILTER (WHERE routine_name = 'get_unsent_referral_emails') AS has_get,
       COUNT(*) FILTER (WHERE routine_name = 'mark_referral_email_sent') AS has_mark
  FROM information_schema.routines
 WHERE routine_schema = 'public';
