-- ============================================================
-- Bếp Thuỷ Japan — PAYMENT PROOF UPLOAD SYSTEM
-- Run in Supabase SQL Editor (2026-04-24)
-- ============================================================
-- Cho phep khach upload anh thanh toan (chuyen khoan / PayPay)
-- Shop xac nhan thu cong qua dashboard
-- Anti-fraud: hash de phat hien anh trung, gioi han 3 upload/don
-- ============================================================

-- 1. PAYMENT_CONFIRMATIONS TABLE
create table if not exists public.payment_confirmations (
  id bigserial primary key,
  order_no text references public.orders(order_no) on delete cascade not null,
  user_id uuid references auth.users on delete set null,
  method text check (method in ('bank_transfer', 'paypay')) not null,
  claimed_amount integer not null,             -- So tien khach khai bao
  screenshot_url text not null,                 -- URL anh trong Storage
  screenshot_hash text not null,                -- SHA-256 cua anh
  file_size integer,                            -- Byte
  note text,                                    -- Khach ghi chu (vd: "chuyen tu Rakuten Bank")
  status text check (status in ('submitted','verified','rejected')) default 'submitted',
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  rejected_reason text,
  created_at timestamptz default now()
);

create index if not exists idx_pc_order on public.payment_confirmations(order_no);
create index if not exists idx_pc_user on public.payment_confirmations(user_id);
create index if not exists idx_pc_hash on public.payment_confirmations(screenshot_hash);
create index if not exists idx_pc_status on public.payment_confirmations(status);

-- 2. RLS
alter table public.payment_confirmations enable row level security;

drop policy if exists "User reads own confirmations" on public.payment_confirmations;
create policy "User reads own confirmations" on public.payment_confirmations
  for select using (auth.uid() = user_id);

drop policy if exists "User inserts own confirmations" on public.payment_confirmations;
create policy "User inserts own confirmations" on public.payment_confirmations
  for insert with check (auth.uid() = user_id);

drop policy if exists "Admin reads all confirmations" on public.payment_confirmations;
create policy "Admin reads all confirmations" on public.payment_confirmations
  for select using (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "Admin updates confirmations" on public.payment_confirmations;
create policy "Admin updates confirmations" on public.payment_confirmations
  for update using (exists (select 1 from public.admin_users where user_id = auth.uid()));

grant select, insert on public.payment_confirmations to authenticated;
grant usage, select on sequence public.payment_confirmations_id_seq to authenticated;

-- 3. RPC: submit_payment_confirmation (atomic: validate + insert + update order)
create or replace function public.submit_payment_confirmation(
  p_order_no text,
  p_method text,
  p_claimed_amount integer,
  p_screenshot_url text,
  p_screenshot_hash text,
  p_file_size integer,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order public.orders%rowtype;
  v_uid uuid;
  v_count int;
  v_hash_reuse int;
begin
  v_uid := auth.uid();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not authenticated'); end if;

  -- Validate order
  select * into v_order from public.orders where order_no = p_order_no;
  if not found then return jsonb_build_object('ok', false, 'error', 'order not found'); end if;
  if v_order.user_id is null or v_order.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'Đơn này không thuộc tài khoản của bạn');
  end if;
  if v_order.status not in ('pending', 'customer_paid') then
    return jsonb_build_object('ok', false, 'error', 'Đơn đã được xử lý, không thể gửi hóa đơn');
  end if;

  -- Validate method
  if p_method not in ('bank_transfer', 'paypay') then
    return jsonb_build_object('ok', false, 'error', 'Phương thức thanh toán không hợp lệ');
  end if;

  -- Validate amount (must match order total — allow ±1 for rounding)
  if abs(p_claimed_amount - v_order.total) > 1 then
    return jsonb_build_object('ok', false, 'error',
      'Số tiền không khớp với đơn hàng. Đơn #' || p_order_no || ' = ¥' || v_order.total);
  end if;

  -- Validate file size (100KB - 10MB)
  if p_file_size < 100000 or p_file_size > 10000000 then
    return jsonb_build_object('ok', false, 'error', 'Kích thước ảnh phải trong khoảng 100KB - 10MB');
  end if;

  -- Anti-fraud: max 3 confirmations per order
  select count(*) into v_count from public.payment_confirmations
    where order_no = p_order_no and user_id = v_uid;
  if v_count >= 3 then
    return jsonb_build_object('ok', false, 'error',
      'Đã đạt giới hạn 3 lần gửi hóa đơn cho đơn này. Vui lòng liên hệ shop.');
  end if;

  -- Anti-fraud: check if this hash was used in ANOTHER order (khả năng ảnh gian lận)
  select count(*) into v_hash_reuse from public.payment_confirmations
    where screenshot_hash = p_screenshot_hash and order_no <> p_order_no;

  -- Insert confirmation
  insert into public.payment_confirmations(
    order_no, user_id, method, claimed_amount, screenshot_url,
    screenshot_hash, file_size, note, status
  )
  values (
    p_order_no, v_uid, p_method, p_claimed_amount, p_screenshot_url,
    p_screenshot_hash, p_file_size, p_note, 'submitted'
  );

  -- Update order status to 'customer_paid' (awaiting shop verification)
  update public.orders set status = 'customer_paid' where order_no = p_order_no;

  return jsonb_build_object(
    'ok', true,
    'hash_reuse_warning', v_hash_reuse > 0,
    'confirmations_count', v_count + 1,
    'max_allowed', 3
  );
end;
$$;

grant execute on function public.submit_payment_confirmation(text, text, integer, text, text, integer, text) to authenticated;

-- 4. RPC: admin verify/reject confirmation
create or replace function public.verify_payment_confirmation(
  p_confirmation_id bigint,
  p_action text,           -- 'verify' or 'reject'
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_conf public.payment_confirmations%rowtype;
  v_uid uuid;
  v_is_admin boolean;
begin
  v_uid := auth.uid();
  v_is_admin := exists (select 1 from public.admin_users where user_id = v_uid);
  if not v_is_admin then return jsonb_build_object('ok', false, 'error', 'not authorized'); end if;

  select * into v_conf from public.payment_confirmations where id = p_confirmation_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'confirmation not found'); end if;

  if p_action = 'verify' then
    update public.payment_confirmations
      set status = 'verified', verified_by = v_uid, verified_at = now()
      where id = p_confirmation_id;
    -- Move order to 'confirmed'
    update public.orders set status = 'confirmed' where order_no = v_conf.order_no;
    return jsonb_build_object('ok', true, 'action', 'verified');
  elsif p_action = 'reject' then
    update public.payment_confirmations
      set status = 'rejected', verified_by = v_uid, verified_at = now(),
          rejected_reason = coalesce(p_reason, '')
      where id = p_confirmation_id;
    -- Revert order back to 'pending' (so customer can retry)
    update public.orders set status = 'pending' where order_no = v_conf.order_no;
    return jsonb_build_object('ok', true, 'action', 'rejected');
  else
    return jsonb_build_object('ok', false, 'error', 'Invalid action');
  end if;
end;
$$;

grant execute on function public.verify_payment_confirmation(bigint, text, text) to authenticated;

-- ============================================================
-- DONE. Next: Tao Storage bucket 'payment-proofs' qua Supabase UI:
-- Dashboard -> Storage -> "New bucket" -> name: payment-proofs
-- Public: NO (private), File size limit: 10MB, MIME: image/*
-- ============================================================
