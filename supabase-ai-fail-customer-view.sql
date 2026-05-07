-- ============================================================
-- AI VERIFY FAIL TRACKING — CUSTOMER READ ACCESS (2026-05-07)
-- ============================================================
-- Purpose: Cho phép authenticated customers đọc CHÍNH ai_verify_attempts
-- của mình (user_id = auth.uid()) để hiển thị trong /thanh-vien dashboard
-- với badge "⏳ Đang chờ Thuỷ xác nhận".
--
-- Khách KHÔNG biết đã upload bill thành công hay chưa nếu không thấy đơn
-- pending → cần feedback rõ ràng.
-- ============================================================

-- Index on user_id để query nhanh từ customer dashboard
CREATE INDEX IF NOT EXISTS idx_ai_attempts_user_id
  ON public.ai_verify_attempts (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ============================================================
-- NEW POLICY: Customer reads own attempts
-- ============================================================
DROP POLICY IF EXISTS "Users read own ai_verify_attempts" ON public.ai_verify_attempts;
CREATE POLICY "Users read own ai_verify_attempts"
  ON public.ai_verify_attempts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Note: existing "Admin reads ai_verify_attempts" policy van con + admin_users check
-- Hai policies = OR: customer thay row của mình HOẶC admin thay all rows.

-- ============================================================
-- VERIFY
-- ============================================================
SELECT policyname, cmd, qual::text AS using_clause
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'ai_verify_attempts'
 ORDER BY policyname;

-- Expected output:
-- "Admin reads ai_verify_attempts"   | SELECT | EXISTS (admin check)
-- "Admin updates ai_verify_attempts" | UPDATE | EXISTS (admin check)
-- "Users read own ai_verify_attempts"| SELECT | (auth.uid() = user_id)
