-- ============================================================
-- BONUS TOKEN MIGRATION — VIỆC 1/5 (2026-05-08)
-- ============================================================
-- Refactor flow nhận 100đ welcome:
-- Trước: link ?claim=welcome chung cho mọi user → không xác định
--        được ai → KHÔNG chống được replay/multi-claim qua nhiều account.
-- Sau:   mỗi user có bonus_token riêng → link ?claim=welcome&token=xxx
--        → backend validate token + check chưa claim → an toàn.
--
-- LƯU Ý QUAN TRỌNG:
-- Anh ghi "bảng users" trong yêu cầu, nhưng bảng `auth.users` của
-- Supabase là managed → KHÔNG ALTER COLUMN được (Supabase chặn).
-- → Em add 2 cột vào `public.profiles` (1-1 với auth.users qua p.id).
-- Đây là pattern chuẩn của Supabase. Tất cả custom user fields đều
-- nằm trong public.profiles (đã có phone, welcome_claimed_at, ...).
--
-- File này IDEMPOTENT — chạy nhiều lần OK.
-- ============================================================

-- 0. Đảm bảo extension pgcrypto cho gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 1. THÊM 2 CỘT (nếu chưa có)                              ║
-- ╚══════════════════════════════════════════════════════════╝

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'bonus_token'
  ) THEN
    -- DEFAULT clause: user mới INSERT tự động có token (không cần app layer gen).
    -- Single source of truth ở DB → tránh duplicate logic ở trigger/frontend/RPC.
    ALTER TABLE public.profiles
      ADD COLUMN bonus_token text DEFAULT encode(gen_random_bytes(16), 'hex');
    RAISE NOTICE 'ADDED column bonus_token (with DEFAULT)';
  ELSE
    RAISE NOTICE 'SKIPPED bonus_token (already exists)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'bonus_claimed'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN bonus_claimed boolean NOT NULL DEFAULT false;
    RAISE NOTICE 'ADDED column bonus_claimed';
  ELSE
    RAISE NOTICE 'SKIPPED bonus_claimed (already exists)';
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 2. BACKFILL token cho profiles hiện có                   ║
-- ╚══════════════════════════════════════════════════════════╝

-- Mỗi profile chưa có token → gen 32-char hex random (128 bits entropy)
UPDATE public.profiles
   SET bonus_token = encode(gen_random_bytes(16), 'hex')
 WHERE bonus_token IS NULL;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 3. BACKFILL bonus_claimed=true cho user ĐÃ claim trước   ║
-- ╚══════════════════════════════════════════════════════════╝

-- Nếu welcome_claimed_at NOT NULL → đã claim → set bonus_claimed=true
UPDATE public.profiles
   SET bonus_claimed = true
 WHERE welcome_claimed_at IS NOT NULL
   AND bonus_claimed = false;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 4. CONSTRAINTS sau khi backfill xong                     ║
-- ╚══════════════════════════════════════════════════════════╝

-- bonus_token PHẢI NOT NULL (mọi profile đều có token)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.profiles ALTER COLUMN bonus_token SET NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'NOT NULL constraint already set or backfill failed';
  END;
END $$;

-- UNIQUE constraint trên bonus_token
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'profiles_bonus_token_unique'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_bonus_token_unique UNIQUE (bonus_token);
    RAISE NOTICE 'ADDED UNIQUE constraint';
  ELSE
    RAISE NOTICE 'SKIPPED UNIQUE constraint (already exists)';
  END IF;
END $$;

-- Index lookup nhanh cho endpoint claim (chỉ index những token chưa claim)
CREATE INDEX IF NOT EXISTS idx_profiles_bonus_token_unclaimed
  ON public.profiles (bonus_token)
 WHERE bonus_claimed = false;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 5. COLUMN-LEVEL PRIVILEGES (BẢO MẬT)                     ║
-- ╚══════════════════════════════════════════════════════════╝
-- Anh yêu cầu:
--   - bonus_token: client KHÔNG được SELECT (qua anon/authenticated key)
--   - bonus_claimed + welcome_claimed_at + ... : client KHÔNG UPDATE được
--   - Cả hai chỉ thao tác qua RPC SECURITY DEFINER (claim_welcome_bonus_by_token)
--     hoặc qua server-side service_role key.
-- ─────────────────────────────────────────────────────────────
-- LƯU Ý: Đây là PostgreSQL column-level GRANT/REVOKE — runs BEFORE RLS.
-- Nếu role không có privilege column-level → query fail BẤT KỂ RLS policy.
-- ─────────────────────────────────────────────────────────────

