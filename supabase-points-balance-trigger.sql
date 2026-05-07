-- ============================================================
-- POINTS BALANCE AUTO-UPDATE TRIGGER (2026-05-07 v2 — không dùng updated_at)
-- ============================================================
-- Anh report: SQL fail với "column updated_at does not exist".
-- Em rewrite KHÔNG dùng updated_at — chỉ user_id + total_points.
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

  -- Upsert vào points_balance (chỉ user_id + total_points)
  INSERT INTO public.points_balance (user_id, total_points)
  VALUES (NEW.user_id, v_total)
  ON CONFLICT (user_id) DO UPDATE
    SET total_points = EXCLUDED.total_points;

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
-- BACKFILL: Recompute balance cho users đã có transactions
-- ============================================================
INSERT INTO public.points_balance (user_id, total_points)
SELECT user_id, COALESCE(SUM(points), 0)::integer
  FROM public.points_transactions
 GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE
  SET total_points = EXCLUDED.total_points;

-- ============================================================
-- VERIFY trigger active
-- ============================================================
SELECT tgname, tgenabled
  FROM pg_trigger
 WHERE tgrelid = 'public.points_transactions'::regclass
   AND tgname = 'trg_recompute_points_balance';
