-- ============================================================
-- Bếp Thuỷ Japan — ADMIN DASHBOARD MIGRATION
-- Run in Supabase SQL Editor (Đợt 1: 2026-04-24)
-- Purpose: Enable admin-only access to all orders, customers, analytics
-- ============================================================

-- 1. ADMIN_USERS TABLE
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users on delete cascade,
  role text default 'admin' check (role in ('admin', 'super_admin')),
  display_name text,
  created_at timestamptz default now()
);

alter table public.admin_users enable row level security;

-- Admin can see own record (used for client-side role check)
drop policy if exists "Admins read own record" on public.admin_users;
create policy "Admins read own record" on public.admin_users
  for select using (auth.uid() = user_id);

revoke all on public.admin_users from anon;
grant select on public.admin_users to authenticated;

-- 2. ADMIN POLICIES ON ORDERS (admin reads all orders)
drop policy if exists "Admin reads all orders" on public.orders;
create policy "Admin reads all orders" on public.orders
  for select using (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

-- 3. ADMIN POLICIES ON PROFILES (admin reads all customer profiles)
drop policy if exists "Admin reads all profiles" on public.profiles;
create policy "Admin reads all profiles" on public.profiles
  for select using (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

-- 4. ADMIN POLICIES ON POINTS_TRANSACTIONS
drop policy if exists "Admin reads all points" on public.points_transactions;
create policy "Admin reads all points" on public.points_transactions
  for select using (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

-- 5. ADMIN POLICIES ON COUPONS
drop policy if exists "Admin reads all coupons" on public.coupons;
create policy "Admin reads all coupons" on public.coupons
  for select using (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

-- 6. RPC: confirm_order_payment (admin only)
create or replace function public.confirm_order_payment(p_order_no text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order public.orders%rowtype;
  v_role text;
begin
  -- Allow service_role OR admin
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

  if v_order.status not in ('pending', 'customer_paid') then
    return jsonb_build_object('ok', false, 'error', 'invalid status: ' || v_order.status);
  end if;

  update public.orders set status = 'confirmed' where order_no = p_order_no;

  return jsonb_build_object(
    'ok', true,
    'order_no', v_order.order_no,
    'customer_email', v_order.customer_email,
    'customer_name', v_order.customer_name,
    'total', v_order.total
  );
end;
$$;

grant execute on function public.confirm_order_payment(text) to authenticated;

-- 7. UPDATE mark_order_shipped to accept admin calls too
create or replace function public.mark_order_shipped(p_order_no text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order public.orders%rowtype;
  v_points int;
  v_role text;
begin
  -- Allow service_role OR admin
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
      set status='shipped', shipped_at=now(), points_awarded=true, points_earned=v_points
      where order_no = p_order_no;

    return jsonb_build_object('ok', true, 'points_awarded', v_points,
      'customer_email', v_order.customer_email,
      'customer_name', v_order.customer_name);
  end if;

  update public.orders set status='shipped', shipped_at=now() where order_no = p_order_no;
  return jsonb_build_object('ok', true, 'points_awarded', 0,
    'customer_email', v_order.customer_email,
    'customer_name', v_order.customer_name);
end;
$$;

grant execute on function public.mark_order_shipped(text) to authenticated;
grant execute on function public.mark_order_shipped(text) to service_role;

-- 8. RPC: cancel_order (admin only)
create or replace function public.cancel_order(p_order_no text, p_reason text default '')
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order public.orders%rowtype;
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

  if v_order.status in ('shipped', 'delivered') then
    return jsonb_build_object('ok', false, 'error', 'cannot cancel shipped order');
  end if;

  -- Refund points if they were deducted
  if v_order.user_id is not null and v_order.points_used > 0 then
    insert into public.points_transactions(user_id, order_no, order_total, points, type, description)
      values (v_order.user_id, v_order.order_no, 0, v_order.points_used, 'earn',
              'Hoàn điểm đã dùng cho đơn #' || v_order.order_no || ' (hủy)');
  end if;

  update public.orders
    set status='cancelled', note = coalesce(note, '') || ' [HỦY: ' || coalesce(p_reason, '') || ']'
    where order_no = p_order_no;

  return jsonb_build_object('ok', true, 'points_refunded', coalesce(v_order.points_used, 0));
end;
$$;

grant execute on function public.cancel_order(text, text) to authenticated;

-- 9. ADMIN STATS VIEW (for dashboard KPIs)
create or replace view public.admin_stats_today
with (security_invoker = on) as
select
  count(*) filter (where created_at::date = current_date) as orders_today,
  count(*) filter (where status = 'pending') as pending_count,
  count(*) filter (where status = 'customer_paid') as customer_paid_count,
  count(*) filter (where status = 'confirmed') as confirmed_count,
  count(*) filter (where status = 'shipped' and shipped_at::date = current_date) as shipped_today,
  coalesce(sum(total) filter (where created_at::date = current_date and status <> 'cancelled'), 0) as revenue_today,
  coalesce(sum(total) filter (where created_at >= date_trunc('month', current_date) and status <> 'cancelled'), 0) as revenue_month
from public.orders;

grant select on public.admin_stats_today to authenticated;

-- ============================================================
-- BƯỚC CUỐI — THÊM BẢN THÂN ANH THÀNH ADMIN
-- Chạy sau khi tạo tài khoản thành viên thuyjapan.com/thanh-vien
-- Thay '<YOUR_USER_ID>' bằng UUID của anh
-- Cách tìm UUID: SELECT id, email FROM auth.users;
-- ============================================================
-- Ví dụ:
-- insert into public.admin_users (user_id, display_name) values
-- ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'Thuỷ')
-- on conflict (user_id) do nothing;
