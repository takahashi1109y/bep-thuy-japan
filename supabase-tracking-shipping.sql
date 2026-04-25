-- ============================================================
-- Migration: Add tracking/carrier info to orders
-- ============================================================
-- Run ONE time in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================

-- 1) Add tracking columns to orders
alter table public.orders
  add column if not exists tracking_number text,
  add column if not exists carrier text,
  add column if not exists shipping_method text;

-- 2) Drop old 1-arg signature so PostgREST routes unambiguously to new version
drop function if exists public.mark_order_shipped(text);

-- 3) Recreate mark_order_shipped with optional tracking params
create or replace function public.mark_order_shipped(
  p_order_no text,
  p_tracking_number text default null,
  p_carrier text default null,
  p_shipping_method text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order public.orders%rowtype;
  v_points int;
  v_role text;
begin
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  if v_role <> 'service_role' then
    if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
      return jsonb_build_object('ok', false, 'error', 'not authorized');
    end if;
  end if;

  select * into v_order from public.orders where order_no = p_order_no for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order not found');
  end if;

  if v_order.status = 'shipped' or v_order.status = 'delivered' then
    return jsonb_build_object('ok', true, 'already', true,
      'points_awarded', v_order.points_awarded,
      'customer_email', v_order.customer_email,
      'customer_name', v_order.customer_name);
  end if;

  if v_order.user_id is not null and not v_order.points_awarded then
    v_points := v_order.points_earned;
    if v_points is null or v_points = 0 then
      v_points := floor(v_order.total / 100);
    end if;

    insert into public.points_transactions(user_id, order_no, order_total, points, type, description)
      values (v_order.user_id, v_order.order_no, v_order.total, v_points, 'earn',
              'Tích điểm đơn #' || v_order.order_no || ' (đã gửi hàng)');

    update public.orders
      set status = 'shipped',
          shipped_at = now(),
          points_awarded = true,
          points_earned = v_points,
          tracking_number = coalesce(p_tracking_number, tracking_number),
          carrier = coalesce(p_carrier, carrier),
          shipping_method = coalesce(p_shipping_method, shipping_method)
      where order_no = p_order_no;

    return jsonb_build_object('ok', true, 'points_awarded', v_points,
      'customer_email', v_order.customer_email,
      'customer_name', v_order.customer_name);
  end if;

  update public.orders
    set status = 'shipped',
        shipped_at = now(),
        tracking_number = coalesce(p_tracking_number, tracking_number),
        carrier = coalesce(p_carrier, carrier),
        shipping_method = coalesce(p_shipping_method, shipping_method)
    where order_no = p_order_no;

  return jsonb_build_object('ok', true, 'points_awarded', 0,
    'customer_email', v_order.customer_email,
    'customer_name', v_order.customer_name);
end;
$$;

grant execute on function public.mark_order_shipped(text, text, text, text) to authenticated;
grant execute on function public.mark_order_shipped(text, text, text, text) to service_role;
