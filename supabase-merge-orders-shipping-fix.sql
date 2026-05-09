-- ============================================================
-- MERGE ORDERS — RECALC SHIPPING FEE (2026-05-09)
-- ============================================================
-- ROOT: Khách yêu cầu khi merge nếu khối lượng vượt mức ship cũ → khách trả phí
-- ship CHÊNH LỆCH thay vì cố định 0.
--
-- Logic:
--   delta = max(0, newShipFee - parentShipFee)
--   - newShipFee = phí ship cho weight gộp (frontend tính + pass)
--   - parentShipFee = phí ship đơn gốc đã trả
--
-- Đơn con vẫn `is_merged=true`, NHƯNG `shipping_fee = delta` (có thể 0 hoặc dương).
-- Frontend hiển thị giải thích cho khách (chunk 3.2).
--
-- File này DROP signature cũ + CREATE mới với param p_ship_fee_delta.
-- IDEMPOTENT — chạy nhiều lần OK.
-- ============================================================

-- 1. Drop signature cũ (4 params)
DROP FUNCTION IF EXISTS public.add_to_existing_order(text, uuid, jsonb, int);

-- 2. Create signature mới (5 params)
CREATE OR REPLACE FUNCTION public.add_to_existing_order(
  p_parent          text,   -- order_no đơn cha
  p_user_id         uuid,   -- user_id của khách
  p_items           jsonb,  -- cart items mới
  p_total           int,    -- tổng tiền items (KHÔNG gồm ship delta)
  p_ship_fee_delta  int DEFAULT 0  -- phí ship phụ thu (max 0, default 0 = ship miễn)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_parent      public.orders%ROWTYPE;
  v_new_order   text;
  v_allowed_statuses text[] := ARRAY[
    'pending', 'customer_paid', 'pending_manual_review', 'confirmed'
  ];
  v_blocked_statuses text[] := ARRAY['shipped', 'delivered'];
BEGIN

  -- Rule 1: authenticated
  v_caller_id := COALESCE(auth.uid(), p_user_id);
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Validate p_ship_fee_delta >= 0 (server-side enforce, không trust client)
  IF p_ship_fee_delta < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_ship_delta');
  END IF;

  -- Lookup parent
  SELECT * INTO v_parent FROM public.orders WHERE order_no = p_parent;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parent_not_found');
  END IF;

  -- Rule 2: same user
  IF v_parent.user_id IS DISTINCT FROM v_caller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_your_order');
  END IF;

  -- Rule 3: parent KHÔNG được là đơn con
  IF v_parent.is_merged = true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parent_already_merged');
  END IF;

  -- Rule 4: status check
  IF v_parent.status = ANY(v_blocked_statuses) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parent_shipped');
  END IF;
  IF v_parent.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parent_cancelled');
  END IF;
  IF NOT (v_parent.status = ANY(v_allowed_statuses)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parent_shipped');
  END IF;

  -- Rule 5: 48h
  IF v_parent.created_at < (now() - INTERVAL '48 hours') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parent_too_old');
  END IF;

  -- Generate order_no đơn con
  SELECT p_parent || '-M' || (COUNT(*) + 1)::text
    INTO v_new_order
    FROM public.orders
   WHERE parent_order_no = p_parent;

  -- INSERT đơn con
  INSERT INTO public.orders (
    order_no, user_id, customer_name, customer_email, customer_phone,
    recipient_name, recipient_phone,
    ship_prefecture, ship_postal, ship_address, ship_mailbox,
    items, subtotal, shipping_fee, total,
    points_used, points_earned, points_awarded,
    status, note, delivery_time, parent_order_no, is_merged
  )
  VALUES (
    v_new_order, v_caller_id,
    v_parent.customer_name, v_parent.customer_email, v_parent.customer_phone,
    v_parent.recipient_name, v_parent.recipient_phone,
    v_parent.ship_prefecture, v_parent.ship_postal, v_parent.ship_address, v_parent.ship_mailbox,
    p_items,
    p_total,                          -- subtotal = items only
    p_ship_fee_delta,                 -- ship_fee = delta (có thể 0 hoặc dương)
    p_total + p_ship_fee_delta,       -- total = items + ship delta
    0, 0, false,                      -- points reset (đơn con không tích/dùng điểm)
    'pending',
    'Đơn gộp ship với #' || p_parent ||
      CASE WHEN p_ship_fee_delta > 0 THEN ' (phí ship phụ thu ¥' || p_ship_fee_delta || ')' ELSE '' END,
    v_parent.delivery_time,
    p_parent, true
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_no', v_new_order,
    'amount', p_total + p_ship_fee_delta,
    'ship_fee_delta', p_ship_fee_delta
  );
END;
$$;

-- GRANT/REVOKE với signature mới
GRANT  EXECUTE ON FUNCTION public.add_to_existing_order(text, uuid, jsonb, int, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.add_to_existing_order(text, uuid, jsonb, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_to_existing_order(text, uuid, jsonb, int, int) FROM PUBLIC;

-- ============================================================
-- VERIFY
-- ============================================================
WITH checks AS (
  SELECT 1 AS num,
    'Function add_to_existing_order ton tai voi 5 params' AS name,
    CASE WHEN EXISTS(
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='add_to_existing_order'
        AND pg_get_function_arguments(p.oid) LIKE '%p_ship_fee_delta%'
    ) THEN 'PASS' ELSE 'FAIL' END AS status,
    COALESCE((SELECT pg_get_function_arguments(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='add_to_existing_order' LIMIT 1), 'N/A') AS detail

  UNION ALL
  SELECT 2, 'Signature cu (4 params) da bi DROP',
    CASE WHEN (
      SELECT COUNT(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='add_to_existing_order'
    ) = 1 THEN 'PASS' ELSE 'FAIL' END,
    'So overload: ' || (SELECT COUNT(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='add_to_existing_order')::text

  UNION ALL
  SELECT 3, 'authenticated co EXECUTE',
    CASE WHEN EXISTS(
      SELECT 1 FROM information_schema.routine_privileges
      WHERE specific_schema='public'
        AND specific_name LIKE 'add_to_existing_order%'
        AND grantee='authenticated' AND privilege_type='EXECUTE'
    ) THEN 'PASS' ELSE 'FAIL' END, ''

  UNION ALL
  SELECT 4, 'anon KHONG co EXECUTE',
    CASE WHEN NOT EXISTS(
      SELECT 1 FROM information_schema.routine_privileges
      WHERE specific_schema='public'
        AND specific_name LIKE 'add_to_existing_order%'
        AND grantee='anon' AND privilege_type='EXECUTE'
    ) THEN 'PASS' ELSE 'FAIL' END, ''
)
SELECT num, status, name, detail FROM checks ORDER BY num;
