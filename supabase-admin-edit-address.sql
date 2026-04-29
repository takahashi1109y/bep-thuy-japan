-- ============================================================
-- Migration: Admin RPC to edit shipping address of an order
-- ============================================================
-- Allows shop admin to fix typos / change recipient address after order creation.
-- Run ONE time in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_update_order_address(text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_update_order_address(
  p_order_no text,
  p_ship_postal text,
  p_ship_prefecture text,
  p_ship_address text,
  p_ship_mailbox text,
  p_recipient_name text,
  p_recipient_phone text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_check int;
  v_row public.orders;
BEGIN
  -- Verify caller is admin
  SELECT 1 INTO v_admin_check FROM public.admin_users WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  -- Update all 6 address-related fields. Frontend always sends complete state.
  -- Empty strings overwrite to empty (allows admin to clear optional fields).
  UPDATE public.orders
  SET ship_postal     = COALESCE(NULLIF(p_ship_postal, ''),     ship_postal),
      ship_prefecture = COALESCE(NULLIF(p_ship_prefecture, ''), ship_prefecture),
      ship_address    = COALESCE(NULLIF(p_ship_address, ''),    ship_address),
      ship_mailbox    = NULLIF(p_ship_mailbox, ''),
      recipient_name  = NULLIF(p_recipient_name, ''),
      recipient_phone = NULLIF(p_recipient_phone, '')
  WHERE order_no = p_order_no
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_no', v_row.order_no,
    'ship_postal', v_row.ship_postal,
    'ship_prefecture', v_row.ship_prefecture,
    'ship_address', v_row.ship_address,
    'ship_mailbox', v_row.ship_mailbox,
    'recipient_name', v_row.recipient_name,
    'recipient_phone', v_row.recipient_phone
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_update_order_address(text, text, text, text, text, text, text) TO authenticated;

-- Verification: show recent orders with their address fields
SELECT order_no, customer_name, ship_postal, ship_prefecture, ship_address, recipient_name
FROM public.orders
ORDER BY created_at DESC
LIMIT 5;
