-- ============================================================
-- Migration: Product cost tracking (for real profit calculation)
-- ============================================================
-- Run ONE time in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================

create table if not exists public.product_costs (
  id bigserial primary key,
  product_key text not null unique,        -- normalized "name|size"
  product_name text not null,
  product_size text,
  cost numeric not null default 0,         -- giá vốn (¥)
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_product_costs_key on public.product_costs(product_key);

-- Auto-update updated_at
create or replace function public.touch_product_costs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_product_costs_touch on public.product_costs;
create trigger trg_product_costs_touch
before update on public.product_costs
for each row execute function public.touch_product_costs_updated_at();

-- RLS: admins only
alter table public.product_costs enable row level security;

drop policy if exists "Admin manage product costs" on public.product_costs;
create policy "Admin manage product costs" on public.product_costs
for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
