-- ============================================================
-- TEST E2E v2 — OUTPUT 1 BẢNG DUY NHẤT (9 DÒNG PASS/FAIL)
-- ============================================================
-- Khác v1: gộp 9 bước thành 1 SELECT cuối → Supabase SQL Editor
-- chỉ cần hiển thị 1 bảng kết quả cuối cùng.
-- ============================================================

BEGIN;
SET LOCAL client_min_messages = WARNING;

-- Temp table tích lũy kết quả 9 bước
CREATE TEMP TABLE _results (
  step int,
  test_name text,
  status text,
  detail text
) ON COMMIT DROP;

DO $$
DECLARE
  v_user1 uuid := gen_random_uuid();
  v_user2 uuid := gen_random_uuid();
  v_token1 text;
  v_token2 text;
  v_result jsonb;
  v_count int;
  v_setup_failed boolean := false;
BEGIN
  -- ═══════════════════════════════════════════════
  -- BƯỚC 1: Tạo 2 user giả → trigger handle_new_user fire
  -- ═══════════════════════════════════════════════
  BEGIN
    INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at,
                            aud, role, instance_id, raw_user_meta_data)
    VALUES
      (v_user1, 'test1@example.com', now(), now(), now(),
       'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
       '{"display_name":"Test User 1"}'::jsonb),
      (v_user2, 'test2@example.com', now(), now(), now(),
       'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
       '{"display_name":"Test User 2"}'::jsonb);

    SELECT COUNT(*) INTO v_count FROM public.profiles WHERE id IN (v_user1, v_user2);
    INSERT INTO _results VALUES (
      1,
      '1. Tao 2 user gia + profile auto-create',
      CASE WHEN v_count = 2 THEN 'PASS' ELSE 'FAIL' END,
      v_count::text || ' profiles created (expected 2)'
    );

    IF v_count != 2 THEN
      v_setup_failed := true;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results VALUES (
      1,
      '1. Tao 2 user gia + profile auto-create',
      'FAIL',
      'EXCEPTION: ' || SQLERRM
    );
    v_setup_failed := true;
  END;

  -- Nếu setup fail → skip các bước sau, ghi lại lý do
  IF v_setup_failed THEN
    INSERT INTO _results
    SELECT s.step, '(skipped vì bước 1 fail)', 'SKIP', 'Khong chay duoc — bug Supabase auth.users INSERT block'
    FROM generate_series(2, 9) AS s(step);
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════
  -- BƯỚC 2: Token tự sinh từ DEFAULT
  -- ═══════════════════════════════════════════════
  SELECT bonus_token INTO v_token1 FROM public.profiles WHERE id = v_user1;
  SELECT bonus_token INTO v_token2 FROM public.profiles WHERE id = v_user2;
  INSERT INTO _results VALUES (
    2,
    '2. Token tu sinh khi user moi (DEFAULT lo)',
    CASE WHEN v_token1 IS NOT NULL AND length(v_token1)=32 AND v_token1 ~ '^[0-9a-f]{32}$'
              AND v_token2 IS NOT NULL AND length(v_token2)=32 AND v_token2 ~ '^[0-9a-f]{32}$'
              AND v_token1 != v_token2
         THEN 'PASS' ELSE 'FAIL' END,
    'user1=' || COALESCE(LEFT(v_token1,8) || '...', 'NULL')
    || ' | user2=' || COALESCE(LEFT(v_token2,8) || '...', 'NULL')
  );

  -- ═══════════════════════════════════════════════
  -- BƯỚC 3: bonus_claimed mặc định false
  -- ═══════════════════════════════════════════════
  SELECT COUNT(*) INTO v_count FROM public.profiles
    WHERE id IN (v_user1, v_user2) AND bonus_claimed = false;
  INSERT INTO _results VALUES (
    3,
    '3. bonus_claimed mac dinh FALSE',
    CASE WHEN v_count = 2 THEN 'PASS' ELSE 'FAIL' END,
    v_count::text || '/2 user co bonus_claimed=false'
  );

  -- ═══════════════════════════════════════════════
  -- BƯỚC 4: User1 click link đúng → SUCCESS
  -- ═══════════════════════════════════════════════
  BEGIN
    PERFORM set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_user1::text)::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.claim_welcome_bonus_by_token(v_token1);
    PERFORM set_config('role', 'postgres', true);

    INSERT INTO _results VALUES (
      4,
      '4. user1 click link dung -> SUCCESS',
      CASE WHEN v_result->>'ok' = 'true'
            AND (v_result->>'points')::int = 100
           THEN 'PASS' ELSE 'FAIL' END,
      'actual=' || v_result::text
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results VALUES (4, '4. user1 click link dung -> SUCCESS', 'FAIL',
      'EXCEPTION (mock auth.uid() may not work): ' || SQLERRM);
  END;

  -- ═══════════════════════════════════════════════
  -- BƯỚC 5: Điểm 100 cộng vào tài khoản
  -- ═══════════════════════════════════════════════
  SELECT points INTO v_count FROM public.points_transactions
   WHERE user_id = v_user1 AND type='welcome' LIMIT 1;
  INSERT INTO _results VALUES (
    5,
    '5. Diem 100 cong vao tai khoan',
    CASE WHEN v_count = 100 THEN 'PASS' ELSE 'FAIL' END,
    'points=' || COALESCE(v_count::text, 'NULL') || ' (expected 100)'
  );

  -- ═══════════════════════════════════════════════
  -- BƯỚC 6: bonus_claimed=true sau claim
  -- ═══════════════════════════════════════════════
  INSERT INTO _results VALUES (
    6,
    '6. Danh dau da nhan (bonus_claimed=true)',
    CASE WHEN (SELECT bonus_claimed FROM public.profiles WHERE id=v_user1) = true
         THEN 'PASS' ELSE 'FAIL' END,
    'bonus_claimed=' || COALESCE((SELECT bonus_claimed::text FROM public.profiles WHERE id=v_user1), 'NULL')
  );

  -- ═══════════════════════════════════════════════
  -- BƯỚC 7: Click lần 2 → already_claimed
  -- ═══════════════════════════════════════════════
  BEGIN
    PERFORM set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_user1::text)::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.claim_welcome_bonus_by_token(v_token1);
    PERFORM set_config('role', 'postgres', true);

    INSERT INTO _results VALUES (
      7,
      '7. Click lan 2 -> tu choi "da nhan"',
      CASE WHEN v_result->>'error' = 'already_claimed' THEN 'PASS' ELSE 'FAIL' END,
      'actual=' || v_result::text
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results VALUES (7, '7. Click lan 2', 'FAIL', 'EXCEPTION: ' || SQLERRM);
  END;

  -- ═══════════════════════════════════════════════
  -- BƯỚC 8: Token sai → invalid_token
  -- ═══════════════════════════════════════════════
  BEGIN
    PERFORM set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_user1::text)::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.claim_welcome_bonus_by_token('00000000000000000000000000000000');
    PERFORM set_config('role', 'postgres', true);

    INSERT INTO _results VALUES (
      8,
      '8. Token sai -> invalid_token',
      CASE WHEN v_result->>'error' = 'invalid_token' THEN 'PASS' ELSE 'FAIL' END,
      'actual=' || v_result::text
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results VALUES (8, '8. Token sai', 'FAIL', 'EXCEPTION: ' || SQLERRM);
  END;

  -- ═══════════════════════════════════════════════
  -- BƯỚC 9: User2 dùng token user1 → not_your_token
  -- ═══════════════════════════════════════════════
  BEGIN
    PERFORM set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_user2::text)::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.claim_welcome_bonus_by_token(v_token1);
    PERFORM set_config('role', 'postgres', true);

    INSERT INTO _results VALUES (
      9,
      '9. User khac dung token nguoi khac -> not_your_token',
      CASE WHEN v_result->>'error' = 'not_your_token' THEN 'PASS' ELSE 'FAIL' END,
      'actual=' || v_result::text
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results VALUES (9, '9. Token nguoi khac', 'FAIL', 'EXCEPTION: ' || SQLERRM);
  END;

END $$;

-- ═══════════════════════════════════════════════
-- OUTPUT FINAL — 1 BẢNG 9 DÒNG
-- ═══════════════════════════════════════════════
SELECT step, status, test_name, detail
  FROM _results
 ORDER BY step;

-- ROLLBACK: xóa user giả + profile + transactions test
ROLLBACK;
