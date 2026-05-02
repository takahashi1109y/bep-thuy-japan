-- Manual approve override columns for payment_confirmations
-- Lets admin (anh Thắng) manually approve a payment that AI verify rejected (false negative).
-- Audit trail: who approved, when, why.

ALTER TABLE public.payment_confirmations
  ADD COLUMN IF NOT EXISTS manual_approver text,             -- Admin email who approved manually
  ADD COLUMN IF NOT EXISTS manual_approve_reason text,       -- Why admin overrode AI rejection
  ADD COLUMN IF NOT EXISTS manual_approved_at timestamptz;   -- When manual approve happened

-- Existing ai_status text column (already used as 'matched' in google-apps-script.js)
-- gets new value 'manual_approved' when admin overrides AI rejection.
-- No type change needed; ai_status is plain text.

-- Quick index for audit / dashboard
CREATE INDEX IF NOT EXISTS idx_payment_conf_manual_approve
  ON public.payment_confirmations (manual_approved_at)
  WHERE manual_approved_at IS NOT NULL;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payment_confirmations'
  AND column_name LIKE 'manual_%'
ORDER BY ordinal_position;
