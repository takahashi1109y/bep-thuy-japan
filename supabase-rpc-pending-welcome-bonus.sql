-- ============================================================
-- RPC: get_pending_welcome_bonus_users()
-- Tra ve list khach DA verify email + CHUA claim 100d
-- ============================================================
-- Apps Script goi qua service_role → khong can RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_pending_welcome_bonus_users()
RETURNS TABLE(
  email text,
  display_name text,
  bonus_token text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    u.email::text,
    COALESCE(p.display_name, '')::text,
    p.bonus_token
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.email_confirmed_at IS NOT NULL  -- da verify email
    AND p.bonus_claimed = false             -- chua claim
    AND p.bonus_token IS NOT NULL           -- co token
    AND u.email IS NOT NULL
  ORDER BY p.created_at DESC;
$$;

-- Chi service_role goi duoc
REVOKE EXECUTE ON FUNCTION public.get_pending_welcome_bonus_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_welcome_bonus_users() TO service_role;

-- VERIFY
SELECT 'rpc_exists' AS check_step,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.routines
         WHERE routine_schema = 'public'
           AND routine_name = 'get_pending_welcome_bonus_users'
       ) THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'pending_count' AS check_step,
       COUNT(*) AS num_pending
FROM public.get_pending_welcome_bonus_users();
