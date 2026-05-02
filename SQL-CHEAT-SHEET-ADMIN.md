# 🍱 Bếp Thuỷ Japan — SQL Cheat Sheet cho Admin

> **Dành cho anh Thắng** — chạy báo cáo và thao tác nhanh trên Supabase.
> **Mở SQL Editor:** https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
> **Cách dùng:** copy query → dán vào SQL Editor → bấm **Run** (hoặc Ctrl+Enter).

---

## 📋 Schema rút gọn (em nhắc lại để anh tiện tra cứu)

| Bảng | Cột chính |
|------|-----------|
| `orders` | `order_no`, `user_id`, `customer_name/email/phone`, `ship_prefecture/postal/address`, `items` (jsonb), `subtotal/shipping_fee/total`, `points_used/earned`, `status`, `note`, `created_at`, `shipped_at` |
| `profiles` | `id` (= auth.users.id), `display_name`, `phone`, `prefecture`, `postal`, `address`, `gender`, `birthday`, `customer_code`, `inactive_discount_percent`, `inactive_discount_expires_at` |
| `payment_confirmations` | `order_no`, `user_id`, `method`, `claimed_amount`, `screenshot_url/hash`, `status` ('submitted'/'verified'/'rejected'), `ai_*` |
| `points_transactions` | `user_id`, `order_no`, `points`, `type` ('earn'/'spend'), `description`, `created_at` |
| `points_balance` | `user_id`, `total_points` |
| `message_threads` / `messages` | hệ thống chat khách ↔ shop |
| `admin_users` | `user_id`, `role` |
| `product_catalog` | `id`, `code`, `name`, `unit_label`, `unit_price`, `cost`, `stock_quantity`, `stock_unit`, `low_stock_threshold`, `is_active` |

**Trạng thái đơn (status):** `pending` → `customer_paid` → `confirmed` → `shipped` → `delivered` | `cancelled`

---

## 📊 1. Báo cáo theo ngày / tuần

### 1.1 Đơn hôm nay (số đơn + tổng doanh thu)
```sql
select
  count(*)                                           as so_don,
  count(*) filter (where status <> 'cancelled')      as so_don_hop_le,
  coalesce(sum(total) filter (where status <> 'cancelled'), 0) as doanh_thu_yen
from public.orders
where created_at >= (now() at time zone 'Asia/Tokyo')::date
  and created_at <  (now() at time zone 'Asia/Tokyo')::date + interval '1 day';
```
> Trả về 1 dòng: tổng số đơn, số đơn không bị hủy, doanh thu (¥) hôm nay theo giờ Nhật.
> 💡 Tip: đổi `(now() at time zone 'Asia/Tokyo')::date` thành `'2026-05-01'::date` để xem ngày bất kỳ.

### 1.2 Đơn 7 ngày gần nhất, tách theo trạng thái
```sql
select
  date_trunc('day', created_at at time zone 'Asia/Tokyo')::date as ngay,
  count(*) filter (where status = 'pending')        as cho_xu_ly,
  count(*) filter (where status = 'customer_paid')  as khach_da_chuyen,
  count(*) filter (where status = 'confirmed')      as da_xac_nhan,
  count(*) filter (where status = 'shipped')        as da_gui,
  count(*) filter (where status = 'delivered')      as da_giao,
  count(*) filter (where status = 'cancelled')      as huy,
  count(*)                                          as tong,
  coalesce(sum(total) filter (where status <> 'cancelled'), 0) as doanh_thu
from public.orders
where created_at >= now() - interval '7 days'
group by 1
order by 1 desc;
```
> Mỗi dòng = 1 ngày. Đếm đơn theo từng trạng thái + doanh thu hợp lệ.
> 💡 Tip: đổi `7 days` thành `30 days` cho 30 ngày, hoặc `14 days` cho 2 tuần.

### 1.3 Top khách chi nhiều nhất (30 ngày qua)
```sql
select
  customer_name,
  customer_email,
  customer_phone,
  count(*)                       as so_don,
  sum(total)                     as tong_chi_yen,
  round(avg(total))              as trung_binh_don
from public.orders
where status <> 'cancelled'
  and created_at >= now() - interval '30 days'
group by customer_name, customer_email, customer_phone
order by tong_chi_yen desc
limit 20;
```
> 20 khách chi nhiều nhất 30 ngày qua, kèm số đơn + giá trị TB.
> 💡 Tip: đổi `30 days` thành `90 days` xem khách quý quý 3 tháng.

