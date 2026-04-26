-- ============================================================
-- Migration: Auto-link guest orders to user account by email
-- ============================================================
-- Run ONE time in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================
-- Bug: Khách đặt hàng dạng guest (no account) → đơn lưu với
-- user_id=NULL. Sau đó khách đăng ký bằng cùng email → đơn cũ
-- vẫn user_id=NULL → RLS chặn → khách không thấy lịch sử đơn.
--
-- Fix: Update trigger handle_new_user để khi tạo user mới, tự
-- link tất cả đơn cũ có customer_email khớp.
-- + Backfill 1 lần cho các đơn bị mồ côi từ trước đến nay.
-- ============================================================

-- 1) Update handle_new_user trigger: link orders by email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Tạo profile (như cũ)
  INSERT INTO public.profiles (id, display_name, phone, prefecture, postal, address, gender, birthday)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.raw_user_meta_data->>'prefecture',
    NEW.raw_user_meta_data->>'postal',
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'gender',
    (NEW.raw_user_meta_data->>'birthday')::date
  )
  ON CONFLICT (id) DO NOTHING;

  -- Link đơn guest cũ qua email (case-insensitive)
  IF NEW.email IS NOT NULL THEN
    UPDATE public.orders
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND lower(customer_email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Đảm bảo trigger trên auth.users vẫn bind đúng (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) BACKFILL — link các đơn mồ côi hiện tại với user đã đăng ký
-- (chạy 1 lần, không hại nếu chạy lại)
UPDATE public.orders o
   SET user_id = u.id
  FROM auth.users u
 WHERE o.user_id IS NULL
   AND o.customer_email IS NOT NULL
   AND lower(o.customer_email) = lower(u.email);

-- 4) Báo cáo: bao nhiêu đơn được link sau backfill
SELECT
  count(*) FILTER (WHERE user_id IS NULL)     AS guest_orders_remaining,
  count(*) FILTER (WHERE user_id IS NOT NULL) AS linked_orders,
  count(*)                                    AS total_orders
FROM public.orders;
