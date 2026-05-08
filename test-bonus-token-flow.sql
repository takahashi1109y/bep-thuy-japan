-- ============================================================
-- TEST E2E FLOW WELCOME BONUS — TOKEN PER USER
-- ============================================================
-- CÁCH CHẠY:
--   1. Mở Supabase SQL Editor (https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new)
--   2. PASTE TOÀN BỘ FILE NÀY → bấm Run
--   3. Copy paste kết quả cho em
--
-- ĐIỀU KIỆN: Phải chạy 3 file này TRƯỚC:
--   - supabase-bonus-token-migration.sql (Việc 1 — cột bonus_token, bonus_claimed)
--   - supabase-bonus-token-trigger.sql (Việc 2 — trigger handle_new_user)
--   - supabase-claim-welcome-bonus-v2.sql (Việc 4 — RPC claim_welcome_bonus_by_token)
--
-- AN TOÀN: Toàn bộ test wrap trong BEGIN ... ROLLBACK → KHÔNG để lại dữ liệu.
-- Sau khi chạy xong, DB y nguyên như trước, KHÔNG có user test còn sót.
-- ============================================================

BEGIN;

-- Suppress notices để output sạch
SET LOCAL client_min_messages = WARNING;

-- ============================================================
-- SETUP: tạo 2 user test (test1@example.com, test2@example.com)
-- ============================================================
-- Trigger handle_new_user sẽ fire → tạo profile + DEFAULT gen bonus_token

DO $$
DECLARE
  v_user1_id uuid := gen_random_uuid();
  v_user2_id uuid := gen_random_uuid();
BEGIN
  -- INSERT vào auth.users (chỉ role postgres làm được trong SQL Editor)
  INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at,
                          aud, role, instance_id, raw_user_meta_data)
  VALUES
    (v_user1_id, 'test1@example.com', now(), now(), now(),
     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
     '{"display_name":"Test User 1"}'::jsonb),
    (v_user2_id, 'test2@example.com', now(), now(), now(),
     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
     '{"display_name":"Test User 2"}'::jsonb);

  -- Lưu UUID vào temp table để các test sau đọc
  CREATE TEMP TABLE _test_users (label text, user_id uuid) ON COMMIT DROP;
  INSERT INTO _test_users VALUES
    ('user1', v_user1_id),
    ('user2', v_user2_id);
END $$;

-- ============================================================
-- BƯỚC 1: User giả đăng ký xong → profile tồn tại?
-- ============================================================
SELECT
  '1. Tạo user giả + profile auto-create' AS test_step,
  CASE
    WHEN COUNT(*) = 2 THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  COUNT(*)::text || ' profiles created (expected 2)' AS detail
FROM public.profiles p
JOIN _test_users tu ON tu.user_id = p.id;

-- ============================================================
-- BƯỚC 2: Database tự sinh bonus_token (không null, 32 ký tự hex)?
-- ============================================================
SELECT
  '2. Token tự sinh khi user mới' AS test_step,
  CASE
    WHEN COUNT(*) = 2 THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  string_agg(
    'user=' || tu.label || ' token_len=' || COALESCE(length(p.bonus_token)::text, 'NULL'),
    ' | '
  ) AS detail
FROM public.profiles p
JOIN _test_users tu ON tu.user_id = p.id
WHERE p.bonus_token IS NOT NULL
  AND length(p.bonus_token) = 32
  AND p.bonus_token ~ '^[0-9a-f]{32}$';  -- 32 hex chars

-- ============================================================
-- BƯỚC 3: bonus_claimed mặc định = false?
-- ============================================================
SELECT
  '3. bonus_claimed mặc định FALSE' AS test_step,
  CASE
    WHEN COUNT(*) FILTER (WHERE bonus_claimed = false) = 2 THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  COUNT(*) FILTER (WHERE bonus_claimed = false)::text || '/2 user có bonus_claimed=false' AS detail
FROM public.profiles p
JOIN _test_users tu ON tu.user_id = p.id;

-- ============================================================
-- BƯỚC 4: Mock auth.uid() = user1, user1 click link với token của user1
--         → expect SUCCESS, points=100
-- ============================================================
DO $$
DECLARE
  v_user1_id uuid;
  v_token1 text;
  v_result jsonb;
BEGIN
  SELECT user_id INTO v_user1_id FROM _test_users WHERE label='user1';
  SELECT bonus_token INTO v_token1 FROM public.profiles WHERE id=v_user1_id;

  -- Mock auth.uid() bằng cách set local request.jwt.claims (Supabase pattern)
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_user1_id::text)::text,
                     true);
  PERFORM set_config('role', 'authenticated', true);

  v_result := public.claim_welcome_bonus_by_token(v_token1);

  CREATE TEMP TABLE _test_results (step int, label text, expected text, actual text)
    ON COMMIT DROP;
  INSERT INTO _test_results VALUES
    (4, '4. user1 click link đúng → SUCCESS',
     '{"ok": true, "points": 100}',
     v_result::text);

  -- Reset role
  PERFORM set_config('role', 'postgres', true);