-- 5.1: REVOKE SELECT cột bonus_token (client KHÔNG đọc được token)
REVOKE SELECT (bonus_token) ON public.profiles FROM authenticated, anon;

-- 5.2: White-list cột user được phép UPDATE.
-- REVOKE all UPDATE table-level → GRANT lại từng cột cụ thể.
-- Cột KHÔNG có trong list = client không UPDATE được:
--   bonus_token, bonus_claimed, welcome_claimed_at, customer_code, points_balance, ...
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (
  display_name,
  phone,
  prefecture,
  postal,
  address,
  gender
  -- birthday: KHÔNG add (đã có trigger lock_birthday — chỉ cho set 1 lần)
) ON public.profiles TO authenticated;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 6. VERIFY                                                ║
-- ╚══════════════════════════════════════════════════════════╝

-- 5.1: 2 cột đã add?
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'profiles'
   AND column_name IN ('bonus_token', 'bonus_claimed')
 ORDER BY column_name;
-- Mong đợi: 2 rows
--   bonus_claimed | boolean | NO  | false
--   bonus_token   | text    | NO  | (null)

-- 5.2: Mọi profile có token (không NULL)?
SELECT
  COUNT(*) FILTER (WHERE bonus_token IS NULL) AS null_tokens,
  COUNT(*) FILTER (WHERE bonus_token IS NOT NULL) AS valid_tokens,
  COUNT(*) AS total_profiles
  FROM public.profiles;
-- Mong đợi: null_tokens = 0

-- 5.3: Tokens unique (không duplicate)?
SELECT bonus_token, COUNT(*) AS dup_count
  FROM public.profiles
 GROUP BY bonus_token
HAVING COUNT(*) > 1;
-- Mong đợi: 0 rows

-- 5.4: Stats claimed status
SELECT
  COUNT(*) FILTER (WHERE bonus_claimed = true) AS already_claimed,
  COUNT(*) FILTER (WHERE bonus_claimed = false) AS not_yet_claimed,
  COUNT(*) FILTER (WHERE welcome_claimed_at IS NOT NULL) AS legacy_claimed,
  COUNT(*) AS total
  FROM public.profiles;
-- Mong đợi: already_claimed = legacy_claimed (sync sau backfill)

-- 5.5: Sample 5 user mới nhất + token + status
-- (chạy với role postgres trong SQL Editor → bypass column-level revoke → đọc được token)
SELECT u.email,
       LEFT(p.bonus_token, 8) || '...' AS token_preview,
       p.bonus_claimed,
       p.welcome_claimed_at::date
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
 ORDER BY u.created_at DESC
 LIMIT 5;

-- 5.6: Verify column-level privileges
-- Mong đợi:
--   - authenticated/anon KHÔNG có row cho bonus_token / bonus_claimed / welcome_claimed_at với privilege_type=SELECT/UPDATE
--   - authenticated CÓ row UPDATE cho 6 cột white-list (display_name, phone, ...)
SELECT grantee, privilege_type, column_name
  FROM information_schema.column_privileges
 WHERE table_schema = 'public'
   AND table_name = 'profiles'
   AND grantee IN ('anon', 'authenticated')
   AND column_name IN (
     'bonus_token', 'bonus_claimed', 'welcome_claimed_at',
     'display_name', 'phone', 'prefecture', 'postal', 'address', 'gender'
   )
 ORDER BY column_name, grantee, privilege_type;

-- 5.7: DEFAULT clause của bonus_token chính xác?
SELECT column_name, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles'
   AND column_name = 'bonus_token';
-- Mong đợi: column_default = "encode(gen_random_bytes(16), 'hex'::text)"

-- ============================================================
-- DONE — sau khi anh review OK + chạy file này:
--   - Cột bonus_token + bonus_claimed đã có
--   - DEFAULT auto-gen token cho user mới (Việc 2 trigger không cần gen)
--   - Column-level privileges restrict client read/write
-- → em sang Việc 2 (update trigger) sau khi anh confirm.
-- ============================================================
