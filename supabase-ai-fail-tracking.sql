-- ============================================================
-- AI VERIFY FAIL TRACKING (2026-05-07)
-- ============================================================
-- Lưu lại mọi lần AI verify fail để admin xem trong tab
-- "📋 Check thủ công". Trước đó: AI fail + customer không click
-- "Gửi đơn cho admin" -> đơn MẤT HOÀN TOÀN, không log gì.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_verify_attempts (
  id                       bigserial PRIMARY KEY,
  created_at               timestamptz NOT NULL DEFAULT now(),
  -- Customer info (snapshot at upload time)
  customer_name            text,
  customer_email           text,
  customer_phone           text,
  customer_address         text,
  user_id                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Cart snapshot
  claimed_amount           integer NOT NULL,
  cart_items               jsonb,
  -- AI fail details
  ai_fail_reason           text,
  ai_detected_amount       integer,
  ai_raw_text              text,
  ai_checks                jsonb,
  -- Receipt upload
  receipt_url              text,
  receipt_path             text,
  receipt_mime             text,
  -- Workflow status
  status                   text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'customer_resubmitted', 'admin_resolved', 'ignored', 'expired')),
  resolved_order_no        text,
  resolved_by              text,
  resolved_at              timestamptz,
  admin_notes              text
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_attempts_created_status
  ON public.ai_verify_attempts (created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_ai_attempts_status_pending
  ON public.ai_verify_attempts (created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ai_attempts_customer_email
  ON public.ai_verify_attempts (customer_email)
  WHERE customer_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_attempts_customer_phone
  ON public.ai_verify_attempts (customer_phone)
  WHERE customer_phone IS NOT NULL;

-- Enable RLS
ALTER TABLE public.ai_verify_attempts ENABLE ROW LEVEL SECURITY;

-- Policy: only admin can read
DROP POLICY IF EXISTS "Admin reads ai_verify_attempts" ON public.ai_verify_attempts;
CREATE POLICY "Admin reads ai_verify_attempts"
  ON public.ai_verify_attempts
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
     WHERE admin_users.user_id = auth.uid()
  ));

-- Policy: only admin can update (for marking as resolved/ignored)
DROP POLICY IF EXISTS "Admin updates ai_verify_attempts" ON public.ai_verify_attempts;
CREATE POLICY "Admin updates ai_verify_attempts"
  ON public.ai_verify_attempts
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
     WHERE admin_users.user_id = auth.uid()
  ));

-- Service role bypasses RLS by default for INSERT (Apps Script logs failures)
-- No explicit INSERT policy needed for service_role.

GRANT SELECT, UPDATE ON public.ai_verify_attempts TO authenticated;
GRANT ALL ON public.ai_verify_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_verify_attempts_id_seq TO authenticated, service_role;

-- ============================================================
-- RPC: admin_resolve_ai_attempt
-- Khi admin click "Tạo đơn thủ công" hoặc "Bỏ qua"
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_resolve_ai_attempt(bigint, text, text, text);
CREATE OR REPLACE FUNCTION public.admin_resolve_ai_attempt(
  p_attempt_id  bigint,
  p_action      text,    -- 'admin_resolved' or 'ignored'
  p_order_no    text DEFAULT NULL,
  p_notes       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_email text;
BEGIN
  -- Admin check
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  v_admin_email := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', 'admin');

  IF p_action NOT IN ('admin_resolved', 'ignored') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  UPDATE public.ai_verify_attempts
     SET status            = p_action,
         resolved_order_no = p_order_no,
         resolved_by       = v_admin_email,
         resolved_at       = now(),
         admin_notes       = p_notes
   WHERE id = p_attempt_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attempt_not_found_or_already_resolved');
  END IF;

  RETURN jsonb_build_object('ok', true, 'attempt_id', p_attempt_id, 'status', p_action);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_ai_attempt(bigint, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_resolve_ai_attempt(bigint, text, text, text) TO authenticated, service_role;

-- ============================================================
-- VERIFY: Đếm rows
-- ============================================================
-- SELECT COUNT(*) AS total_attempts, status FROM public.ai_verify_attempts GROUP BY status;
