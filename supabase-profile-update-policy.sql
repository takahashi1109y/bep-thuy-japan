-- ============================================================
-- PROFILES — RLS UPDATE POLICY (2026-05-07)
-- ============================================================
-- Anh report: autoSaveProfileFromCheckout (commit 7ed27ad) gọi
-- sbClient.from('profiles').update(...) → toast hiển thị success
-- NHƯNG profile thực tế KHÔNG save → đơn sau form vẫn trống.
--
-- ROOT CAUSE: profiles table có RLS enabled nhưng KHÔNG có UPDATE
-- policy cho authenticated user → Supabase silently reject UPDATE.
-- Frontend bắt error nhẹ (console.warn) → toast vẫn green nhầm lẫn.
--
-- FIX: Add policy cho user UPDATE chính họ (auth.uid() = id).
-- ============================================================

-- Drop nếu đã tồn tại (idempotent)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- VERIFY
-- ============================================================
SELECT policyname, cmd, qual::text AS using_clause, with_check::text AS check_clause
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'profiles'
 ORDER BY policyname;

-- Mong đợi xuất hiện row mới:
-- "Users can update own profile" | UPDATE | (auth.uid() = id) | (auth.uid() = id)
