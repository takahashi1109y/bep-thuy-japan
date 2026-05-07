-- ============================================================
-- FORCE CLAIM 100Đ CHO 2 ACCOUNTS MOBILE SIGNUP (2026-05-08)
-- ============================================================
-- Anh signup 2 accounts từ điện thoại nhưng không có 100đ:
--   1. phannguyen8505@gmail.com
--   2. thanghoang1109+test104@gmail.com
--
-- Khả năng cao nhất (Hypothesis C — 80%): khách CHƯA click email kích
-- hoạt 100đ từ GetResponse (chỉ click email confirm Supabase).
-- ============================================================

-- 1. DIAGNOSTIC: state 2 accounts
SELECT u.email,
       u.email_confirmed_at::text AS email_confirmed,
       (p.id IS NOT NULL) AS profile_exists,
       p.welcome_claimed_at::text AS claimed_at,
       p.phone,
       (SELECT COUNT(*) FROM public.points_transactions WHERE user_id = u.id) AS tx_count,
       (SELECT total_points FROM public.points_balance WHERE user_id = u.id) AS balance
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE u.email IN ('phannguyen8505@gmail.com', 'thanghoang1109+test104@gmail.com')
 ORDER BY u.created_at;

-- ============================================================
-- 2. FORCE CLAIM (chỉ chạy nếu profile_exists = true + email_confirmed_at NOT NULL)
-- ============================================================

-- Insert welcome transaction cho mỗi user
INSERT INTO public.points_transactions
  (user_id, order_no, order_total, points, type, description)
SELECT id, NULL, NULL, 100, 'welcome',
       'Welcome bonus 100đ — force claim 2026-05-08 (mobile signup recovery)'
  FROM auth.users
 WHERE email IN ('phannguyen8505@gmail.com', 'thanghoang1109+test104@gmail.com')
   AND email_confirmed_at IS NOT NULL
   AND id NOT IN (
     SELECT user_id FROM public.points_transactions WHERE type = 'welcome'
   );

-- Mark claimed
UPDATE public.profiles
   SET welcome_claimed_at = now()
 WHERE id IN (
   SELECT id FROM auth.users
    WHERE email IN ('phannguyen8505@gmail.com', 'thanghoang1109+test104@gmail.com')
 )
   AND welcome_claimed_at IS NULL;

-- ============================================================
-- 3. VERIFY
-- ============================================================
SELECT u.email,
       p.welcome_claimed_at::text,
       (SELECT total_points FROM public.points_balance WHERE user_id = u.id) AS balance,
       (SELECT COUNT(*) FROM public.points_transactions WHERE user_id = u.id AND type = 'welcome') AS welcome_count
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
 WHERE u.email IN ('phannguyen8505@gmail.com', 'thanghoang1109+test104@gmail.com');
-- Mong đợi: welcome_claimed_at có timestamp, balance = 100, welcome_count = 1