### 1.4 Sản phẩm bán chạy tuần này (gộp từ items jsonb)
```sql
select
  item->>'name'                                          as san_pham,
  item->>'size'                                          as size,
  sum((item->>'qty')::int)                               as tong_so_luong,
  sum((item->>'qty')::int * (item->>'price')::int)       as tong_doanh_thu_yen
from public.orders,
     jsonb_array_elements(items) as item
where status <> 'cancelled'
  and created_at >= now() - interval '7 days'
group by 1, 2
order by tong_so_luong desc;
```
> Mỗi dòng = 1 sản phẩm + size, kèm tổng số lượng + doanh thu trong 7 ngày.
> 💡 Tip: đổi `7 days` thành `30 days` để xem cả tháng.

### 1.5 Khách quay lại vs khách mới (30 ngày qua)
```sql
with khach_30d as (
  select customer_email,
         min(created_at) as lan_dau_30d,
         count(*)        as so_don_30d
  from public.orders
  where status <> 'cancelled'
    and created_at >= now() - interval '30 days'
    and customer_email is not null
    and customer_email <> ''
  group by customer_email
)
select
  case
    when exists (
      select 1 from public.orders o2
      where o2.customer_email = k.customer_email
        and o2.created_at < now() - interval '30 days'
        and o2.status <> 'cancelled'
    ) then 'khach_cu_quay_lai'
    else 'khach_moi'
  end                                as loai,
  count(*)                           as so_khach,
  sum(so_don_30d)                    as tong_so_don
from khach_30d k
group by 1;
```
> 2 dòng: số khách mới + tổng đơn từ họ, vs số khách cũ quay lại.
> 💡 Tip: đổi `30 days` thành mốc khác (60/90 ngày) tùy phân tích.

---

## 💰 2. Tài chính

### 2.1 Doanh thu theo tháng (12 tháng gần nhất)
```sql
select
  to_char(date_trunc('month', created_at at time zone 'Asia/Tokyo'), 'YYYY-MM') as thang,
  count(*) filter (where status <> 'cancelled')                                  as so_don,
  sum(total) filter (where status <> 'cancelled')                                as doanh_thu_yen,
  sum(shipping_fee) filter (where status <> 'cancelled')                         as phi_ship,
  sum(total - shipping_fee) filter (where status <> 'cancelled')                 as doanh_thu_thuan
from public.orders
where created_at >= now() - interval '12 months'
group by 1
order by 1 desc;
```
> Mỗi dòng = 1 tháng. Doanh thu thuần = tổng - phí ship.

### 2.2 Giá trị đơn trung bình (AOV) theo tháng
```sql
select
  to_char(date_trunc('month', created_at at time zone 'Asia/Tokyo'), 'YYYY-MM') as thang,
  count(*)                          as so_don,
  round(avg(total))                 as gia_tri_don_tb,
  min(total)                        as don_nho_nhat,
  max(total)                        as don_lon_nhat
from public.orders
where status <> 'cancelled'
  and created_at >= now() - interval '12 months'
group by 1
order by 1 desc;
```
> AOV (Average Order Value) — thấy được khách có chi nhiều hơn theo thời gian không.

### 2.3 Ước tính lợi nhuận theo sản phẩm (dùng cost trong product_catalog)
```sql
with sp_ban as (
  select
    item->>'name'                            as ten_sp,
    sum((item->>'qty')::int)                 as so_luong_ban,
    sum((item->>'qty')::int * (item->>'price')::int) as doanh_thu
  from public.orders,
       jsonb_array_elements(items) as item
  where status <> 'cancelled'
    and created_at >= now() - interval '30 days'
  group by 1
)
select
  s.ten_sp,
  s.so_luong_ban,
  s.doanh_thu                              as doanh_thu_yen,
  c.cost                                   as gia_von_moi_unit,
  s.so_luong_ban * coalesce(c.cost, 0)     as tong_gia_von,
  s.doanh_thu - s.so_luong_ban * coalesce(c.cost, 0) as loi_nhuan_uoc_tinh
from sp_ban s
left join public.product_catalog c on c.name = s.ten_sp
order by loi_nhuan_uoc_tinh desc nulls last;
```
> Lợi nhuận = doanh thu - (số lượng × giá vốn). Cần anh nhập `cost` trong `product_catalog` trước.
> ⚠️ Match theo `name` — nếu tên sản phẩm trong cart khác với catalog thì cost sẽ NULL.

