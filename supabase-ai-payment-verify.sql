-- AI verification columns for payment_confirmations
-- Stores Google Vision OCR results to flag mismatched/suspicious receipts.

ALTER TABLE public.payment_confirmations
  ADD COLUMN IF NOT EXISTS ai_verified_amount integer,        -- Amount extracted from receipt by AI (¥)
  ADD COLUMN IF NOT EXISTS ai_match boolean,                   -- true=matches order total, false=mismatch, null=can't read
  ADD COLUMN IF NOT EXISTS ai_reason text,                     -- Human-readable reason / notes
  ADD COLUMN IF NOT EXISTS ai_verified_at timestamptz,         -- When AI verification ran
  ADD COLUMN IF NOT EXISTS ai_raw_text text,                   -- Full OCR text (debugging / audit)
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(3,2);         -- 0.00–1.00 confidence score

-- Quick index for admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_payment_conf_ai_match ON public.payment_confirmations (ai_match) WHERE ai_match IS NOT NULL;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payment_confirmations' AND column_name LIKE 'ai_%'
ORDER BY ordinal_position;
