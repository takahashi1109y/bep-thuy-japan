-- ============================================================
-- WELCOME BONUS — CLEANUP TRIGGER KHÔNG CẦN (2026-05-07)
-- ============================================================
-- INSIGHT: points_balance KHÔNG phải table mà là VIEW computed
-- từ points_transactions với GROUP BY. View tự auto-compute total_points
-- → KHÔNG cần trigger update.
--
-- Em đã thử CREATE TRIGGER + INSERT vào points_balance trong commit
-- trước → fail vì view không updatable. File này CLEANUP.
-- ============================================================

-- 1. Drop trigger sai (nếu trước đó đã tạo thành công)
DROP TRIGGER IF EXISTS trg_recompute_points_balance ON public.points_transactions;

-- 2. Drop function sai
DROP FUNCTION IF EXISTS public.recompute_points_balance();

-- ============================================================
-- VERIFY: points_balance đúng là VIEW + balance khách hiển thị đúng
-- ============================================================

-- View definition
SELECT 'points_balance type' AS test, table_type AS result
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'points_balance';
-- Expected: VIEW

-- View definition source
SELECT view_definition
  FROM information_schema.views
 WHERE table_schema = 'public' AND table_name = 'points_balance';

-- Khách test99 hiện có bao nhiêu điểm?
SELECT u.email, b.total_points, p.welcome_claimed_at
  FROM public.points_balance b
  JOIN auth.users u ON u.id = b.user_id
  JOIN public.profiles p ON p.id = b.user_id
 WHERE u.email LIKE '%test99%' OR u.email LIKE '%test100%'
 LIMIT 5;
