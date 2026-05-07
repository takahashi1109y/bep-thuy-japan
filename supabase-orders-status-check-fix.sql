-- ============================================================
-- ORDERS STATUS CHECK CONSTRAINT FIX (2026-05-07)
-- ============================================================
-- ROOT CAUSE: Schema orders table có CHECK constraint:
--   status IN ('pending','confirmed','shipped','delivered','cancelled')
--
-- NHƯNG Apps Script set data.status = 'pending_manual_review' (manual flow)
-- hoặc 'customer_paid' (auto-verify flow) → CHECK reject → INSERT fail SILENT.
--
-- → Email báo gửi được (Apps Script chạy), Yamato sheet save được,
-- NHƯNG đơn KHÔNG vào Supabase orders table → admin dashboard rỗng.
--
-- FIX: DROP CHECK cũ → ADD CHECK mới với đầy đủ 7 statuses.
-- ============================================================

-- 1. Drop CHECK constraint cũ (nếu có tên cụ thể)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
    FROM pg_constraint
   WHERE conrelid = 'public.orders'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || quote_ident(con_name);
    RAISE NOTICE 'Dropped constraint: %', con_name;
  END IF;
END $$;

-- 2. Add new CHECK với đầy đủ status enum
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',                -- chưa thanh toán
    'customer_paid',          -- khách đã thanh toán + AI verify pass (Option B)
    'pending_manual_review',  -- AI fail, khách click "Gửi bill cho Thuỷ"
    'confirmed',              -- admin xác nhận, sẵn sàng sản xuất
    'shipped',                -- đã gửi đi
    'delivered',              -- đã giao
    'cancelled'               -- huỷ đơn
  ));

-- 3. Verify
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.orders'::regclass
   AND contype = 'c'
 ORDER BY conname;

-- ============================================================
-- AFTER RUNNING: Apps Script doPost → manual_pending_order →
-- saveOrderToSupabase với status='pending_manual_review' → SUCCESS
-- → đơn xuất hiện trong /thuythang tab "🚨 Cần xem xét"
-- ============================================================
