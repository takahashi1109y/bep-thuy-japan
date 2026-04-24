-- ============================================================
-- Bếp Thuỷ Japan — GENDER + BIRTHDAY for birthday discount
-- Run in Supabase SQL Editor (2026-04-24)
-- ============================================================

-- 1. Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male','female','other')),
  ADD COLUMN IF NOT EXISTS birthday date;

-- 2. Update handle_new_user trigger to save gender + birthday from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
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
  );
  RETURN NEW;
END;
$$;

-- 3. RPC: check if today is user's birthday + return discount percentage
CREATE OR REPLACE FUNCTION public.check_birthday_discount()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  v_birthday date;
  v_is_birthday boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('is_birthday', false, 'discount', 0);
  END IF;

  SELECT birthday INTO v_birthday FROM public.profiles WHERE id = v_uid;
  IF v_birthday IS NULL THEN
    RETURN jsonb_build_object('is_birthday', false, 'discount', 0);
  END IF;

  -- Check if today (JST) matches birthday month + day
  v_is_birthday := (
    EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')) = EXTRACT(MONTH FROM v_birthday)
    AND EXTRACT(DAY FROM (now() AT TIME ZONE 'Asia/Tokyo')) = EXTRACT(DAY FROM v_birthday)
  );

  RETURN jsonb_build_object(
    'is_birthday', v_is_birthday,
    'discount', CASE WHEN v_is_birthday THEN 10 ELSE 0 END,
    'birthday', v_birthday
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_birthday_discount() TO authenticated;

-- ============================================================
-- DONE. Verify:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name IN ('gender', 'birthday');
-- ============================================================