END $$;

SELECT
  label AS test_step,
  CASE
    WHEN actual::jsonb->>'ok' = 'true'
     AND (actual::jsonb->>'points')::int = 100 THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  'expected=' || expected || ' | actual=' || actual AS detail
FROM _test_results WHERE step=4;

-- ============================================================
-- BƯỚC 5: Sau claim, points_transactions có 100 điểm welcome?
-- ============================================================
SELECT
  '5. Điểm 100 cộng vào tài khoản' AS test_step,
  CASE
    WHEN points = 100 AND type='welcome' THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  'points=' || COALESCE(points::text, 'NULL')
   || ' type=' || COALESCE(type, 'NULL') AS detail
FROM public.points_transactions pt
JOIN _test_users tu ON tu.user_id = pt.user_id AND tu.label='user1';

-- ============================================================
-- BƯỚC 6: bonus_claimed=true sau khi claim?
-- ============================================================
SELECT
  '6. Đánh dấu đã nhận' AS test_step,
  CASE
    WHEN p.bonus_claimed = true THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  'bonus_claimed=' || p.bonus_claimed::text AS detail
FROM public.profiles p
JOIN _test_users tu ON tu.user_id = p.id AND tu.label='user1';

-- ============================================================
-- BƯỚC 7: User1 click LẠI lần 2 → expect already_claimed
-- ============================================================
DO $$
DECLARE
  v_user1_id uuid;
  v_token1 text;
  v_result jsonb;
BEGIN
  SELECT user_id INTO v_user1_id FROM _test_users WHERE label='user1';
  SELECT bonus_token INTO v_token1 FROM public.profiles WHERE id=v_user1_id;

  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_user1_id::text)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_result := public.claim_welcome_bonus_by_token(v_token1);

  INSERT INTO _test_results VALUES
    (7, '7. Click lần 2 → từ chối "đã nhận"',
     'error=already_claimed',
     v_result::text);

  PERFORM set_config('role', 'postgres', true);
END $$;

SELECT
  label AS test_step,
  CASE
    WHEN actual::jsonb->>'error' = 'already_claimed' THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  'expected=' || expected || ' | actual=' || actual AS detail
FROM _test_results WHERE step=7;

-- ============================================================
-- BƯỚC 8: BONUS — User1 dùng token SAI → expect invalid_token
-- ============================================================
DO $$
DECLARE
  v_user1_id uuid;
  v_result jsonb;
BEGIN
  SELECT user_id INTO v_user1_id FROM _test_users WHERE label='user1';
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_user1_id::text)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_result := public.claim_welcome_bonus_by_token('00000000000000000000000000000000');

  INSERT INTO _test_results VALUES
    (8, '8. Token sai → invalid_token',
     'error=invalid_token',
     v_result::text);

  PERFORM set_config('role', 'postgres', true);
END $$;

SELECT
  label AS test_step,
  CASE
    WHEN actual::jsonb->>'error' = 'invalid_token' THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  'expected=' || expected || ' | actual=' || actual AS detail
FROM _test_results WHERE step=8;

-- ============================================================
-- BƯỚC 9: BONUS — User2 dùng token của User1 → expect not_your_token
-- ============================================================
DO $$
DECLARE
  v_user2_id uuid;
  v_token1 text;
  v_user1_id uuid;
  v_result jsonb;
BEGIN
  SELECT user_id INTO v_user1_id FROM _test_users WHERE label='user1';
  SELECT user_id INTO v_user2_id FROM _test_users WHERE label='user2';
  SELECT bonus_token INTO v_token1 FROM public.profiles WHERE id=v_user1_id;

  -- Mock auth.uid() = user2 nhưng dùng token của user1
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_user2_id::text)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_result := public.claim_welcome_bonus_by_token(v_token1);

  INSERT INTO _test_results VALUES
    (9, '9. User khác dùng token người khác → not_your_token',
     'error=not_your_token',
     v_result::text);

  PERFORM set_config('role', 'postgres', true);
END $$;

SELECT
  label AS test_step,
  CASE
    WHEN actual::jsonb->>'error' = 'not_your_token' THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  'expected=' || expected || ' | actual=' || actual AS detail
FROM _test_results WHERE step=9;

-- ============================================================
-- TỔNG KẾT
-- ============================================================
SELECT
  '═══ SUMMARY ═══' AS test_step,
  'Nếu mọi bước PASS → flow OK, deploy được. Nếu có FAIL → đọc detail + báo em.' AS status,
  'Tổng số test: 9 (3 setup + 4 main + 2 edge case)' AS detail;

-- ============================================================
-- ROLLBACK: xóa tất cả dữ liệu test (user giả, profile, transactions)
-- ============================================================
ROLLBACK;

-- Sau ROLLBACK, DB sạch hoàn toàn — không còn test1@example.com, test2@example.com.
