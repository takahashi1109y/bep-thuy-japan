-- ============================================================
-- RPC: get_emails_with_tokens()
-- Sync helper: trả về list email + bonus_token của khách hàng
-- để Apps Script đẩy sang GR.
-- ============================================================
-- An toàn: chỉ service_role gọi được (KHÔNG cho authenticated/anon).
-- Apps Script dùng service_role key → OK.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_emails_with_tokens()
RETURNS TABLE(email text, bonus_token text)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT u.email::text, p.bonus_token
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
   WHERE p.bonus_token IS NOT NULL
     AND u.email IS NOT NULL
   ORDER BY u.created_at DESC;
$$;

-- REVOKE từ public, anon, authenticated (chỉ service_role gọi được)
REVOKE EXECUTE ON FUNCTION public.get_emails_with_tokens() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_emails_with_tokens() TO service_role;

-- ============================================================
-- VERIFY
-- ============================================================
SELECT
  '1. Function ton tai' AS check_step,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema='public' AND routine_name='get_emails_with_tokens'
  ) THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT '2. service_role co EXECUTE',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE specific_schema='public'
      AND specific_name LIKE 'get_emails_with_tokens%'
      AND grantee='service_role'
      AND privilege_type='EXECUTE'
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT '3. authenticated KHONG co EXECUTE',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE specific_schema='public'
      AND specific_name LIKE 'get_emails_with_tokens%'
      AND grantee IN ('anon','authenticated')
      AND privilege_type='EXECUTE'
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT '4. RPC tra ve dung so khach',
  CASE WHEN (SELECT COUNT(*) FROM public.get_emails_with_tokens()) > 0
       THEN 'PASS' ELSE 'FAIL' END;
