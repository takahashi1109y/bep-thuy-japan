-- ============================================================
-- POINTS BALANCE AUTO-UPDATE TRIGGER (2026-05-07)
-- ============================================================
-- Anh report: khách click email kích hoạt 100 điểm → KHÔNG nhận được điểm.
--
-- ROOT CAUSE: claim_welcome_bonus() RPC INSERT row vào points_transactions
-- nhưng KHÔNG có trigger update points_balance.total_points.
-- → Frontend gọi RPC → return success → INSERT log → BUT balance vẫn 0.
-- → Dashboard read points_balance.total_points → hiển thị 0.
--
-- FIX: Trigger AFTER INSERT trên points_transactions tự re-compute
-- total_points = SUM(points) cho user đó → update points_balance.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recompute_points_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  -- Calc tổng điểm hiện có cho user này
  SELECT COALESCE(SUM(points), 0)::integer INTO v_total
    FROM public.points_transactions
   WHERE user_id = NEW.user_id;

  -- Upsert vào points_balance
  INSERT INTO public.points_balance (user_id, total_points, updated_at)
  VALUES (NEW.user_id, v_total, now())
  ON CONFLICT (user_id) DO UPDATE
    SET total_points = EXCLUDED.total_points,
        updated_at = now();

  RETURN NEW;
END;
$$;

-- Drop trigger cũ nếu có
DROP TRIGGER IF EXISTS trg_recompute_points_balance ON public.points_transactions;

-- Tạo trigger AFTER INSERT để auto-update balance
CREATE TRIGGER trg_recompute_points_balance
  AFTER INSERT ON public.points_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_points_balance();

-- ============================================================
-- BACKFILL: Recompute balance cho tất cả users đã có transactions
-- (cho khách đã claim welcome trước khi trigger này được tạo)
-- ============================================================
INSERT INTO public.points_balance (user_id, total_points, updated_at)
SELECT user_id, COALESCE(SUM(points), 0)::integer, now()
  FROM public.points_transactions
 GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE
  SET total_points = EXCLUDED.total_points,
      updated_at = now();

-- ============================================================
-- VERIFY
-- ============================================================
-- 1. Check trigger exists
SELECT tgname, tgenabled
  FROM pg_trigger
 WHERE tgrelid = 'public.points_transactions'::regclass
   AND tgname LIKE '%points_balance%';

-- 2. Check khách có balance đúng không (sau backfill)
SELECT b.user_id, p.display_name, b.total_points, b.updated_at
  FROM public.points_balance b
  LEFT JOIN public.profiles p ON p.id = b.user_id
 ORDER BY b.updated_at DESC
 LIMIT 10;
