-- ============================================================
-- PHONE LOGIN MIGRATION (2026-05-03)
-- Adds phone normalization + UNIQUE constraint + RPC find_email_by_phone
-- Frontend: thanh-vien.html doLogin() will call sb.rpc('find_email_by_phone')
-- ============================================================

-- STEP 1: Normalize existing phones (strip non-digits)
-- Run này trước Step 2 để duplicate detection chính xác.
UPDATE public.profiles
   SET phone = regexp_replace(phone, '\D', '', 'g')
 WHERE phone IS NOT NULL
   AND phone <> regexp_replace(phone, '\D', '', 'g');

-- ============================================================
-- STEP 2: KIỂM TRA DUPLICATE TRƯỚC KHI ADD UNIQUE
-- Chạy SELECT này, NẾU CÓ ROW: phải xử lý manual TRƯỚC khi tiếp tục
-- ============================================================

SELECT phone,
       count(*) AS dup_count,
       array_agg(id) AS user_ids,
       array_agg(display_name) AS names
  FROM public.profiles
 WHERE phone IS NOT NULL AND phone <> ''
 GROUP BY phone
HAVING count(*) > 1;

-- Nếu trên trả 0 row → tiếp tục Step 3.
-- Nếu có row duplicate:
--   1. Quyết định giữ user nào (vd theo created_at sớm nhất hoặc nhiều orders nhất)
--   2. Set phone = NULL cho user còn lại:
--      UPDATE public.profiles SET phone = NULL WHERE id = '<uuid_user_phai_clear>';
--   3. Sau khi resolve hết, chạy lại Step 2 để confirm 0 row.

-- ============================================================
-- STEP 3: UNIQUE partial index (cho phép nhiều NULL, unique trên non-null)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_unique
  ON public.profiles(phone)
 WHERE phone IS NOT NULL AND phone <> '';

-- ============================================================
-- STEP 4: Trigger normalize phone tự động trên INSERT/UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalize_phone()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '\D', '', 'g');
    IF NEW.phone = '' THEN NEW.phone := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.profiles;
CREATE TRIGGER trg_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone();

-- ============================================================
-- STEP 5: RPC SECURITY DEFINER — phone → email lookup
-- Anon có thể call để login bằng phone, KHÔNG expose toàn bộ profiles
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_email_by_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_normalized text;
  v_email      text;
BEGIN
  v_normalized := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  IF length(v_normalized) < 6 THEN
    RETURN NULL;  -- chống enumeration bằng số quá ngắn
  END IF;

  SELECT u.email INTO v_email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE p.phone = v_normalized
   LIMIT 1;

  RETURN v_email;  -- NULL nếu không tìm thấy
END;
$$;

REVOKE ALL ON FUNCTION public.find_email_by_phone(text) FROM public;
GRANT EXECUTE ON FUNCTION public.find_email_by_phone(text) TO anon, authenticated;

-- ============================================================
-- STEP 6: Test RPC
-- Thay tracking_no thật của anh để verify
-- ============================================================
-- SELECT public.find_email_by_phone('08012345678');
-- Expected: trả về email của user đó, hoặc NULL nếu không có
