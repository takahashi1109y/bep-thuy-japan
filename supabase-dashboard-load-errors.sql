-- ============================================================
-- DASHBOARD LOAD ERRORS — DIAGNOSTIC TABLE (2026-05-09)
-- ============================================================
-- ROOT: Bug B (SDK navigator.locks deadlock) khó reproduce — chỉ xảy ra khi
-- SDK Supabase JS bị lock ngẫu nhiên. Khách báo "màn hình trắng" nhưng
-- không có DevTools để chụp Console → khó debug.
--
-- SOLUTION: Frontend tự log lỗi vào table này khi loadDashboard fail. Anh
-- xem trong admin để biết bao nhiêu khách bị + browser/device gì.
--
-- IDEMPOTENT — chạy nhiều lần OK.
-- ============================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.dashboard_load_errors (
  id              bigserial PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error_type      text NOT NULL,                -- 'sdk_lock' | 'fetch_fail' | 'render_fail' | 'unknown'
  error_message   text,                         -- max 500 chars (frontend trim)
  user_agent      text,                         -- max 200 chars
  page_url        text,                         -- max 200 chars
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for fast query
CREATE INDEX IF NOT EXISTS idx_dle_created_at
  ON public.dashboard_load_errors(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dle_user_id
  ON public.dashboard_load_errors(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dle_error_type
  ON public.dashboard_load_errors(error_type, created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.dashboard_load_errors ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DROP POLICY IF EXISTS "Users can log own dashboard errors" ON public.dashboard_load_errors;
CREATE POLICY "Users can log own dashboard errors"
  ON public.dashboard_load_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Admin reads all (giả định table admin_users đã có)
DROP POLICY IF EXISTS "Admins read dashboard errors" ON public.dashboard_load_errors;
CREATE POLICY "Admins read dashboard errors"
  ON public.dashboard_load_errors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- 5. Cleanup old rows (rentention 30 days) — manual run hoặc cron sau
COMMENT ON TABLE public.dashboard_load_errors IS
  'Diagnostic auto-log khi loadDashboard fail. Cleanup: DELETE FROM dashboard_load_errors WHERE created_at < now() - INTERVAL ''30 days''';

-- ============================================================
-- VERIFY
-- ============================================================
WITH checks AS (
  SELECT 1 AS num,
    'Table dashboard_load_errors ton tai' AS name,
    CASE WHEN EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='dashboard_load_errors'
    ) THEN 'PASS' ELSE 'FAIL' END AS status, '' AS detail

  UNION ALL
  SELECT 2, '3 indexes created',
    CASE WHEN (SELECT COUNT(*) FROM pg_indexes
      WHERE schemaname='public' AND tablename='dashboard_load_errors'
        AND indexname LIKE 'idx_dle_%') = 3
    THEN 'PASS' ELSE 'FAIL' END,
    'So index: ' || (SELECT COUNT(*) FROM pg_indexes
      WHERE schemaname='public' AND tablename='dashboard_load_errors')::text

  UNION ALL
  SELECT 3, 'RLS enabled',
    CASE WHEN (SELECT relrowsecurity FROM pg_class
      WHERE oid='public.dashboard_load_errors'::regclass)
    THEN 'PASS' ELSE 'FAIL' END, ''

  UNION ALL
  SELECT 4, '2 policies created (INSERT for authenticated, SELECT for admin)',
    CASE WHEN (SELECT COUNT(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='dashboard_load_errors') = 2
    THEN 'PASS' ELSE 'FAIL' END,
    'So policies: ' || (SELECT COUNT(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='dashboard_load_errors')::text
)
SELECT num, status, name, detail FROM checks ORDER BY num;
