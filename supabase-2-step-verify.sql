-- ============================================================
-- Bếp Thuỷ Japan — 2-STEP VERIFY MIGRATION
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- Purpose: Add admin manual confirmation/rejection layer on top of AI verify.
--          Track every admin decision in admin_audit_log for compliance.
-- Idempotent: safe to re-run.
-- ============================================================

-- ============================================================
-- 1. PAYMENT_CONFIRMATIONS — ADMIN DECISION COLUMNS
-- ============================================================
ALTER TABLE public.payment_confirmations
  ADD COLUMN IF NOT EXISTS admin_confirmed_at timestamptz,           -- When admin made the call
  ADD COLUMN IF NOT EXISTS admin_confirmer    text,                  -- Email of admin (anh Thắng / staff)
  ADD COLUMN IF NOT EXISTS admin_notes        text,                  -- Free-text notes / reason
  ADD COLUMN IF NOT EXISTS admin_action       text;                  -- confirmed | rejected | pending

-- Add CHECK constraint guarded for idempotency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_confirmations_admin_action_check'
      AND conrelid = 'public.payment_confirmations'::regclass
  ) THEN
    ALTER TABLE public.payment_confirmations
      ADD CONSTRAINT payment_confirmations_admin_action_check
      CHECK (admin_action IS NULL OR admin_action IN ('confirmed', 'rejected', 'pending'));
  END IF;
END $$;

-- Index for admin dashboard ("show me what I've decided lately")
CREATE INDEX IF NOT EXISTS idx_payment_conf_admin_action
  ON public.payment_confirmations (admin_action, admin_confirmed_at DESC)
  WHERE admin_action IS NOT NULL;


-- ============================================================
-- 2. ORDERS — CANCEL REASON COLUMN
-- ============================================================
-- admin_reject_payment writes the rejection reason here for audit/email tone.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancel_reason text;


-- ============================================================
-- 3. ADMIN_AUDIT_LOG — IMMUTABLE AUDIT TRAIL
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email  text NOT NULL,
  action_type  text NOT NULL,            -- confirm_payment | reject_payment | force_approve | edit_address | ...
  target_type  text,                     -- order | payment_confirmation | profile | ...
  target_id    text,                     -- order_no, confirmation id, user_id, ...
  details      jsonb DEFAULT '{}'::jsonb,
  created_at   timestamptz DEFAULT now()
);

