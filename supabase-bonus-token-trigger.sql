-- ============================================================
-- ⚠️ DEPRECATED 2026-05-09: File nay da duoc SUPERSEDED boi
-- supabase-anti-fraud-canonical-email.sql (co them canonical_email).
-- KHONG chay lai file nay — se overwrite handle_new_user moi
-- va mat anti-fraud canonical email dedup.
-- ============================================================
-- Việc 2/5: Update trigger handle_new_user (KHÔNG gen bonus_token ở app layer)
-- Lý do refactor: token per-user identify đúng user khi claim 100đ.
-- Chạy SAU supabase-bonus-token-migration.sql (Việc 1).
-- ============================================================
-- ANH YÊU CẦU 2026-05-08: KHÔNG generate bonus_token ở app layer.
-- DEFAULT clause trên column (set ở migration Việc 1) đã tự gen khi
-- INSERT row mà KHÔNG cung cấp giá trị. Single source of truth ở DB
-- → tránh duplicate logic trigger/frontend/RPC.
-- ============================================================
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================

-- 1) Update handle_new_user — preserve ALL columns từ phiên bản latest
--    (customer_code, link guest orders by email).
--    KHÔNG include bonus_token trong INSERT → DEFAULT clause của column tự gen.
--    bonus_claimed cũng KHÔNG include → DEFAULT false tự apply.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    customer_code,
    display_name,
    phone,
    prefecture,
    postal,
    address,
    gender,
    birthday
    -- bonus_token: OMITTED — DEFAULT encode(gen_random_bytes(16), 'hex') tự fire
    -- bonus_claimed: OMITTED — DEFAULT false tự apply
  )
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

  -- Link đơn guest cũ qua email (giữ logic từ supabase-link-guest-orders.sql)
  IF NEW.email IS NOT NULL THEN
    UPDATE public.orders
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND lower(customer_email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Rebind trigger (idempotent — DROP + CREATE)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) VERIFY — Trigger function source KHÔNG NÊN chứa 'bonus_token'
--    (DEFAULT của column lo chuyện gen, trigger không đụng đến cột này)
SELECT
  routine_name,
  CASE WHEN routine_definition ILIKE '%bonus_token%'
       THEN 'WARN — trigger còn reference bonus_token (kiểm tra lại)'
       ELSE 'OK — trigger không gen bonus_token (DEFAULT của column lo)'
  END AS bonus_token_check
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'handle_new_user';

-- 4) VERIFY — 5 profile mới nhất: bonus_token phải NOT NULL + bonus_claimed default false
--    Chạy với role postgres trong SQL Editor → bypass column-level REVOKE → đọc được token.
SELECT
  customer_code,
  display_name,
  bonus_token IS NOT NULL  AS has_bonus_token,
  bonus_claimed,
  created_at
FROM public.profiles
ORDER BY created_at DESC NULLS LAST
LIMIT 5;