### 2.4 Danh sách đơn bị hủy / hoàn (chi tiết)
```sql
select
  order_no,
  created_at::timestamp(0)        as ngay_dat,
  customer_name,
  customer_phone,
  total                            as so_tien_yen,
  points_used                      as diem_da_dung,
  note                             as ghi_chu_huy
from public.orders
where status = 'cancelled'
  and created_at >= now() - interval '30 days'
order by created_at desc;
```
> Đơn bị hủy 30 ngày qua. `note` thường có chữ `[HỦY BỞI KHÁCH]` hoặc `[HỦY BỞI SHOP]` + lý do.
> 💡 Tip: đổi `30 days` thành `7 days` xem trong tuần.

---

## 👥 3. Truy vấn khách hàng

### 3.1 Tất cả khách + email + ngày tạo
```sql
select
  p.customer_code,
  p.display_name,
  u.email,
  p.phone,
  p.prefecture,
  u.created_at::date              as ngay_dang_ky,
  u.last_sign_in_at::date         as lan_cuoi_dang_nhap
from public.profiles p
inner join auth.users u on u.id = p.id
order by u.created_at desc;
```
> Toàn bộ khách đã đăng ký thành viên. Chú ý: khách đặt hàng guest (không có user_id) KHÔNG có ở đây — query 4.1 mới ra họ.

### 3.2 Khách lâu chưa mua (60+ ngày — để win-back)
```sql
select
  p.customer_code,
  p.display_name,
  u.email,
  p.phone,
  p.prefecture,
  max(o.created_at)::date        as don_gan_nhat,
  (now()::date - max(o.created_at)::date) as so_ngay_im_lang,
  count(o.*)                     as tong_don_da_dat,
  coalesce(sum(o.total), 0)      as tong_chi_yen
from public.profiles p
inner join auth.users u on u.id = p.id
left join public.orders o on o.user_id = p.id and o.status <> 'cancelled'
group by p.customer_code, p.display_name, u.email, p.phone, p.prefecture
having max(o.created_at) < now() - interval '60 days'
   and max(o.created_at) is not null
order by so_ngay_im_lang desc;
```
> Khách từng mua nhưng 60 ngày chưa quay lại. Sắp xếp im lặng lâu nhất lên đầu.
> 💡 Tip: đổi `60 days` thành `30 days` (mới im) hoặc `90 days` (im lâu).

### 3.3 Khách VIP (≥ 10 đơn HOẶC ≥ ¥30,000 tổng chi)
```sql
select
  p.customer_code,
  p.display_name,
  u.email,
  p.phone,
  p.prefecture,
  count(o.*)                     as so_don,
  sum(o.total)                   as tong_chi_yen,
  max(o.created_at)::date        as don_gan_nhat
from public.profiles p
inner join auth.users u on u.id = p.id
inner join public.orders o on o.user_id = p.id and o.status <> 'cancelled'
group by p.customer_code, p.display_name, u.email, p.phone, p.prefecture
having count(o.*) >= 10 or sum(o.total) >= 30000
order by tong_chi_yen desc;
```
> Khách quý — anh có thể tặng quà / ưu đãi riêng cho nhóm này.
> 💡 Tip: đổi ngưỡng `10` đơn / `30000` ¥ tùy ý.

### 3.4 Sinh nhật trong tháng này
```sql
select
  p.display_name,
  u.email,
  p.phone,
  p.birthday,
  to_char(p.birthday, 'DD/MM')   as ngay_thang,
  extract(day from p.birthday)::int as ngay
from public.profiles p
inner join auth.users u on u.id = p.id
where p.birthday is not null
  and extract(month from p.birthday) = extract(month from (now() at time zone 'Asia/Tokyo'))
order by extract(day from p.birthday);
```
> Khách có sinh nhật trong tháng hiện tại. Sắp theo ngày tăng dần.
> 💡 Tip: đổi `extract(month from now()...)` thành số tháng cố định, ví dụ `= 5` để xem tháng 5.

---

## 📦 4. Thao tác đơn hàng