-- Indexes for common audit queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_email ON public.admin_audit_log (admin_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_type ON public.admin_audit_log (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target      ON public.admin_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at  ON public.admin_audit_log (created_at DESC);

-- ============================================================
-- 4. ADMIN_AUDIT_LOG — ROW LEVEL SECURITY
-- ============================================================
-- Rules:
--   * super_admin can SELECT everything.
--   * regular admin can SELECT only their own rows.
--   * Nobody can UPDATE or DELETE through PostgREST. Inserts only via SECURITY DEFINER RPC.
-- ============================================================
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Lock down direct table writes — only RPCs (SECURITY DEFINER) may insert.
REVOKE ALL ON public.admin_audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log FROM authenticated;
GRANT  SELECT ON public.admin_audit_log TO authenticated;

-- Super admin sees everything.
DROP POLICY IF EXISTS "Super admin reads all audit log" ON public.admin_audit_log;
CREATE POLICY "Super admin reads all audit log" ON public.admin_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Regular admin sees only their own actions (matched on email from JWT claims).
DROP POLICY IF EXISTS "Admin reads own audit log" ON public.admin_audit_log;
CREATE POLICY "Admin reads own audit log" ON public.admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    AND admin_email = coalesce(
      current_setting('request.jwt.claims', true)::jsonb->>'email',
      ''
    )
  );

-- Defensive: explicitly deny UPDATE / DELETE even if grants leak.
DROP POLICY IF EXISTS "No update on audit log" ON public.admin_audit_log;
CREATE POLICY "No update on audit log" ON public.admin_audit_log
  FOR UPDATE USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "No delete on audit log" ON public.admin_audit_log;
CREATE POLICY "No delete on audit log" ON public.admin_audit_log
  FOR DELETE USING (false);


-- ============================================================
-- 5. RPC: admin_confirm_payment
-- ============================================================
-- Step 2 of the 2-step verify flow:
--   1. AI auto-flagged the receipt (ai_match = true | false | null)
--   2. Admin reviews the flag and explicitly confirms the payment.
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_confirm_payment(bigint, text);
DROP FUNCTION IF EXISTS public.admin_confirm_payment(uuid,   text);

CREATE OR REPLACE FUNCTION public.admin_confirm_payment(
  p_confirmation_id bigint,
  p_notes           text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_email text;
  v_role        text;
  v_conf        public.payment_confirmations%ROWTYPE;
  v_order       public.orders%ROWTYPE;
  v_order_changed boolean := false;
BEGIN
  -- 1. Verify caller is admin (or service_role bypass for cron jobs)
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_admin_email := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', '');

  IF v_role <> 'service_role' THEN
    IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
    END IF;
  END IF;

  IF v_admin_email = '' THEN
    v_admin_email := 'service_role';
  END IF;

  -- 2. Lock & fetch payment_confirmations row
  SELECT * INTO v_conf
  FROM public.payment_confirmations
  WHERE id = p_confirmation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'confirmation_not_found');
  END IF;

  -- Optional: prevent double-confirm
  IF v_conf.admin_action = 'confirmed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'confirmation_id', v_conf.id,
      'admin_confirmer', v_conf.admin_confirmer,
      'admin_confirmed_at', v_conf.admin_confirmed_at
    );
  END IF;

  -- 3. Update payment_confirmations
  UPDATE public.payment_confirmations
  SET admin_confirmed_at = now(),
      admin_confirmer    = v_admin_email,
      admin_notes        = p_notes,
      admin_action       = 'confirmed'
  WHERE id = p_confirmation_id;

  -- 4. Bump order status if it's still waiting on review
  IF v_conf.order_no IS NOT NULL THEN
    SELECT * INTO v_order
    FROM public.orders
    WHERE order_no = v_conf.order_no
    FOR UPDATE;

    IF FOUND AND v_order.status IN ('customer_paid', 'pending_manual_review') THEN
      UPDATE public.orders
      SET status = 'confirmed'
      WHERE order_no = v_conf.order_no;
      v_order_changed := true;
    END IF;
  END IF;

  -- 5. Audit log entry
  INSERT INTO public.admin_audit_log(admin_email, action_type, target_type, target_id, details)
  VALUES (
    v_admin_email,
    'confirm_payment',
    'payment_confirmation',
    p_confirmation_id::text,
    jsonb_build_object(
      'order_no',         v_conf.order_no,
      'notes',            p_notes,
      'order_status_changed', v_order_changed,
      'previous_order_status', v_order.status
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'confirmation_id',     v_conf.id,
    'order_no',            v_conf.order_no,
    'admin_confirmer',     v_admin_email,
    'order_status_changed', v_order_changed
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_confirm_payment(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_payment(bigint, text) TO service_role;


-- ============================================================
-- 6. RPC: admin_reject_payment
-- ============================================================
-- Marks the receipt as rejected and cancels the order with a reason.
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_reject_payment(bigint, text);
DROP FUNCTION IF EXISTS public.admin_reject_payment(uuid,   text);

CREATE OR REPLACE FUNCTION public.admin_reject_payment(
  p_confirmation_id bigint,
  p_reason          text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_email text;
  v_role        text;
  v_conf        public.payment_confirmations%ROWTYPE;
  v_order       public.orders%ROWTYPE;
  v_order_changed boolean := false;
BEGIN
  -- 1. Auth check
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_admin_email := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', '');

  IF v_role <> 'service_role' THEN
    IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
    END IF;
  END IF;

  IF v_admin_email = '' THEN
    v_admin_email := 'service_role';
  END IF;

  -- 2. Reason is required for rejection
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  -- 3. Lock & fetch confirmation
  SELECT * INTO v_conf
  FROM public.payment_confirmations
  WHERE id = p_confirmation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'confirmation_not_found');
  END IF;

  IF v_conf.admin_action = 'rejected' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'confirmation_id', v_conf.id,
      'admin_confirmer', v_conf.admin_confirmer
    );
  END IF;

  -- 4. Mark payment as rejected
  UPDATE public.payment_confirmations
  SET admin_confirmed_at = now(),
      admin_confirmer    = v_admin_email,
      admin_notes        = p_reason,
      admin_action       = 'rejected'
  WHERE id = p_confirmation_id;

  -- 5. Cancel order (don't touch shipped/delivered)
  IF v_conf.order_no IS NOT NULL THEN
    SELECT * INTO v_order
    FROM public.orders
    WHERE order_no = v_conf.order_no
    FOR UPDATE;

    IF FOUND AND v_order.status NOT IN ('shipped', 'delivered', 'cancelled') THEN
      UPDATE public.orders
      SET status        = 'cancelled',
          cancel_reason = p_reason,
          note          = coalesce(note, '') || ' [HỦY (reject payment): ' || p_reason || ']'
      WHERE order_no = v_conf.order_no;
      v_order_changed := true;
    END IF;
  END IF;

  -- 6. Audit log
  INSERT INTO public.admin_audit_log(admin_email, action_type, target_type, target_id, details)
  VALUES (
    v_admin_email,
    'reject_payment',
    'payment_confirmation',
    p_confirmation_id::text,
    jsonb_build_object(
      'order_no',              v_conf.order_no,
      'reason',                p_reason,
      'order_status_changed',  v_order_changed,
      'previous_order_status', v_order.status
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'confirmation_id',     v_conf.id,
    'order_no',            v_conf.order_no,
    'admin_confirmer',     v_admin_email,
    'order_status_changed', v_order_changed
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_reject_payment(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment(bigint, text) TO service_role;


-- ============================================================
-- 7. VERIFICATION
-- ============================================================
-- New columns on payment_confirmations:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payment_confirmations'
  AND column_name IN ('admin_confirmed_at', 'admin_confirmer', 'admin_notes', 'admin_action')
ORDER BY ordinal_position;

-- New cancel_reason column on orders:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name = 'cancel_reason';

-- admin_audit_log table shape + row count:
SELECT 'admin_audit_log' AS table_name,
       (SELECT count(*) FROM public.admin_audit_log) AS row_count;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_audit_log'
ORDER BY ordinal_position;

-- Active policies on admin_audit_log:
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'admin_audit_log'
ORDER BY policyname;

-- Deployed RPCs:
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('admin_confirm_payment', 'admin_reject_payment')
ORDER BY proname;

-- ============================================================
-- SAMPLE USAGE (run from supabase-js with admin session, or psql as service_role):
--
-- -- Confirm a payment:
-- SELECT public.admin_confirm_payment(
--   p_confirmation_id := 123,
--   p_notes           := 'PayPay 8500¥ matches order TJ-20260502-001'
-- );
--
-- -- Reject a payment:
-- SELECT public.admin_reject_payment(
--   p_confirmation_id := 124,
--   p_reason          := 'Receipt amount 5000¥ does not match order total 8500¥'
-- );
--
-- -- Read audit trail (admin sees own; super_admin sees all):
-- SELECT created_at, admin_email, action_type, target_id, details
-- FROM public.admin_audit_log
-- ORDER BY created_at DESC
-- LIMIT 20;
-- ============================================================
