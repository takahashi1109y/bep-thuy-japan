-- ============================================================
-- WELCOME BONUS — ALL-IN-ONE DIAGNOSTIC + AUTO-FIX (2026-05-07)
-- ============================================================
-- Em đã trace 4 potential failure points cho welcome 100 điểm:
--   1. CHECK constraint type không có 'welcome' → INSERT fail
--   2. Trigger update points_balance chưa exist → balance=0 dù claim OK
--   3. order_no/order_total NOT NULL → RPC INSERT NULL fail
--   4. profiles.welcome_claimed_at column missing → UPDATE 0 rows
--
-- File này AUTO-FIX tất cả (idempotent — chạy nhiều lần OK).
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 1: AUTO-FIX MISSING PIECES                       ║
-- ╚══════════════════════════════════════════════════════════╝

-- 1.1: Đảm bảo profiles có column welcome_claimed_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND column_name = 'welcome_claimed_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN welcome_claimed_at timestamptz;
    RAISE NOTICE 'ADDED welcome_claimed_at column to profiles';
  END IF;
END $$;

-- 1.2: Đảm bảo points_transactions allow NULL cho order_no, order_total
-- (welcome bonus không có order)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.points_transactions ALTER COLUMN order_no DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ALTER TABLE public.points_transactions ALTER COLUMN order_total DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 1.3: Đảm bảo CHECK constraint trên type bao gồm 'welcome'
DO $$
DECLARE
  con_name text;
BEGIN
  -- Drop old CHECK if exist
  SELECT conname INTO con_name FROM pg_constraint
   WHERE conrelid = 'public.points_transactions'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%type%';
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.points_transactions DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE public.points_transactions
  ADD CONSTRAINT points_transactions_type_check
  CHECK (type IN (
    'earn', 'redeem', 'expire', 'manual', 'adjustment',
    'welcome', 'birthday', 'referral', 'order', 'refund'
  ));

-- 1.4: GRANT EXECUTE claim_welcome_bonus
GRANT EXECUTE ON FUNCTION public.claim_welcome_bonus() TO authenticated;

-- 1.5: Trigger update points_balance sau INSERT points_transactions
CREATE OR REPLACE FUNCTION public.recompute_points_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  SELECT COALESCE(SUM(points), 0)::integer INTO v_total
    FROM public.points_transactions
   WHERE user_id = NEW.user_id;

  INSERT INTO public.points_balance (user_id, total_points)
  VALUES (NEW.user_id, v_total)
  ON CONFLICT (user_id) DO UPDATE
    SET total_points = EXCLUDED.total_points;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_points_balance ON public.points_transactions;
CREATE TRIGGER trg_recompute_points_balance
  AFTER INSERT ON public.points_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_points_balance();

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 2: BACKFILL points_balance                       ║
-- ╚══════════════════════════════════════════════════════════╝

INSERT INTO public.points_balance (user_id, total_points)
SELECT user_id, COALESCE(SUM(points), 0)::integer
  FROM public.points_transactions
 GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE
  SET total_points = EXCLUDED.total_points;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 3: VERIFY                                        ║
-- ╚══════════════════════════════════════════════════════════╝

-- 3.1: Trigger active?
SELECT 'Trigger' AS test, tgname AS result, tgenabled::text AS enabled
  FROM pg_trigger
 WHERE tgrelid = 'public.points_transactions'::regclass
   AND tgname = 'trg_recompute_points_balance';

-- 3.2: CHECK constraint allows 'welcome'?
SELECT 'Type CHECK' AS test, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.points_transactions'::regclass
   AND contype = 'c';

-- 3.3: welcome_claimed_at column exists?
SELECT 'welcome_claimed_at' AS test, column_name AS result
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles'
   AND column_name = 'welcome_claimed_at';

-- 3.4: RPC GRANT?
SELECT 'RPC GRANT' AS test, grantee, privilege_type
  FROM information_schema.routine_privileges
 WHERE routine_schema = 'public' AND routine_name = 'claim_welcome_bonus';

-- 3.5: Khách test99 status
SELECT 'test99' AS test,
       p.id AS user_id,
       p.welcome_claimed_at,
       (SELECT total_points FROM public.points_balance WHERE user_id = p.id) AS balance,
       (SELECT COUNT(*) FROM public.points_transactions WHERE user_id = p.id AND type = 'welcome') AS welcome_claims_count
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
 WHERE u.email LIKE '%test99%' OR u.email LIKE '%test100%'
 LIMIT 5;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 4: RESET test99 ĐỂ TEST LẠI (OPTIONAL)           ║
-- ╚══════════════════════════════════════════════════════════╝
-- Nếu khách test99 đã claim trước đây (welcome_claimed_at có giá trị)
-- và anh muốn test claim lại → uncomment dòng sau:
--
-- UPDATE public.profiles
--    SET welcome_claimed_at = NULL
--  WHERE id IN (
--    SELECT id FROM auth.users WHERE email LIKE '%test99%' OR email LIKE '%test100%'
--  );
--
-- DELETE FROM public.points_transactions
--  WHERE type = 'welcome'
--    AND user_id IN (
--      SELECT id FROM auth.users WHERE email LIKE '%test99%' OR email LIKE '%test100%'
--    );
--
-- Sau đó refresh /thanh-vien?claim=welcome → khách phải nhận được 100 điểm.