### 4.1 Tìm đơn theo tên khách (gần đúng)
```sql
select
  order_no,
  created_at::timestamp(0)       as ngay_dat,
  customer_name,
  customer_phone,
  customer_email,
  total                          as tien,
  status
from public.orders
where customer_name ilike '%thang%'
   or recipient_name ilike '%thang%'
order by created_at desc
limit 30;
```
> Đổi `thang` thành phần tên cần tìm. `ilike` không phân biệt hoa/thường, có dấu/không dấu thì cần đúng.
> 💡 Tip: tìm theo email — đổi `customer_name` thành `customer_email`.

### 4.2 Tìm đơn theo 4 số cuối SĐT
```sql
select
  order_no,
  created_at::timestamp(0)       as ngay_dat,
  customer_name,
  customer_phone,
  recipient_name,
  recipient_phone,
  total,
  status
from public.orders
where customer_phone like '%1234'
   or recipient_phone like '%1234'
order by created_at desc
limit 20;
```
> Đổi `1234` thành 4 số cuối thực tế. Tìm cả phone của người đặt và người nhận.

### 4.3 Reset đơn `customer_paid` về `pending` (khi AI verify nhầm)
```sql
-- BƯỚC 1: KIỂM TRA TRƯỚC khi update — copy order_no muốn reset
select order_no, customer_name, total, status, created_at
from public.orders
where order_no = 'BTH-XXXX';

-- BƯỚC 2: thực hiện reset (chạy riêng dòng này)
update public.orders
   set status = 'pending',
       note   = coalesce(note, '') || ' [RESET ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ']'
 where order_no = 'BTH-XXXX'
   and status = 'customer_paid';
```
> Đổi `'BTH-XXXX'` thành mã đơn thực. **Luôn chạy bước 1 trước** để check.
> ⚠️ Chỉ reset khi anh chắc AI verify nhầm. Sau đó vào tab admin xác nhận lại thủ công.

### 4.4 Hủy đơn pending cũ hơn 7 ngày (khách bùng đơn)
```sql
-- BƯỚC 1: XEM TRƯỚC danh sách sẽ bị hủy
select order_no, customer_name, customer_phone, total, created_at::date as ngay
from public.orders
where status = 'pending'
  and created_at < now() - interval '7 days'
order by created_at;

-- BƯỚC 2: thực hiện hủy hàng loạt (chạy riêng nếu OK với danh sách trên)
update public.orders
   set status = 'cancelled',
       note   = coalesce(note, '') || ' [HỦY BỞI SHOP: tự động — quá 7 ngày không thanh toán]'
 where status = 'pending'
   and created_at < now() - interval '7 days';
```
> Đơn pending quá 7 ngày = khách đặt rồi không chuyển khoản. Em khuyên anh xem bước 1 trước.
> 💡 Tip: đổi `7 days` thành `3 days` nếu muốn nghiêm hơn.

---

## 📧 5. Phân khúc danh sách email

### 5.1 Khách active để gửi newsletter (đã verify email)
```sql
select
  u.email,
  p.display_name,
  p.phone,
  p.prefecture,
  p.customer_code
from public.profiles p
inner join auth.users u on u.id = p.id
where u.email is not null
  and u.email_confirmed_at is not null
  and u.banned_until is null
order by u.created_at desc;
```
> Tất cả khách đã đăng ký + verify email + chưa bị ban. Dùng cho newsletter.
> ℹ️ Hệ thống hiện chưa có cột `unsubscribed` — nếu cần em thêm sau.

### 5.2 Khách im lặng 30 / 60 / 90 ngày (gom 3 nhóm)
```sql
with last_order as (
  select user_id, max(created_at) as don_cuoi
  from public.orders
  where status <> 'cancelled'
  group by user_id
)
select
  u.email,
  p.display_name,
  p.phone,
  l.don_cuoi::date as don_gan_nhat,
  case
    when l.don_cuoi < now() - interval '90 days' then 'im_90_ngay'
    when l.don_cuoi < now() - interval '60 days' then 'im_60_ngay'
    when l.don_cuoi < now() - interval '30 days' then 'im_30_ngay'
  end as nhom
from public.profiles p
inner join auth.users u on u.id = p.id
inner join last_order l on l.user_id = p.id
where l.don_cuoi < now() - interval '30 days'
order by l.don_cuoi;
```
> 3 phân khúc trong 1 query. Anh filter cột `nhom` trong CSV xuất ra để chia nhóm.

