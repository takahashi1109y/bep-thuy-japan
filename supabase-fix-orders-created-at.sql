-- ============================================================
-- FIX: orders.created_at thiếu DEFAULT now() (2026-05-09)
-- ============================================================
-- ROOT CAUSE: Đơn 0206 có created_at=NULL → frontend bug
-- Apps Script saveOrderToSupabase() KHÔNG set created_at trong payload
-- → phụ thuộc DB DEFAULT. Schema thiếu DEFAULT → NULL.
--
-- FIX 2 layer (defensive):
--   1. DB: SET DEFAULT now() — đơn mới tự gán nếu Apps Script không set
--   2. Apps Script: thêm created_at: ISO string (commit sau, file riêng)
--
-- BACKFILL: UPDATE rows NULL hiện có dùng created_at từ updated_at hoặc now()
-- ============================================================

-- 1. Set DEFAULT now() cho cột created_at
ALTER TABLE public.orders
  ALTER COLUMN created_at SET DEFAULT now();

-- 2. Backfill rows NULL — dùng updated_at nếu có, không thì now()
UPDATE public.orders
   SET created_at = COALESCE(updated_at, now())
 WHERE created_at IS NULL;

-- 3. Plus SET NOT NULL để chắc chắn không bao giờ NULL nữa
ALTER TABLE public.orders
  ALTER COLUMN created_at SET NOT NULL;

-- ============================================================
-- VERIFY
-- ============================================================

WITH checks AS (
  SELECT 1 AS num,
    'Cot created_at co DEFAULT now()' AS name,
    CASE WHEN EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders' AND column_name='created_at'
        AND column_default LIKE '%now()%'
    ) THEN 'PASS' ELSE 'FAIL' END AS status,
    COALESCE((SELECT column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders' AND column_name='created_at'), 'NULL') AS detail

  UNION ALL
  SELECT 2,
    'Cot created_at NOT NULL',
    CASE WHEN EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders' AND column_name='created_at'
        AND is_nullable='NO'
    ) THEN 'PASS' ELSE 'FAIL' END,
    ''

  UNION ALL
  SELECT 3,
    'Khong con row nao co created_at NULL',
    CASE WHEN (SELECT COUNT(*) FROM public.orders WHERE created_at IS NULL) = 0
    THEN 'PASS' ELSE 'FAIL' END,
    'So row NULL: ' || (SELECT COUNT(*) FROM public.orders WHERE created_at IS NULL)::text

  UNION ALL
  SELECT 4,
    'Don 0206 co created_at sau backfill',
    CASE WHEN EXISTS(
      SELECT 1 FROM public.orders
      WHERE order_no='0206' AND created_at IS NOT NULL
    ) THEN 'PASS' ELSE 'FAIL' END,
    COALESCE((SELECT created_at::text FROM public.orders WHERE order_no='0206'), 'NOT FOUND')
)
SELECT num, status, name, detail FROM checks ORDER BY num;
