-- ============================================================
-- Bếp Thuỷ Japan — CUSTOMER SELF-SERVICE FEATURES
-- 1. Customer self-cancel pending orders
-- 2. Messaging system (customer ↔ shop)
-- Run in Supabase SQL Editor (2026-04-24)
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  PART 1: CUSTOMER SELF-CANCEL                            ║
-- ╚══════════════════════════════════════════════════════════╝

-- Update cancel_order RPC to allow CUSTOMERS to cancel their OWN pending orders
create or replace function public.cancel_order(p_order_no text, p_reason text default '')
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order public.orders%rowtype;
  v_role text;
  v_uid uuid;
  v_is_admin boolean;
begin
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_uid := auth.uid();

  -- Check permissions
  v_is_admin := (v_role = 'service_role') or
                exists (select 1 from public.admin_users where user_id = v_uid);

  select * into v_order from public.orders where order_no = p_order_no for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order not found');
  end if;

  -- Customer can only cancel their OWN order, AND only if pending/customer_paid
  -- AND within 30 minutes from order creation
  if not v_is_admin then
    if v_uid is null or v_order.user_id is null or v_order.user_id <> v_uid then
      return jsonb_build_object('ok', false, 'error', 'not authorized');
    end if;
    if v_order.status not in ('pending', 'customer_paid') then
      return jsonb_build_object('ok', false, 'error', 'Chỉ có thể hủy đơn chưa được xác nhận');
    end if;
    if v_order.created_at + interval '30 minutes' < now() then
      return jsonb_build_object('ok', false, 'error', 'Đã quá 30 phút từ lúc đặt hàng. Vui lòng liên hệ shop để hủy đơn.');
    end if;
  end if;

  -- Admin can also block cancellation of shipped orders
  if v_order.status in ('shipped', 'delivered') then
    return jsonb_build_object('ok', false, 'error', 'cannot cancel shipped order');
  end if;

  -- Refund points if used
  if v_order.user_id is not null and v_order.points_used > 0 then
    insert into public.points_transactions(user_id, order_no, order_total, points, type, description)
      values (v_order.user_id, v_order.order_no, 0, v_order.points_used, 'earn',
              'Hoàn điểm đã dùng cho đơn #' || v_order.order_no || ' (hủy)');
  end if;

  update public.orders
    set status='cancelled',
        note = coalesce(note, '') || ' [HỦY ' || (case when v_is_admin then 'BỞI SHOP' else 'BỞI KHÁCH' end) || ': ' || coalesce(p_reason, '') || ']'
    where order_no = p_order_no;

  return jsonb_build_object('ok', true, 'points_refunded', coalesce(v_order.points_used, 0));
end;
$$;

grant execute on function public.cancel_order(text, text) to authenticated;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  PART 2: MESSAGING SYSTEM                                ║
-- ╚══════════════════════════════════════════════════════════╝

-- Threads (1 thread = 1 conversation)
create table if not exists public.message_threads (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade not null,
  subject text not null default '',
  last_message_at timestamptz default now(),
  unread_by_user boolean default false,    -- shop replied, user hasn't read
  unread_by_shop boolean default true,     -- user sent, shop hasn't read
  status text check (status in ('open','closed')) default 'open',
  created_at timestamptz default now()
);

create index if not exists idx_threads_user on public.message_threads(user_id);
create index if not exists idx_threads_last on public.message_threads(last_message_at desc);

-- Individual messages within a thread
create table if not exists public.messages (
  id bigserial primary key,
  thread_id bigint references public.message_threads on delete cascade not null,
  sender text check (sender in ('customer','shop')) not null,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists idx_msgs_thread on public.messages(thread_id, created_at);

-- Trigger: update last_message_at + unread flags
create or replace function public.handle_new_message()
returns trigger
language plpgsql
as $$
begin
  update public.message_threads
    set last_message_at = new.created_at,
        unread_by_user = (new.sender = 'shop'),
        unread_by_shop = (new.sender = 'customer')
    where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists messages_update_thread on public.messages;
create trigger messages_update_thread
  after insert on public.messages
  for each row execute function public.handle_new_message();

-- ─── RLS ───
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

-- Customer: read own threads, create new threads
drop policy if exists "User reads own threads" on public.message_threads;
create policy "User reads own threads" on public.message_threads
  for select using (auth.uid() = user_id);

drop policy if exists "User inserts own threads" on public.message_threads;
create policy "User inserts own threads" on public.message_threads
  for insert with check (auth.uid() = user_id);

drop policy if exists "User updates own threads (mark read)" on public.message_threads;
create policy "User updates own threads (mark read)" on public.message_threads
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin reads all threads
drop policy if exists "Admin reads all threads" on public.message_threads;
create policy "Admin reads all threads" on public.message_threads
  for select using (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "Admin updates threads" on public.message_threads;
create policy "Admin updates threads" on public.message_threads
  for update using (exists (select 1 from public.admin_users where user_id = auth.uid()));

-- Customer: read messages in own threads, insert messages in own threads
drop policy if exists "User reads own messages" on public.messages;
create policy "User reads own messages" on public.messages
  for select using (
    exists (select 1 from public.message_threads t
            where t.id = thread_id and t.user_id = auth.uid())
  );

drop policy if exists "User inserts own messages" on public.messages;
create policy "User inserts own messages" on public.messages
  for insert with check (
    sender = 'customer' and
    exists (select 1 from public.message_threads t
            where t.id = thread_id and t.user_id = auth.uid())
  );

-- Admin reads + inserts all messages
drop policy if exists "Admin reads all messages" on public.messages;
create policy "Admin reads all messages" on public.messages
  for select using (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "Admin inserts shop reply" on public.messages;
create policy "Admin inserts shop reply" on public.messages
  for insert with check (
    sender = 'shop' and
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

-- Grants
grant select, insert, update on public.message_threads to authenticated;
grant select, insert on public.messages to authenticated;
grant usage, select on sequence public.message_threads_id_seq to authenticated;
grant usage, select on sequence public.messages_id_seq to authenticated;

-- ============================================================
-- DONE
-- ============================================================