### 5.3 Khách mới mua 7 ngày qua (gửi cảm ơn / xin review)
```sql
select distinct
  o.customer_email                as email,
  o.customer_name                 as ten,
  o.customer_phone                as sdt,
  max(o.created_at)::date         as don_moi_nhat,
  count(o.*)                      as so_don_7_ngay
from public.orders o
where o.status <> 'cancelled'
  and o.created_at >= now() - interval '7 days'
  and o.customer_email is not null
  and o.customer_email <> ''
group by o.customer_email, o.customer_name, o.customer_phone
order by don_moi_nhat desc;
```
> Khách mua trong tuần — gửi email cảm ơn / xin feedback. Bao gồm cả khách guest.

### 5.4 Khách theo tỉnh thành cụ thể
```sql
select
  u.email,
  p.display_name,
  p.phone,
  p.prefecture,
  p.address
from public.profiles p
inner join auth.users u on u.id = p.id
where p.prefecture = 'Tokyo'
order by p.display_name;
```
> Đổi `'Tokyo'` thành tỉnh khác: `'Osaka'`, `'Saitama'`, `'Aichi'`, `'Kanagawa'`, ...
> 💡 Tip: muốn nhiều tỉnh — đổi thành `where p.prefecture in ('Tokyo','Saitama','Chiba')`.

---

## 🏪 6. Tồn kho

### 6.1 Tồn kho hiện tại của tất cả sản phẩm
```sql
select
  id,
  code,
  name,
  unit_label,
  unit_price                          as gia_ban,
  cost                                as gia_von,
  stock_quantity                      as ton_kho,
  stock_unit                          as don_vi,
  low_stock_threshold                 as nguong_canh_bao,
  is_active                           as dang_ban,
  updated_at::timestamp(0)            as cap_nhat
from public.product_catalog
order by display_order;
```
> Toàn bộ catalog. Cột `is_active=false` là sản phẩm đã ẩn khỏi web.

### 6.2 Sản phẩm sắp hết hàng (≤ ngưỡng cảnh báo)
```sql
select
  code,
  name,
  stock_quantity                      as con_lai,
  stock_unit                          as don_vi,
  low_stock_threshold                 as nguong,
  case
    when stock_quantity <= 0 then 'HET_HANG'
    when stock_quantity <= low_stock_threshold then 'SAP_HET'
  end                                 as canh_bao
from public.product_catalog
where is_active = true
  and stock_quantity <= low_stock_threshold
order by stock_quantity;
```
> Em cảnh báo những món sắp hết / hết — lên kế hoạch nhập / làm thêm.

### 6.3 Tốc độ bán theo sản phẩm (kg/túi/hộp 30 ngày qua)
```sql
select
  item->>'name'                                          as san_pham,
  sum((item->>'qty')::numeric)                           as tong_da_ban,
  round(sum((item->>'qty')::numeric) / 30, 2)            as tb_moi_ngay,
  round(sum((item->>'qty')::numeric) / 30 * 7, 1)        as du_kien_tuan_toi
from public.orders,
     jsonb_array_elements(items) as item
where status <> 'cancelled'
  and created_at >= now() - interval '30 days'
group by 1
order by tong_da_ban desc;
```
> Tốc độ bán + dự đoán tuần tới (giả định nhu cầu giữ nguyên). Match theo tên trong cart.
> 💡 Tip: đổi `30` (chia trung bình) cho khớp với `30 days` ở `where`.

### 6.4 Sản phẩm hết hàng (cần nhập gấp)
```sql
select
  code,
  name,
  stock_quantity      as ton,
  stock_unit          as don_vi,
  is_active           as dang_ban
from public.product_catalog
where stock_quantity <= 0
order by name;
```
> Danh sách trắng đen — cần nhập / làm bù ngay. Bao gồm cả sản phẩm đã ẩn.

---

## 🛠 7. Bảo trì

### 7.1 Đơn không có user_id (đơn guest — khách không đăng ký)
```sql
select
  order_no,
  created_at::date    as ngay,
  customer_name,
  customer_email,
  customer_phone,
  total,
  status
from public.orders
where user_id is null
order by created_at desc
limit 100;
```
> Đơn của khách guest — không tích điểm được. Anh có thể email mời họ đăng ký để nhận điểm.

