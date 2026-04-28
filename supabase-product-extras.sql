-- ============================================================
-- Migration: Description + Image Storage for product_catalog
-- ============================================================
-- Adds: description column, Supabase Storage bucket, RLS for image upload
-- Extends admin_update_product RPC to accept description + code + name
--
-- Run ONE time in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================

-- 1. Add description column (markdown / plain text)
ALTER TABLE public.product_catalog
  ADD COLUMN IF NOT EXISTS description text;

-- 2. Backfill description from current hardcoded copy in index.html
UPDATE public.product_catalog SET description = 'Giò được gói lá chuối thơm, thịt heo xay mịn, hạt tiêu xanh phơi một nắng thơm dậy mùi, không cay hăng, chuẩn vị miền bắc phố cổ Hàng Bông Hà Nội.' WHERE id = 1 AND description IS NULL;
UPDATE public.product_catalog SET description = 'Phù hợp cho trẻ em và người không ăn được cay. Thịt dai, dòn mềm tự nhiên, hương vị chuẩn giò truyền thống miền bắc phố cổ Hàng Bông Hà Nội.' WHERE id = 2 AND description IS NULL;
UPDATE public.product_catalog SET description = 'Chả quế vàng ươm, thơm mùi quế tự nhiên, có hạt tiêu. Ăn kèm bánh mì, bún phở sáng cực hợp.' WHERE id = 3 AND description IS NULL;
UPDATE public.product_catalog SET description = 'Hương quế thơm nhẹ không nồng gắt. Không tiêu — cả gia đình gồm bé nhỏ đều ăn được.' WHERE id = 4 AND description IS NULL;
UPDATE public.product_catalog SET description = 'Thịt tươi vị thanh. Thích hợp cho người thích vị thuần túy.' WHERE id = 5 AND description IS NULL;
UPDATE public.product_catalog SET description = 'Đậm đà vị tiêu thơm, thịt tươi dòn, dai mềm tự nhiên. Nấu bún mọc, canh, lẩu, hay chiên đều ngon.' WHERE id = 6 AND description IS NULL;
UPDATE public.product_catalog SET description = 'Thịt tươi, dòn dai mềm tự nhiên, ngon — cả gia đình có trẻ nhỏ đều ăn được.' WHERE id = 7 AND description IS NULL;
UPDATE public.product_catalog SET description = 'Nem lụi thịt heo quấn sả — ướp tỏi tiêu nước mắm và gia vị Huế truyền thống. Nướng lên thơm ngon cực kỳ! Hộp 10 cây + sốt Huế.' WHERE id = 8 AND description IS NULL;
UPDATE public.product_catalog SET description = 'Pate gan heo béo ngậy theo công thức phố cổ Hà Nội. Phết bánh mì sáng sớm, ăn kèm cơm nóng, xôi — ngon tuyệt!' WHERE id = 9 AND description IS NULL;
UPDATE public.product_catalog SET description = 'Chả lụa có tiêu thơm vị tiêu đặc trưng miền bắc, không quế. Dòn dai mềm tự nhiên của thịt.' WHERE id = 10 AND description IS NULL;

-- 3. Create Storage bucket for product images (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 4. Storage RLS policies
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images" ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Admins upload product images" ON storage.objects;
CREATE POLICY "Admins upload product images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Admins update product images" ON storage.objects;
CREATE POLICY "Admins update product images" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Admins delete product images" ON storage.objects;
CREATE POLICY "Admins delete product images" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
);

-- 5. Extend admin_update_product RPC to accept description + code + name
DROP FUNCTION IF EXISTS public.admin_update_product(int, numeric, int, boolean, numeric, text);
DROP FUNCTION IF EXISTS public.admin_update_product(int, numeric, int, boolean, numeric, text, text, text, text);
CREATE OR REPLACE FUNCTION public.admin_update_product(
  p_id int,
  p_stock_quantity numeric DEFAULT NULL,
  p_unit_price int DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_low_stock_threshold numeric DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_check int;
  v_row public.product_catalog;
BEGIN
  SELECT 1 INTO v_admin_check FROM public.admin_users WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  -- If renaming code: check uniqueness
  IF p_code IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.product_catalog WHERE code = p_code AND id <> p_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'code_already_exists');
    END IF;
  END IF;

  UPDATE public.product_catalog
  SET stock_quantity      = COALESCE(p_stock_quantity, stock_quantity),
      unit_price          = COALESCE(p_unit_price, unit_price),
      is_active           = COALESCE(p_is_active, is_active),
      low_stock_threshold = COALESCE(p_low_stock_threshold, low_stock_threshold),
      image_url           = COALESCE(p_image_url, image_url),
      description         = COALESCE(p_description, description),
      code                = COALESCE(p_code, code),
      name                = COALESCE(p_name, name),
      updated_at          = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'product', row_to_json(v_row));
END $$;

GRANT EXECUTE ON FUNCTION public.admin_update_product(int, numeric, int, boolean, numeric, text, text, text, text) TO authenticated;

-- 6. Verification — show updated catalog
SELECT id, code, name, unit_price, stock_quantity, stock_unit, is_active, image_url IS NOT NULL AS has_image, length(description) AS desc_len
FROM public.product_catalog
ORDER BY display_order;
