-- ============================================================
-- DIAGNOSE: Khach DA verify email nhung CHUA claim 100d
-- ============================================================
-- Goal: Biet bao nhieu khach can gui email reminder
-- ============================================================

-- Q1: Count overview
SELECT
  COUNT(*) FILTER (WHERE u.email_confirmed_at IS NOT NULL AND p.bonus_claimed = false AND p.bonus_token IS NOT NULL) AS pending_reminders,
  COUNT(*) FILTER (WHERE p.bonus_claimed = true) AS already_claimed,
  COUNT(*) FILTER (WHERE u.email_confirmed_at IS NULL) AS not_verified,
  COUNT(*) FILTER (WHERE p.bonus_token IS NULL) AS no_token,
  COUNT(*) AS total_users
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id;

-- Q2: Sample 10 khach pending (de check truoc khi gui)
SELECT
  u.email,
  p.display_name,
  u.email_confirmed_at::date AS verified_date,
  p.bonus_token IS NOT NULL AS has_token,
  p.created_at::date AS signup_date
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.email_confirmed_at IS NOT NULL
  AND p.bonus_claimed = false
  AND p.bonus_token IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 10;
