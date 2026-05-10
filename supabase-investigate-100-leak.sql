-- ============================================================
-- DEEP DIVE: 2 orders 0187 + 0188 bi cong 100 diem
-- ============================================================

-- Q1: Detail cua tat ca points_transactions cua 2 orders nay
SELECT
  pt.id,
  pt.user_id,
  pt.order_no,
  pt.order_total,
  pt.points,
  pt.type,
  pt.description,
  pt.created_at
FROM public.points_transactions pt
WHERE pt.order_no IN ('0187', '0188')
ORDER BY pt.created_at DESC;

-- Q2: Tat ca welcome transactions cua thanghoang1109
SELECT
  id,
  order_no,
  points,
  type,
  description,
  created_at
FROM public.points_transactions
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'thanghoang1109@gmail.com')
  AND type = 'welcome'
ORDER BY created_at DESC;

-- Q3: Tat ca transactions cua anh (de hieu balance 623 tu dau)
SELECT
  id,
  order_no,
  points,
  type,
  description,
  created_at::date
FROM public.points_transactions
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'thanghoang1109@gmail.com')
ORDER BY created_at DESC
LIMIT 30;

-- Q4: Tong balance theo type
SELECT type, SUM(points) AS sum_pts, COUNT(*) AS num_tx
FROM public.points_transactions
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'thanghoang1109@gmail.com')
GROUP BY type;
