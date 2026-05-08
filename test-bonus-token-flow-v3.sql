-- ============================================================
-- TEST E2E v3 — DÙNG SET_CONFIG (PERSIST QUA NHIỀU STATEMENT)
-- ============================================================
-- Khác v2: bỏ TEMP TABLE (Supabase Editor unfriendly), dùng
-- set_config/current_setting để persist kết quả qua statements.
-- ============================================================

BEGIN;
SET LOCAL client_min_messages = WARNING;

-- Reset biến phiên trước khi chạy
SELECT set_config('test.results', '[]', false);

DO $$
DECLARE
  v_user1 uuid := gen_random_uuid();
  v_user2 uuid := gen_random_uuid();
  v_token1 text;
  v_token2 text;
  v_result jsonb;
  v_count int;
  v_results jsonb := '[]'::jsonb;
  v_setup_failed boolean := false;

  -- Helper inline: append 1 kết quả vào jsonb array
  -- (PL/pgSQL không có function inline nên em dùng macro pattern)
BEGIN
  -- ═══════════════════════════════════════════════
  -- BƯỚC 1: Tạo 2 user giả
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
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'step', 1,
      'test_name', '1. Tao 2 user gia + profile auto-create',
      'status', CASE WHEN v_count = 2 THEN 'PASS' ELSE 'FAIL' END,
      'detail', v_count::text || ' profiles created (expected 2)'
    ));
    IF v_count != 2 THEN v_setup_failed := true; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'step', 1,
      'test_name', '1. Tao 2 user gia + profile auto-create',
      'status', 'FAIL',
      'detail', 'EXCEPTION: ' || SQLERRM
    ));
    v_setup_failed := true;
  END;

  -- Skip nếu setup fail
  IF v_setup_failed THEN
    FOR v_count IN 2..9 LOOP
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'step', v_count,
        'test_name', '(skipped buoc ' || v_count || ')',
        'status', 'SKIP',
        'detail', 'Bo qua vi buoc 1 fail'
      ));
    END LOOP;
    PERFORM set_config('test.results', v_results::text, false);
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════
  -- BƯỚC 2: Token tự sinh
  -- ═══════════════════════════════════════════════
  SELECT bonus_token INTO v_token1 FROM public.profiles WHERE id = v_user1;
  SELECT bonus_token INTO v_token2 FROM public.profiles WHERE id = v_user2;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'step', 2,
    'test_name', '2. Token tu sinh khi user moi (DEFAULT lo)',
    'status', CASE WHEN v_token1 IS NOT NULL AND length(v_token1)=32 AND v_token1 ~ '^[0-9a-f]{32}$'
                    AND v_token2 IS NOT NULL AND length(v_token2)=32 AND v_token2 ~ '^[0-9a-f]{32}$'
                    AND v_token1 != v_token2
                   THEN 'PASS' ELSE 'FAIL' END,
    'detail', 'user1=' || COALESCE(LEFT(v_token1,8) || '...', 'NULL')
              || ' | user2=' || COALESCE(LEFT(v_token2,8) || '...', 'NULL')
  ));

  -- ═══════════════════════════════════════════════
  -- BƯỚC 3: bonus_claimed default false
  -- ═══════════════════════════════════════════════
  SELECT COUNT(*) INTO v_count FROM public.profiles
   WHERE id IN (v_user1, v_user2) AND bonus_claimed = false;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'step', 3,
    'test_name', '3. bonus_claimed mac dinh FALSE',
    'status', CASE WHEN v_count = 2 THEN 'PASS' ELSE 'FAIL' END,
    'detail', v_count::text || '/2 user co bonus_claimed=false'
  ));

  -- ═══════════════════════════════════════════════
  -- BƯỚC 4: User1 click link đúng → SUCCESS
  -- ═══════════════════════════════════════════════
  BEGIN
    PERFORM set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_user1::text)::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.claim_welcome_bonus_by_token(v_token1);
    PERFORM set_config('role', 'postgres', true);
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'step', 4,
      'test_name', '4. user1 click link dung -> SUCCESS',
      'status', CASE WHEN v_result->>'ok' = 'true' AND (v_result->>'points')::int = 100
                     THEN 'PASS' ELSE 'FAIL' END,
      'detail', 'actual=' || v_result::text
    ));
  EXCEPTION WHEN OTHERS THEN
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'step', 4,
      'test_name', '4. user1 click link dung -> SUCCESS',
      'status', 'FAIL',
      'detail', 'EXCEPTION (mock auth.uid() may not work): ' || SQLERRM
    ));
  END;

  -- ═══════════════════════════════════════════════
  -- BƯỚC 5: 100 điểm cộng vào tài khoản
  -- ═══════════════════════════════════════════════
  SELECT points INTO v_count FROM public.points_transactions
   WHERE user_id = v_user1 AND type='welcome' LIMIT 1;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'step', 5,
    'test_name', '5. Diem 100 cong vao tai khoan',
    'status', CASE WHEN v_count = 100 THEN 'PASS' ELSE 'FAIL' END,
    'detail', 'points=' || COALESCE(v_count::text, 'NULL') || ' (expected 100)'
  ));

  -- ═══════════════════════════════════════════════
  -- BƯỚC 6: bonus_claimed=true sau claim
  -- ═══════════════════════════════════════════════
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'step', 6,
    'test_name', '6. Danh dau da nhan (bonus_claimed=true)',
    'status', CASE WHEN (SELECT bonus_claimed FROM public.profiles WHERE id=v_user1) = true
                   THEN 'PASS' ELSE 'FAIL' END,
    'detail', 'bonus_claimed=' || COALESCE((SELECT bonus_claimed::text FROM public.profiles WHERE id=v_user1), 'NULL')
  ));

  -- ═══════════════════════════════════════════════
  -- BƯỚC 7: Click lần 2 → already_claimed
  -- ═══════════════════════════════════════════════
  BEGIN
    PERFORM set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_user1::text)::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.claim_welcome_bonus_by_token(v_token1);
    PERFORM set_config('role', 'postgres', true);
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'step', 7,
      'test_name', '7. Click lan 2 -> tu choi "da nhan"',
      'status', CASE WHEN v_result->>'error' = 'already_claimed' THEN 'PASS' ELSE 'FAIL' END,
      'detail', 'actual=' || v_result::text
    ));
  EXCEPTION WHEN OTHERS THEN
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'step', 7, 'test_name', '7. Click lan 2', 'status', 'FAIL', 'detail', 'EXCEPTION: ' || SQLERRM
    ));
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
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'step', 8,
      'test_name', '8. Token sai -> invalid_token',
      'status', CASE WHEN v_result->>'error' = 'invalid_token' THEN 'PASS' ELSE 'FAIL' END,
      'detail', 'actual=' || v_result::text
    ));
  EXCEPTION WHEN OTHERS THEN
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'step', 8, 'test_name', '8. Token sai', 'status', 'FAIL', 'detail', 'EXCEPTION: ' || SQLERRM
    ));
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
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'step', 9,
      'test_name', '9. User khac dung token nguoi khac -> not_your_token',
      'status', CASE WHEN v_result->>'error' = 'not_your_token' THEN 'PASS' ELSE 'FAIL' END,
      'detail', 'actual=' || v_result::text
    ));
  EXCEPTION WHEN OTHERS THEN
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'step', 9, 'test_name', '9. Token nguoi khac', 'status', 'FAIL', 'detail', 'EXCEPTION: ' || SQLERRM
    ));
  END;

  -- Lưu kết quả vào biến phiên (persist qua statements)
  PERFORM set_config('test.results', v_results::text, false);
END $$;

-- ═══════════════════════════════════════════════
-- OUTPUT FINAL — đọc kết quả từ biến phiên
-- ═══════════════════════════════════════════════
SELECT
  (item->>'step')::int        AS step,
  item->>'status'              AS status,
  item->>'test_name'           AS test_name,
  item->>'detail'              AS detail
FROM jsonb_array_elements(current_setting('test.results')::jsonb) AS item
ORDER BY (item->>'step')::int;

-- ROLLBACK xóa user giả + profile + transactions
ROLLBACK;
