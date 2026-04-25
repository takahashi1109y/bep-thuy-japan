-- ============================================================
-- Migration: Product catalog (fixed 10 products from Đặc Sản page)
-- ============================================================
-- Run ONE time in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================

-- Drop old dynamic product_costs table (was created by previous migration)
drop table if exists public.product_costs cascade;

-- Create product_catalog with fixed 10 products
create table if not exists public.product_catalog (
  id int primary key,
  name text not null,
  unit_label text not null,        -- "0.5kg" or "hộp"
  unit_price int not null,         -- giá bán mỗi unit (¥)
  cost int not null default 0,     -- giá vốn mỗi unit (admin nhập)
  display_order int default 0,
  is_active boolean default true,
  updated_at timestamptz default now()
);

-- Seed 10 products from index.html data-id 1..10
insert into public.product_catalog (id, name, unit_label, unit_price, display_order) values
  (1,  '[GT] Giò có tiêu',                        '0.5kg', 925,  1),
  (2,  '[GKT] Giò không tiêu',                    '0.5kg', 925,  2),
  (3,  '[C] Chả quế có tiêu',                     '0.5kg', 925,  3),
  (4,  '[CKT] Chả quế không tiêu',                '0.5kg', 925,  4),
  (5,  '[CLUA] Chả lụa không tiêu, không quế',    '0.5kg', 925,  5),
  (6,  '[M] Mọc có tiêu',                         '0.5kg', 875,  6),
  (7,  '[MKT] Mọc không tiêu',                    '0.5kg', 875,  7),
  (8,  '[Nem] Nem lụi cuốn sả Huế',               'hộp',   1100, 8),
  (9,  '[Pte] PA TE',                             'hộp',   1350, 9),
  (10, '[CLUA TIEU] Chả lụa không quế có tiêu',   '0.5kg', 925,  10)
on conflict (id) do update set
  name = excluded.name,
  unit_label = excluded.unit_label,
  unit_price = excluded.unit_price,
  display_order = excluded.display_order,
  updated_at = now();

-- Auto-touch updated_at on edit
create or replace function public.touch_product_catalog_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_product_catalog_touch on public.product_catalog;
create trigger trg_product_catalog_touch
before update on public.product_catalog
for each row execute function public.touch_product_catalog_updated_at();

-- RLS: admin only
alter table public.product_catalog enable row level security;

drop policy if exists "Admin manage catalog" on public.product_catalog;
create policy "Admin manage catalog" on public.product_catalog
for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
