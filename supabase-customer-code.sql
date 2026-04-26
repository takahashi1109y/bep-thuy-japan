-- ============================================================
-- Migration: Add customer_code R-XXXX cho khách đã đăng ký
-- ============================================================
-- Run ONE time in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================
-- - Khách đăng ký: tự động sinh mã R-0001, R-0002, ... theo thứ tự
--   thời gian tạo profile.
-- - Khách không đăng ký (guest): hiển thị Guest-XXXX (compute trong JS).
-- ============================================================

-- 1) Thêm cột customer_code vào profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS customer_code text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_customer_code
  ON public.profiles(customer_code);

-- 2) Backfill mã cho profiles đã có (chưa có code)
-- Pad 6 chữ số → R-000001 ... R-999999 (đủ cho 1 triệu khách hàng,
-- lex sort luôn đúng, không bao giờ phải migrate lại)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at NULLS LAST, id) AS rn
    FROM public.profiles
   WHERE customer_code IS NULL
)
UPDATE public.profiles p
   SET customer_code = 'R-' || LPAD(r.rn::text, 6, '0')
  FROM ranked r
 WHERE p.id = r.id;

-- 3) Function: sinh mã tiếp theo cho user mới (padding 6 chữ số)
CREATE OR REPLACE FUNCTION public.generate_customer_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_num int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(customer_code FROM 3)::int), 0) + 1
    INTO next_num
    FROM public.profiles
   WHERE customer_code ~ '^R-\d+$';
  -- LPAD chỉ pad, không truncate → nếu vượt 999999 vẫn auto-grow
  -- (chỉ khi đó lex sort mới bắt đầu lệch — thực tế shop ko bao giờ tới)
  RETURN 'R-' || LPAD(next_num::text, 6, '0');
END;
$$;

-- 4) Update handle_new_user trigger để tự gen customer_code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, customer_code, display_name, phone, prefecture, postal, address, gender, birthday)
  VALUES (
    NEW.id,
    public.generate_customer_code(),
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.raw_user_meta_data->>'prefecture',
    NEW.raw_user_meta_data->>'postal',
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'gender',
    (NEW.raw_user_meta_data->>'birthday')::date
  )
  ON CONFLICT (id) DO NOTHING;

  -- Link đơn guest cũ qua email (giữ logic từ migration trước)
  IF NEW.email IS NOT NULL THEN
    UPDATE public.orders
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND lower(customer_email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5) Verify backfill
SELECT count(*) AS profiles_with_code,
       min(customer_code) AS first_code,
       max(customer_code) AS last_code
  FROM public.profiles
 WHERE customer_code IS NOT NULL;
