-- ============================================================
-- Bếp Thuỷ Japan — ORDERS TABLE MIGRATION
-- Run in Supabase SQL Editor (2026-04-24)
-- Purpose: Full order history + points-on-ship workflow
-- ============================================================

-- 1. ORDERS TABLE
create table if not exists public.orders (
  id bigserial primary key,
  order_no text unique not null,
  user_id uuid references auth.users on delete set null,

  -- Sender (buyer) info
  customer_name  text,
  customer_email text,
  customer_phone text,

  -- Recipient (if different from buyer)
  recipient_name  text,
  recipient_phone text,

  -- Shipping address
  ship_prefecture text,
  ship_postal     text,
  ship_address    text,
  ship_mailbox    text,

  -- Items (JSONB array: [{name, size, price, qty, wt}])
  items jsonb not null default '[]'::jsonb,

  -- Amounts (integer = JPY)
  subtotal     integer default 0,
  shipping_fee integer default 0,
  total        integer default 0,

  -- Points
  points_used    integer default 0,
  points_earned  integer default 0,
  points_awarded boolean default false,  -- prevents double-award

  -- Status flow: pending -> confirmed -> shipped -> delivered | cancelled
  status text check (status in ('pending','confirmed','shipped','delivered','cancelled')) default 'pending',

  -- Extra
  note          text,
  delivery_time text,

  created_at timestamptz default now(),
  shipped_at timestamptz,
  updated_at timestamptz default now()
);

-- Index for fast user lookup
create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_orders_order_no on public.orders(order_no);
create index if not exists idx_orders_status on public.orders(status);

-- 2. AUTO-UPDATE updated_at trigger
create or replace trigger orders_updated_at
  before update on public.orders
  for each row execute function public.update_updated_at();

-- 3. ROW LEVEL SECURITY
alter table public.orders enable row level security;

-- Users can read ONLY their own orders
drop policy if exists "Users read own orders" on public.orders;
create policy "Users read own orders" on public.orders
  for select using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for clients — only service_role (Apps Script)
-- (RLS default denies these without explicit policy)

-- 4. GRANT VIEW ACCESS
grant select on public.orders to authenticated;
revoke all on public.orders from anon;

-- 5. MARK ORDER SHIPPED (called by Apps Script via RPC or direct UPDATE)
-- This function awards points atomically with status change
create or replace function public.mark_order_shipped(p_order_no text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order public.orders%rowtype;
  v_points int;
begin
  select * into v_order from public.orders where order_no = p_order_no for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order not found');
  end if;

  if v_order.status = 'shipped' or v_order.status = 'delivered' then
    return jsonb_build_object('ok', true, 'already', true, 'points_awarded', v_order.points_awarded);
  end if;

  -- Award points if member and not yet awarded
  if v_order.user_id is not null and not v_order.points_awarded then
    v_points := v_order.points_earned;
    if v_points is null or v_points = 0 then
      v_points := floor(v_order.total / 100);  -- ¥100 = 1 điểm
    end if;

    insert into public.points_transactions(user_id, order_no, order_total, points, type, description)
      values (v_order.user_id, v_order.order_no, v_order.total, v_points, 'earn',
              'Tích điểm đơn #' || v_order.order_no || ' (đã gửi hàng)');

    update public.orders
      set status='shipped', shipped_at=now(), points_awarded=true, points_earned=v_points
      where order_no = p_order_no;

    return jsonb_build_object('ok', true, 'points_awarded', v_points);
  end if;

  -- Non-member order: just mark shipped
  update public.orders set status='shipped', shipped_at=now() where order_no = p_order_no;
  return jsonb_build_object('ok', true, 'points_awarded', 0);
end;
$$;

grant execute on function public.mark_order_shipped(text) to service_role;

-- ============================================================
-- DONE. Verify:
--   SELECT * FROM information_schema.tables WHERE table_name='orders';
-- ============================================================
