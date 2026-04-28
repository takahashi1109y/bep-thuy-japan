-- ============================================================
-- Migration: Inventory Management for product_catalog
-- ============================================================
-- Adds: stock tracking, public read for index.html, atomic deduct RPC
-- Run ONE time in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================

-- 1. Add new columns to product_catalog
ALTER TABLE public.product_catalog
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS stock_quantity numeric(10,2) NOT NULL DEFAULT 999,
  ADD COLUMN IF NOT EXISTS stock_unit text NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(10,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Backfill product codes (matches CODE_MAP in google-apps-script.js)
UPDATE public.product_catalog SET code='GT',        stock_unit='kg',  low_stock_threshold=5  WHERE id=1;
UPDATE public.product_catalog SET code='GKT',       stock_unit='kg',  low_stock_threshold=5  WHERE id=2;
UPDATE public.product_catalog SET code='C',         stock_unit='kg',  low_stock_threshold=5  WHERE id=3;
UPDATE public.product_catalog SET code='CKT',       stock_unit='kg',  low_stock_threshold=5  WHERE id=4;
UPDATE public.product_catalog SET code='CLUA',      stock_unit='kg',  low_stock_threshold=5  WHERE id=5;
UPDATE public.product_catalog SET code='M',         stock_unit='kg',  low_stock_threshold=5  WHERE id=6;
UPDATE public.product_catalog SET code='MKT',       stock_unit='kg',  low_stock_threshold=5  WHERE id=7;
UPDATE public.product_catalog SET code='Nem',       stock_unit='túi', low_stock_threshold=5  WHERE id=8;
UPDATE public.product_catalog SET code='Pte',       stock_unit='hộp', low_stock_threshold=5  WHERE id=9;
UPDATE public.product_catalog SET code='CLUA TIEU', stock_unit='kg',  low_stock_threshold=5  WHERE id=10;

-- Make code NOT NULL + unique (after backfill)
ALTER TABLE public.product_catalog ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_catalog_code ON public.product_catalog(code);

-- 3. Public SELECT policy (so index.html anon users can read active products)
DROP POLICY IF EXISTS "Public read active products" ON public.product_catalog;
CREATE POLICY "Public read active products" ON public.product_catalog
FOR SELECT TO anon, authenticated
USING (is_active = true);

-- 4. Atomic stock deduction RPC (called by Apps Script after each order)
-- Input: jsonb array [{ "code": "GT", "amount": 1.5 }, { "code": "Pte", "amount": 2 }]
-- Output: jsonb array with remaining stock per item
DROP FUNCTION IF EXISTS public.deduct_stock_for_order(jsonb);
CREATE OR REPLACE FUNCTION public.deduct_stock_for_order(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_code text;
  v_amount numeric;
  v_remaining numeric;
  v_results jsonb := '[]'::jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_code := v_item->>'code';
    v_amount := COALESCE((v_item->>'amount')::numeric, 0);

    IF v_amount <= 0 THEN CONTINUE; END IF;

    UPDATE public.product_catalog
    SET stock_quantity = stock_quantity - v_amount
    WHERE code = v_code
    RETURNING stock_quantity INTO v_remaining;

    IF FOUND THEN
      v_results := v_results || jsonb_build_object(
        'code', v_code,
        'deducted', v_amount,
        'remaining', v_remaining
      );
    ELSE
      v_results := v_results || jsonb_build_object(
        'code', v_code,
        'error', 'product_not_found'
      );
    END IF;
  END LOOP;
  RETURN v_results;
END $$;

GRANT EXECUTE ON FUNCTION public.deduct_stock_for_order(jsonb) TO authenticated, service_role;

-- 5. Admin RPC: bulk update stock + price + active flag (used by admin tab)
DROP FUNCTION IF EXISTS public.admin_update_product(int, numeric, int, boolean, numeric, text);
CREATE OR REPLACE FUNCTION public.admin_update_product(
  p_id int,
  p_stock_quantity numeric DEFAULT NULL,
  p_unit_price int DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_low_stock_threshold numeric DEFAULT NULL,
  p_image_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_check int;
  v_row public.product_catalog;
BEGIN
  -- Verify caller is admin
  SELECT 1 INTO v_admin_check FROM public.admin_users WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  UPDATE public.product_catalog
  SET stock_quantity      = COALESCE(p_stock_quantity, stock_quantity),
      unit_price          = COALESCE(p_unit_price, unit_price),
      is_active           = COALESCE(p_is_active, is_active),
      low_stock_threshold = COALESCE(p_low_stock_threshold, low_stock_threshold),
      image_url           = COALESCE(p_image_url, image_url),
      updated_at          = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'product', row_to_json(v_row));
END $$;

GRANT EXECUTE ON FUNCTION public.admin_update_product(int, numeric, int, boolean, numeric, text) TO authenticated;

-- 6. Verification — show current state
SELECT
  id,
  code,
  name,
  unit_label,
  unit_price,
  stock_quantity,
  stock_unit,
  low_stock_threshold,
  is_active,
  display_order
FROM public.product_catalog
ORDER BY display_order;
