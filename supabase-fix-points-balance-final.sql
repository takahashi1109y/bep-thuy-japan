-- ============================================================
-- FIX POINTS BALANCE — FINAL (2026-05-09)
-- ============================================================
-- Root cause bugs P0.A + P0.B:
--   1. points_balance co the bi drop/corrupt sau nhieu lan migration
--   2. Thieu RLS policy tren points_transactions cho authenticated users
--   3. Trigger cu (TABLE approach) conflict voi VIEW approach
--
-- Strategy: VIEW approach (V10 breakthrough — auto-compute, no trigger)
--   - Drop trigger/function cu neu co
--   - Drop TABLE points_balance neu co (de tao VIEW thay the)
--   - CREATE VIEW points_balance (computed tu points_transactions)
--   - GRANT SELECT cho authenticated + service_role
--   - Add RLS policy: users read OWN points_transactions
--
-- Idempotent — chay nhieu lan OK.
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 1: CLEANUP — drop trigger/function cu            ║
-- ╚══════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_recompute_points_balance ON public.points_transactions;
DROP FUNCTION IF EXISTS public.recompute_points_balance();

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 2: DROP TABLE neu points_balance la TABLE        ║
-- ╚══════════════════════════════════════════════════════════╝

DO $$
DECLARE
  v_type text;
BEGIN
  SELECT table_type INTO v_type
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'points_balance';

  IF v_type = 'BASE TABLE' THEN
    RAISE NOTICE 'points_balance is TABLE — dropping to recreate as VIEW';
    DROP TABLE public.points_balance CASCADE;
  ELSIF v_type = 'VIEW' THEN
    RAISE NOTICE 'points_balance is VIEW — dropping to recreate fresh';
    DROP VIEW public.points_balance CASCADE;
  ELSE
    RAISE NOTICE 'points_balance does not exist — will create fresh';
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 3: CREATE VIEW points_balance                    ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE VIEW public.points_balance AS
SELECT
  user_id,
  COALESCE(SUM(points), 0)::integer AS total_points
FROM public.points_transactions
GROUP BY user_id;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 4: GRANT permissions                             ║
-- ╚══════════════════════════════════════════════════════════╝

GRANT SELECT ON public.points_balance TO authenticated;
GRANT SELECT ON public.points_balance TO service_role;
-- KHONG grant cho anon — anonymous users KHONG duoc xem balance cua bat ky ai

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 5: RLS policy — users read OWN points            ║
-- ╚══════════════════════════════════════════════════════════╝

-- Ensure RLS is enabled on points_transactions
ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own points transactions
DROP POLICY IF EXISTS "Users read own points" ON public.points_transactions;
CREATE POLICY "Users read own points" ON public.points_transactions
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert own points (for claim_welcome_bonus RPC — SECURITY DEFINER handles this,
-- but explicit policy avoids edge cases)
DROP POLICY IF EXISTS "Users insert own points" ON public.points_transactions;
CREATE POLICY "Users insert own points" ON public.points_transactions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admin reads all points (re-create to ensure exists)
DROP POLICY IF EXISTS "Admin reads all points" ON public.points_transactions;
CREATE POLICY "Admin reads all points" ON public.points_transactions
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- Service role bypass (for Apps Script)
DROP POLICY IF EXISTS "Service role full access points" ON public.points_transactions;
CREATE POLICY "Service role full access points" ON public.points_transactions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 6: VERIFY — chay xong phai thay ket qua nay      ║
-- ╚══════════════════════════════════════════════════════════╝

-- 6.1: points_balance phai la VIEW
SELECT 'points_balance_type' AS test,
       table_type AS result
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'points_balance';
-- Expected: VIEW

-- 6.2: VIEW definition
SELECT 'view_definition' AS test,
       view_definition AS result
  FROM information_schema.views
 WHERE table_schema = 'public' AND table_name = 'points_balance';
-- Expected: SELECT ... FROM points_transactions GROUP BY user_id

-- 6.3: Trigger should NOT exist (VIEW approach = no trigger)
SELECT 'trigger_check' AS test, COUNT(*) AS result
  FROM pg_trigger
 WHERE tgrelid = 'public.points_transactions'::regclass
   AND tgname = 'trg_recompute_points_balance';
-- Expected: 0

-- 6.4: RLS policies on points_transactions
SELECT 'rls_policies' AS test, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'points_transactions';
-- Expected: 4 policies (Users read own, Users insert own, Admin reads all, Service role)

-- 6.5: Count total points_transactions rows
SELECT 'total_transactions' AS test, COUNT(*) AS result
  FROM public.points_transactions;

-- 6.6: Sample balance (top 5 users by points)
SELECT 'top_balances' AS test, user_id, total_points
  FROM public.points_balance
 ORDER BY total_points DESC
 LIMIT 5;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ DONE — Anh copy ket qua 6.1-6.6 gui em verify           ║
-- ╚══════════════════════════════════════════════════════════╝