### 7.2 Email trùng (nhiều profile cùng 1 email)
```sql
select
  u.email,
  count(*)                                as so_account,
  string_agg(p.display_name, ' | ')       as ten_cac_account,
  string_agg(p.customer_code, ', ')       as ma_kh
from public.profiles p
inner join auth.users u on u.id = p.id
where u.email is not null
group by u.email
having count(*) > 1
order by so_account desc;
```
> Phát hiện khách đăng ký 2+ lần cùng email (nếu hệ thống có lỗ hổng). Bình thường nên rỗng.

### 7.3 Backup — dump toàn bộ orders (export ra CSV qua nút Download trong SQL Editor)
```sql
select
  order_no,
  to_char(created_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as ngay_dat,
  customer_name, customer_email, customer_phone,
  recipient_name, recipient_phone,
  ship_prefecture, ship_postal, ship_address, ship_mailbox,
  subtotal, shipping_fee, total,
  points_used, points_earned, points_awarded,
  status,
  note,
  delivery_time,
  items::text                                                        as items_json,
  to_char(shipped_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as ngay_gui
from public.orders
order by created_at;
```
> Sau khi chạy, bấm nút **Download CSV** ở Supabase SQL Editor (góc phải bảng kết quả).
> 💡 Tip: thêm `where created_at >= '2026-01-01'` nếu chỉ muốn dump 1 năm gần đây.

### 7.4 Payment_confirmations mồ côi (không có order tương ứng)
```sql
select
  pc.id,
  pc.order_no,
  pc.created_at::date,
  pc.method,
  pc.claimed_amount,
  pc.status                              as trang_thai_pc
from public.payment_confirmations pc
left join public.orders o on o.order_no = pc.order_no
where o.order_no is null
order by pc.created_at desc;
```
> Bản thân FK đã ngăn case này, nhưng nếu DELETE CASCADE chạy không sạch — query này phát hiện được.
> ℹ️ Bình thường rỗng. Nếu có dữ liệu — báo em xử lý giúp.

---

## 💡 Bonus — vài query em hay dùng

### 99.1 Số dư điểm hiện tại của một khách
```sql
select
  p.display_name,
  u.email,
  pb.total_points     as diem_hien_co
from public.profiles p
inner join auth.users u on u.id = p.id
left join public.points_balance pb on pb.user_id = p.id
where u.email = 'email@khach.com';
```
> Đổi email cần tra. Trả về số điểm hiện tại của khách.

### 99.2 Đơn chưa được tích điểm (đã ship nhưng `points_awarded=false`)
```sql
select order_no, customer_name, total, points_earned, shipped_at::date
from public.orders
where status in ('shipped','delivered')
  and user_id is not null
  and points_awarded = false
order by shipped_at desc;
```
> Phát hiện đơn bị "lủng" — đã gửi nhưng quên cộng điểm cho khách.

### 99.3 Tin nhắn shop chưa đọc
```sql
select
  t.id                            as thread_id,
  p.display_name,
  u.email,
  t.subject,
  t.last_message_at::timestamp(0) as moi_nhat,
  (select body from public.messages m
     where m.thread_id = t.id and m.sender = 'customer'
     order by m.created_at desc limit 1) as tin_cuoi_cua_khach
from public.message_threads t
inner join public.profiles p on p.id = t.user_id
inner join auth.users u on u.id = t.user_id
where t.unread_by_shop = true
  and t.status = 'open'
order by t.last_message_at desc;
```
> Tin khách gửi mà shop chưa trả lời. Anh trả lời xong tin nhắn auto reset cờ.

---

## ⚠️ Lưu ý an toàn cho anh

1. **`SELECT` luôn an toàn** — không sửa data, anh chạy thoải mái.
2. **`UPDATE` / `DELETE` em đã chèn bước check trước** — anh nhớ chạy bước 1 (xem) rồi mới chạy bước 2 (sửa).
3. **Không bao giờ gõ `DELETE FROM orders;`** thiếu `WHERE` — sẽ xóa toàn bộ đơn. Tương tự với `UPDATE`.
4. **Múi giờ:** tất cả `created_at` lưu UTC. Em đã thêm `at time zone 'Asia/Tokyo'` ở những query cần hiển thị giờ Nhật.
5. **Backup trước khi sửa lớn:** chạy query 7.3 dump CSV trước khi làm thao tác hủy hàng loạt.

---

*File này em sẽ bổ sung thêm khi anh có nhu cầu báo cáo mới. Anh cần thêm query nào — nhắn em.* 🍱
