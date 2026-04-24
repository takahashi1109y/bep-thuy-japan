-- ============================================================
-- Lock birthday: cho phep set lan dau, ko cho doi sau do
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_birthday_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Cho phep set lan dau (OLD.birthday IS NULL)
  -- Chan doi sau khi da co gia tri
  IF OLD.birthday IS NOT NULL AND NEW.birthday IS DISTINCT FROM OLD.birthday THEN
    RAISE EXCEPTION 'Birthday cannot be changed after it is set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_birthday ON public.profiles;
CREATE TRIGGER lock_birthday
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_birthday_change();
