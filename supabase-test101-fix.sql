-- ============================================================
-- TEST101 NUCLEAR RESET + AUTO-CLAIM (2026-05-08)
-- ============================================================
-- 4 agents audit kết luận: test101 polluted (browser cache + DB residue
-- từ manual INSERTs cả ngày). Script này reset + manual claim 100 điểm
-- giúp test101 có trạng thái clean như test102.
-- ============================================================

-- 1. SHOW state hiện tại trước khi reset
SELECT 'BEFORE reset' AS step,
       u.email,
       p.welcome_claimed_at::text,
       (SELECT COUNT(*)::text FROM public.points_transactions WHERE user_id = u.id) AS tx_count,
       (SELECT total_points::text FROM public.points_balance WHERE user_id = u.id) AS balance
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
 WHERE u.email = 'thanghoang1109+test101@gmail.com';

-- 2. NUCLEAR RESET — xoá toàn bộ welcome data của test101
DELETE FROM public.points_transactions
 WHERE type = 'welcome'
   AND user_id = (SELECT id FROM auth.users WHERE email = 'thanghoang1109+test101@gmail.com');

UPDATE public.profiles
   SET welcome_claimed_at = NULL
 WHERE id = (SELECT id FROM auth.users WHERE email = 'thanghoang1109+test101@gmail.com');

-- 3. MANUAL CLAIM 100 điểm (giả lập RPC chạy thành công)
INSERT INTO public.points_transactions
  (user_id, order_no, order_total, points, type, description)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'thanghoang1109+test101@gmail.com'),
  NULL, NULL, 100, 'welcome',
  'Thưởng chào mừng đăng ký thành viên 🎁 (manual fix 2026-05-08)'
);

UPDATE public.profiles
   SET welcome_claimed_at = now()
 WHERE id = (SELECT id FROM auth.users WHERE email = 'thanghoang1109+test101@gmail.com');

-- 4. VERIFY: test101 phải có 100 điểm
SELECT 'AFTER manual claim' AS step,
       u.email,
       p.welcome_claimed_at::text,
       (SELECT COUNT(*)::text FROM public.points_transactions WHERE user_id = u.id AND type = 'welcome') AS welcome_claims,
       (SELECT total_points::text FROM public.points_balance WHERE user_id = u.id) AS balance
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
 WHERE u.email = 'thanghoang1109+test101@gmail.com';
-- Mong đợi: welcome_claimed_at có timestamp, welcome_claims=1, balance=100
