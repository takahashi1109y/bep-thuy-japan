-- ============================================================
-- AI VERIFY ATTEMPTS — CLEANUP DATA POLLUTION (2026-05-07)
-- ============================================================
-- Anh đã click "Tạo đơn thủ công" 3 lần KHI HANDLER MỚI CHƯA DEPLOY.
-- 3 rows (id 5, 6, 7) hiện status='admin_resolved' nhưng:
--   - id 7: resolved_order_no='Ok' (anh nhập tay sai)
--   - id 6: resolved_order_no=NULL
--   - id 5: resolved_order_no='T01' (không tồn tại trong orders table)
-- → 3 đơn này CHƯA được tạo thật trong orders table.
-- → Cần revert về 'pending' để xử lý lại với handler mới (sau redeploy Apps Script).
-- ============================================================

-- STEP 1: Audit — show all admin_resolved rows + integrity check
SELECT
  a.id,
  a.status,
  a.resolved_order_no,
  a.resolved_by,
  a.resolved_at,
  CASE
    WHEN a.resolved_order_no IS NULL THEN '❌ NULL — invalid'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.order_no = a.resolved_order_no
    ) THEN '❌ NOT IN ORDERS — pollution'
    ELSE '✓ Valid order_no'
  END AS integrity_check,
  a.admin_notes
FROM public.ai_verify_attempts a
WHERE a.status = 'admin_resolved'
ORDER BY a.created_at DESC;

-- ============================================================
-- STEP 2: Revert pollution rows về pending để xử lý lại
-- ============================================================
UPDATE public.ai_verify_attempts
   SET status            = 'pending',
       resolved_order_no = NULL,
       resolved_by       = NULL,
       resolved_at       = NULL,
       admin_notes       = COALESCE(admin_notes, '') || ' | Reverted 2026-05-07 — old flow polluted, re-process with new handler'
 WHERE status = 'admin_resolved'
   AND (
     resolved_order_no IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.orders o
       WHERE o.order_no = ai_verify_attempts.resolved_order_no
     )
   );

-- ============================================================
-- STEP 3: Verify final state — tất cả 5 rows TEST98 phải pending
-- ============================================================
SELECT id, status, resolved_order_no, customer_email, claimed_amount, created_at
  FROM public.ai_verify_attempts
 ORDER BY id;

-- Expected: tất cả rows ở 'pending' (sẵn sàng để click "Tạo đơn thủ công" với handler mới)
