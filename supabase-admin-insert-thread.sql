-- ============================================================
-- Migration: Allow admin to INSERT new message_threads
-- ============================================================
-- Run ONE time in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
-- ============================================================
-- Trước đây admin chỉ có SELECT + UPDATE policy trên message_threads.
-- Khi admin gửi tin nhắn cho khách chưa có thread nào → INSERT bị
-- chặn bởi RLS. Migration này thêm policy admin INSERT.

drop policy if exists "Admin inserts threads" on public.message_threads;
create policy "Admin inserts threads" on public.message_threads
  for insert
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
