-- ============================================================
-- P1.D — RPC: get_recent_welcome_claims(hours)
-- ============================================================
-- Tra ve list welcome bonus claims trong N hours qua
-- de Apps Script analyze pattern fraud va alert qua Telegram.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_recent_welcome_claims(p_hours int DEFAULT 1)
RETURNS TABLE(
  user_id uuid,
  email text,
  signup_ip text,
  email_domain text,
  signup_at timestamptz,
  claimed_at timestamptz,
  seconds_to_claim int
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id,
    u.email::text,
    p.signup_ip,
    lower(split_part(u.email, '@', 2)) AS email_domain,
    p.created_at AS signup_at,
    p.welcome_claimed_at AS claimed_at,
    EXTRACT(EPOCH FROM (p.welcome_claimed_at - p.created_at))::int AS seconds_to_claim
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.bonus_claimed = true
    AND p.welcome_claimed_at IS NOT NULL
    AND p.welcome_claimed_at >= now() - (p_hours || ' hours')::interval
  ORDER BY p.welcome_claimed_at DESC;
$$;

-- Chi service_role goi (Apps Script)
REVOKE EXECUTE ON FUNCTION public.get_recent_welcome_claims(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_welcome_claims(int) TO service_role;

-- VERIFY
SELECT 'rpc_exists' AS test,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.routines
         WHERE routine_schema = 'public'
           AND routine_name = 'get_recent_welcome_claims'
       ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- Test query (last 24h)
SELECT 'recent_24h_count' AS test,
       COUNT(*) AS num_claims
FROM public.get_recent_welcome_claims(24);
