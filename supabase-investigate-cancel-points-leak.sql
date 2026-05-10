-- ============================================================
-- INVESTIGATE: Cancel order van cong diem
-- ============================================================
-- Tim orders status='cancelled' nhung VAN co points_transactions
-- type='earn' linked voi no → diem leak
-- ============================================================

-- Q1: Cancelled orders co points_awarded=true
SELECT 'Q1_CANCELLED_AWARDED' AS test,
       order_no,
       status,
       total,
       points_earned,
       points_awarded,
       points_used,
       user_id,
       cancel_reason,
       created_at::date,
       (SELECT email FROM auth.users WHERE id = orders.user_id) AS email
FROM public.orders
WHERE status = 'cancelled'
  AND points_awarded = true
ORDER BY created_at DESC
LIMIT 20;

-- Q2: Cancelled orders nhung VAN co points_transactions earn linked
SELECT 'Q2_LEAK_CHECK' AS test,
       o.order_no,
       o.status,
       o.points_earned AS expected_earn,
       o.points_awarded,
       pt.points AS actual_pt_earn,
       pt.created_at AS pt_date,
       pt.description
FROM public.orders o
JOIN public.points_transactions pt ON pt.order_no = o.order_no AND pt.type = 'earn'
WHERE o.status = 'cancelled'
  AND pt.points > 0  -- only earn transactions, not refunds
ORDER BY pt.created_at DESC
LIMIT 20;

-- Q3: Tong diem leak (sum cua tat ca earn linked voi cancelled orders)
SELECT 'Q3_TOTAL_LEAK' AS test,
       COUNT(DISTINCT o.order_no) AS num_cancelled_orders_with_earn,
       SUM(pt.points) AS total_leaked_points
FROM public.orders o
JOIN public.points_transactions pt ON pt.order_no = o.order_no AND pt.type = 'earn'
WHERE o.status = 'cancelled'
  AND pt.points > 0;

-- Q4: Anh's orders cancelled gan day (test orders)
SELECT 'Q4_TAKAHASHI_TEST' AS test,
       o.order_no,
       o.status,
       o.total,
       o.points_earned,
       o.points_awarded,
       (SELECT COALESCE(SUM(points), 0) FROM public.points_transactions
         WHERE order_no = o.order_no AND type = 'earn') AS earn_total,
       o.created_at::date
FROM public.orders o
WHERE o.user_id = (SELECT id FROM auth.users WHERE email = 'thanghoang1109@gmail.com')
  AND o.status = 'cancelled'
ORDER BY o.created_at DESC
LIMIT 20;
