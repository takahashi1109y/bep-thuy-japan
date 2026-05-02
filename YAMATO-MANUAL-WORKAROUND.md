# YAMATO MANUAL WORKAROUND — Đêm nay anh tự chạy

**Tạo:** 2026-05-02
**Lý do:** Apps Script `saveYamato` vừa fix bug nhưng chưa redeploy. Anh cần in nhãn Yamato Cool tối nay nên export thẳng từ Supabase.

**Ước lượng thời gian:** 15–30 phút từ SQL → in nhãn xong.

---

## 0. CHUẨN BỊ — 30 GIÂY

Mở 3 tab:

1. Supabase SQL: https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
2. Yamato B2クラウド: https://bmypage.kuronekoyamato.co.jp/bmypage/pc/b2w/login
   *(Hoặc landing: https://www.kuronekoyamato.co.jp/ytc/business/send/services/b2cloud/)*
3. Admin Bếp Thuỷ (backup nếu CSV upload lỗi): https://www.thuyjapan.com/thuythang

---

## 1. CHẠY SQL EXPORT (BƯỚC CHÍNH)

### 1.1. Paste vào SQL Editor

```sql
-- Yamato B2クラウド export — orders 3 ngày gần nhất, trạng thái chưa giao
-- Date: 2026-05-02
-- Format: 95 columns nhưng SQL chỉ trả 15 cột Yamato YÊU CẦU + cột raw để check

with src as (
  select
    order_no,
    customer_name,
    customer_phone,
    ship_postal,
    ship_prefecture,
    ship_address,
    ship_mailbox,
    coalesce(note, '') as note,
    coalesce(delivery_time, '0812') as delivery_time,
    items,
    status,
    created_at
  from public.orders
  where status in ('confirmed', 'shipped', 'pending')   -- nếu có status 'customer_paid' thì thêm vào
    and created_at >= (now() at time zone 'Asia/Tokyo')::date - interval '3 days'
  order by created_at desc
),
formatted as (
  select
    order_no,
    -- Postal: 7 chữ số -> XXX-XXXX
    case
      when length(regexp_replace(ship_postal, '[^0-9]', '', 'g')) >= 7
      then substr(regexp_replace(ship_postal, '[^0-9]', '', 'g'), 1, 3)
           || '-' ||
           substr(regexp_replace(ship_postal, '[^0-9]', '', 'g'), 4, 4)
      else ship_postal
    end as postal_fmt,

    -- Phone: 0901234... -> 090-1234-5678 (xử lý cả +81)
    case
      when length(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g')) = 12
       and substr(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g'), 1, 2) = '81'
      then '0' || substr(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g'), 3, 2)
           || '-' || substr(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g'), 5, 4)
           || '-' || substr(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g'), 9, 4)
      when length(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g')) = 11
      then substr(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g'), 1, 3)
           || '-' || substr(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g'), 4, 4)
           || '-' || substr(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g'), 8, 4)
      when length(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g')) = 10
      then substr(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g'), 1, 3)
           || '-' || substr(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g'), 4, 3)
           || '-' || substr(regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g'), 7, 4)
      else customer_phone
    end as phone_fmt,

    -- Địa chỉ ghép: prefecture + address (Yamato cột L tối đa 32 ký tự)
    coalesce(ship_prefecture, '') || coalesce(ship_address, '') as full_address,
    coalesce(ship_mailbox, '') as mailbox,
    note,
    delivery_time,
    customer_name,
    items,
    status,
    created_at
  from src
)
select
  -- ====== 15 cột Yamato B2クラウド (đúng thứ tự upload CSV) ======
  order_no                                          as "お客様管理番号",          -- A: STT
  '0'                                               as "送り状種別",              -- B: 0=người gửi trả
  '2'                                               as "クール区分",              -- C: 2=lạnh (reizo)
  to_char((now() at time zone 'Asia/Tokyo')::date, 'YYYY/MM/DD')
                                                    as "出荷予定日",              -- E: ngày xuất
  to_char((now() at time zone 'Asia/Tokyo')::date + 1, 'YYYY/MM/DD')
                                                    as "お届け予定日",            -- F: ngày giao (E+1)
  delivery_time                                     as "配達時間帯",              -- G: khung giờ
  phone_fmt                                         as "受取人電話番号",          -- I
  postal_fmt                                        as "受取人郵便番号",          -- K
  substr(full_address, 1, 32)                       as "受取人住所1",             -- L: 32 ký tự đầu
  case
    when length(full_address) <= 32
    then substr(mailbox, 1, 32)
    else substr(substr(full_address, 33) ||
                case when mailbox <> '' then ' ' || mailbox else '' end, 1, 32)
  end                                               as "受取人住所2",             -- M
  case
    when length(full_address) <= 32
    then substr(mailbox, 33, 32)
    else substr(substr(full_address, 33) ||
                case when mailbox <> '' then ' ' || mailbox else '' end, 33, 32)
  end                                               as "受取人住所3",             -- N
  order_no || '---' || coalesce(customer_name, '')  as "受取人氏名",              -- P
  '090-4237-6886'                                   as "ご依頼主電話番号",        -- T: SDT người gửi
  '270-0034'                                        as "ご依頼主郵便番号",        -- V
  '千葉県松戸市新松戸6-118-2'                       as "ご依頼主住所",            -- W
  'Hong Thuy JP'                                    as "ご依頼主氏名",            -- Y

  -- Build product summary (đơn giản: liệt kê tên + qty từ items jsonb)
  -- Nếu cần format chính xác như Apps Script ("1g 0.5gkt 2nem"), anh sửa tay sau khi mở Excel
  (
    select string_agg(
      coalesce(item->>'name', '') || ' x' || coalesce(item->>'qty', '1'),
      ' / '
    )
    from jsonb_array_elements(items) as item
  )                                                 as "品名1",                  -- AB
  'Ware mono chui'                                  as "ワレ物注意",              -- AG: hàng dễ vỡ
  '2'                                               as "個数",                    -- AM: số kiện = 2
  '090423768881'                                    as "請求先顧客コード",        -- AN: mã thanh toán
  '01'                                              as "運賃管理番号",            -- AP

  -- ====== Cột phụ để anh check khi mở Excel (KHÔNG upload Yamato) ======
  status                                            as "_status",
  to_char(created_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI')
                                                    as "_created_jst",
  customer_name                                     as "_customer_raw",
  full_address                                      as "_full_addr_raw"
from formatted;
```

### 1.2. Click **Run** (hoặc Ctrl+Enter)

→ Kết quả hiện ở panel dưới. Đếm số dòng = số đơn cần ship.

### 1.3. Download CSV

- Click nút **Download CSV** ở góc phải kết quả.
- File lưu vào `Downloads/`. Tên kiểu `MyQuery....csv`.
- Đổi tên cho dễ tìm: `yamato-2026-05-02.csv`.

---

## 2. MỞ CSV TRONG EXCEL → KIỂM TRA

### 2.1. Mở file

Double-click → Excel mở. **Cẩn thận:** Excel hay tự ăn số 0 đầu của postal code → cột postal phải hiện `270-0034` chứ không phải `270-34`. Nếu mất số 0:

- Cách fix: trong Excel, **Data → From Text/CSV** → chọn cột postal là **Text**.
- Hoặc mở bằng Google Sheets (an toàn hơn) → File → Import → Upload CSV.

### 2.2. Check 4 cột phụ (cuối bảng)

- `_status`: chỉ giữ đơn `confirmed` hoặc đơn anh đã gói.
- `_customer_raw`, `_full_addr_raw`: đối chiếu nhanh với admin nếu nghi sai.
- **XÓA 4 CỘT PHỤ TRƯỚC KHI UPLOAD YAMATO** (cột bắt đầu bằng `_`).

### 2.3. Sửa cột "品名1" nếu cần

SQL chỉ build chuỗi đơn giản (`Giò Có Tiêu x1 / Nem Lụi x2`). Nếu Yamato cần định dạng `"1g 0.5gkt 2nem"` như Apps Script làm — anh sửa tay từng dòng (5–10 đơn thì nhanh).

Hoặc bỏ qua, Yamato vẫn in được nhãn vì 品名 chỉ để ghi chú.

### 2.4. Save lại

- **Save As** → định dạng **CSV UTF-8 (.csv)** *(KHÔNG phải CSV thường)*.
- Hoặc **Tab-delimited (.txt)** nếu Yamato yêu cầu TSV.

---

## 3. UPLOAD LÊN YAMATO B2クラウド

### 3.1. Đăng nhập

URL: https://bmypage.kuronekoyamato.co.jp/bmypage/pc/b2w/login

→ Nhập tài khoản B2 của shop (anh nhớ user/pass — nếu quên xem trong password manager).

### 3.2. Vào menu Import

Trên thanh menu chọn:
**送り状発行 → CSV取込 (Import CSV)**

Hoặc menu: **データ取込 → 送り状データ取込**.

### 3.3. Chọn file

- Click **ファイル選択** → chọn `yamato-2026-05-02.csv`.
- Format: **B2クラウド標準フォーマット** (95 cột) → CSV của anh CHỈ có 19 cột nên bước này có thể báo warning. Cách xử:
  - **Option A:** Yamato cho phép map cột → click **項目マッピング** → kéo thả từng cột match với tên 受取人郵便番号, 受取人住所 v.v.
  - **Option B:** Nếu Yamato yêu cầu đủ 95 cột → mở file CSV trong Excel, **chèn cột rỗng** vào đúng vị trí (xem map dưới):

| Excel col | Yamato col | Nội dung |
|-----------|-----------|----------|
| A | お客様管理番号 (1) | order_no |
| B | 送り状種別 (2) | 0 |
| C | クール区分 (3) | 2 |
| D | (trống) | |
| E | 出荷予定日 (5) | today |
| F | お届け予定日 (6) | tomorrow |
| G | 配達時間帯 (7) | 0812 |
| H | (trống) | |
| I | 受取人電話番号 (9) | phone |
| J | (trống) | |
| K | 受取人郵便番号 (11) | postal |
| L | 受取人住所1 (12) | addr 32 chars |
| M | 受取人住所2 (13) | addr overflow |
| N | 受取人住所3 (14) | mailbox |
| O | (trống) | |
| P | 受取人氏名 (16) | order_no---name |
| Q-S | (trống) | |
| T | ご依頼主電話 (20) | 090-4237-6886 |
| U | (trống) | |
| V | ご依頼主郵便 (22) | 270-0034 |
| W | ご依頼主住所 (23) | 千葉県松戸市... |
| X | (trống) | |
| Y | ご依頼主氏名 (25) | Hong Thuy JP |
| Z-AA | (trống) | |
| AB | 品名1 (28) | product summary |
| AC-AF | (trống) | |
| AG | ワレ物注意 (33) | Ware mono chui |
| AH-AL | (trống) | |
| AM | 個数 (39) | 2 |
| AN | 請求先 (40) | 090423768881 |
| AO | (trống) | |
| AP | 運賃管理 (42) | 01 |

### 3.4. Validation

- Yamato sẽ chạy validate → màn hình hiện danh sách lỗi (nếu có).
- Lỗi thường gặp:
  - **郵便番号エラー**: postal sai format → check lại cột K.
  - **住所が長すぎる**: địa chỉ quá 32 ký tự → cắt bớt sang cột M/N.
  - **電話番号エラー**: phone sai → format `090-1234-5678`.
- Sửa trên giao diện Yamato luôn (click cell → edit) hoặc về Excel sửa rồi upload lại.

### 3.5. Phát hành nhãn

- Validate OK → click **送り状発行 (Print labels)**.
- Chọn máy in nhãn (Brother QL-820 hoặc gì anh đang dùng) → in.

---

## 4. PLAN B — NHẬP TAY (NẾU CSV UPLOAD CỨ LỖI)

Nếu sau 3 lần upload vẫn lỗi → bỏ CSV, gõ tay nhanh:

1. Mở admin: https://www.thuyjapan.com/thuythang
2. Lọc đơn `confirmed` 3 ngày gần nhất.
3. Trên Yamato B2クラウド: **送り状発行 → 1件入力** (single entry).
4. Mỗi đơn: copy postal/địa chỉ/tên/SDT từ admin → paste vào Yamato → save.

Tốc độ: ~1 phút/đơn. Nếu < 15 đơn thì gõ tay vẫn nhanh hơn debug CSV.

**Mẹo:** Để 2 cửa sổ cạnh nhau (admin trái, Yamato phải) → copy nhanh không phải switch tab.

Các thông tin cố định (anh khỏi gõ lại):
- **Người gửi tên:** Hong Thuy JP
- **SDT người gửi:** 090-4237-6886
- **Postal người gửi:** 270-0034
- **Địa chỉ người gửi:** 千葉県松戸市新松戸6-118-2
- **Số kiện:** 2
- **Cool:** 冷蔵 (lạnh)
- **Hàng dễ vỡ:** ✓ (Ware mono chui)
- **Mã thanh toán:** 090423768881

---

## 5. SAU KHI APPS SCRIPT REDEPLOY — RECOVERY

Tối nay xong nhãn → mai sau khi anh redeploy Apps Script (đã fix bug saveYamato):

1. Mở Apps Script Editor.
2. Chạy hàm: **`backfillYamatoOrders`**.
   *(Nếu chưa có hàm này, em viết riêng cho anh — nhắn em ngày mai.)*
3. Hàm sẽ:
   - Đọc tất cả orders từ Supabase (status = `confirmed`/`shipped`).
   - Gọi `saveYamato()` cho từng đơn còn thiếu trong sheet Yamato.
   - Skip những đơn anh đã in tay tối nay (check theo `order_no` đã tồn tại trong sheet).
4. Sheet Yamato khớp lại 100% với thực tế → tracking + email tự động hoạt động bình thường.

**Quan trọng:** Nhớ ghi lại danh sách `order_no` đã in tay tối nay (có sẵn trong CSV cột A) — phòng khi backfill bị trùng dòng.

---

## 6. CHECKLIST NHANH

- [ ] Mở Supabase SQL Editor
- [ ] Paste SQL ở mục 1.1 → Run
- [ ] Download CSV
- [ ] Mở Excel → check postal/phone/address
- [ ] Xóa 4 cột `_status, _created_jst, _customer_raw, _full_addr_raw`
- [ ] Save as CSV UTF-8
- [ ] Login Yamato B2クラウド
- [ ] Import CSV → map columns nếu cần
- [ ] Validate → fix lỗi
- [ ] Print labels
- [ ] Ghi chép `order_no` đã in (cho backfill mai)
- [ ] Apps Script redeploy → run `backfillYamatoOrders`

---

**Hỏi em nếu kẹt bước nào — em đang on.**
