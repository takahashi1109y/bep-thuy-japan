# Customer Migration — Phone Format Update (2026-05-03)

> **⚠️ Note 2026-05-03 chiều**: File này dành cho khách có phone **format SAI** (vd `090-1234-5678` có dấu) bị auto-backfill set NULL.
>
> **NẾU khách bị clear phone do DUPLICATE** (1 phone dùng 2 email), xem file riêng: [`CUSTOMER-OUTREACH-DUPLICATE-PHONE.md`](./CUSTOMER-OUTREACH-DUPLICATE-PHONE.md). Lý do clear khác → message khác.
>
> **Anh mở file nào?**
> - Khách có `phone_original` chứa dấu `-`/space → dùng FILE NÀY
> - Khách có `reason='duplicate_phone'` (từ table `_phone_dup_backup_2026_05_03`) → dùng FILE OUTREACH

> **Mục đích**: Hướng dẫn anh nhắc khách có phone format sai cập nhật về 11 digits chuẩn
> **Trigger**: Sau khi anh chạy `supabase-phone-backfill.sql` Block 6 export CSV
> **Audience**: Khách hàng có phone bị set NULL (data không cứu được tự động)

---

## Scope (số liệu sau backfill)

Anh check Block 6 output:

- Nếu **0 rows**: Tất cả khách đều normalize OK, KHÔNG cần migration plan. Đóng tab này, anh đi uống cà phê ạ.
- Nếu **>0 rows**: làm theo plan dưới. Số rows = số khách anh cần liên hệ.

Cách chạy Block 6:
1. Mở Supabase Dashboard → SQL Editor
2. Mở file `supabase-phone-backfill.sql` → copy Block 6 (phần `-- BLOCK 6: EXPORT CSV LIST`)
3. Run → output xuất ra ở panel kết quả
4. Click nút **Download CSV** ở góc phải bảng kết quả → save file `phone-needs-update.csv`

CSV file sẽ có các cột:
- `id` (UUID khách — anh không cần action)
- `email` (gửi email vào đây)
- `customer_code` (vd `KH-001` — để track)
- `display_name` (tên khách)
- `phone_original` (phone cũ format sai — để anh tham khảo)
- `created_at` (ngày khách đăng ký)

---

## Email Template (gửi qua GetResponse hoặc Gmail)

### Subject
```
[Bếp Thuỷ Japan] Nhờ anh/chị cập nhật số điện thoại để đăng nhập được ạ
```

### Body (HTML / plain text)

```
Chào anh/chị [Tên khách],

Em là Thuỷ — Bếp Thuỷ Japan. Em viết email này để nhờ anh/chị cập nhật lại số điện thoại
trong tài khoản giúp em ạ.

Lý do:
Bên em vừa cập nhật hệ thống đăng nhập bằng số điện thoại. Số của anh/chị đăng ký
lúc trước có format hơi khác (vd có dấu "-" hoặc dấu "+81"), bây giờ hệ thống cần
format chuẩn JP: 11 số viết liền nhau, vd 09012345678.

Cách cập nhật (1 phút):

1. Đăng nhập vào https://www.thuyjapan.com/thanh-vien bằng email [email_khach]
2. Click tab "Hồ sơ" (Profile)
3. Tìm ô "Số Điện Thoại" → nhập lại theo format chuẩn: 11 số liền nhau
   (vd 09012345678 — KHÔNG có dấu gạch ngang, KHÔNG có +81)
4. Click "Lưu"

Sau đó anh/chị có thể đăng nhập bằng SĐT thay vì email cho tiện ạ.

Em xin lỗi vì sự bất tiện. Có gì thắc mắc, anh/chị nhắn em qua Zalo: 080-5115-6688

Cảm ơn anh/chị nhiều!
Bếp Thuỷ Japan
```

### HTML version (cho GetResponse)

```html
<p>Chào anh/chị <strong>[Tên khách]</strong>,</p>

<p>Em là Thuỷ — Bếp Thuỷ Japan. Em viết email này để nhờ anh/chị cập nhật lại số điện thoại trong tài khoản giúp em ạ.</p>

<p><strong>Lý do</strong>: Bên em vừa cập nhật hệ thống đăng nhập bằng số điện thoại. Số của anh/chị đăng ký lúc trước có format hơi khác (vd có dấu <code>-</code> hoặc dấu <code>+81</code>), bây giờ hệ thống cần format chuẩn JP: <strong>11 số viết liền nhau</strong>, vd <code>09012345678</code>.</p>

<p><strong>Cách cập nhật</strong> (1 phút):</p>

<ol>
  <li>Đăng nhập vào <a href="https://www.thuyjapan.com/thanh-vien">thuyjapan.com/thanh-vien</a> bằng email <strong>[email_khach]</strong></li>
  <li>Click tab <strong>"Hồ sơ"</strong> (Profile)</li>
  <li>Tìm ô <strong>Số Điện Thoại</strong> → nhập lại theo format chuẩn: 11 số liền nhau (vd <code>09012345678</code>)</li>
  <li>Click <strong>Lưu</strong></li>
</ol>

<p>Sau đó anh/chị có thể đăng nhập bằng SĐT thay vì email cho tiện ạ.</p>

<p>Em xin lỗi vì sự bất tiện. Có gì thắc mắc, anh/chị nhắn em qua Zalo: <strong>080-5115-6688</strong></p>

<p>Cảm ơn anh/chị!<br>
<em>Bếp Thuỷ Japan</em></p>
```

---

## Zalo Template (cá nhân hơn, cho khách thân)

```
Anh/chị [Tên] ơi,

Em Thuỷ đây ạ. Em vừa update hệ thống thuyjapan.com mới — cho phép đăng nhập bằng SĐT
(không cần nhớ email nữa).

Nhưng số của anh/chị lưu trong hệ thống có dấu "-" ở giữa nên em phải reset lại.
Anh/chị bớt 1 phút giúp em:

1. Vào thuyjapan.com/thanh-vien
2. Đăng nhập bằng email
3. Tab Hồ sơ → Số ĐT → nhập lại 11 số liền nhau (vd 09012345678)
4. Lưu lại

Sau đó anh/chị đăng nhập bằng SĐT cho nhanh ạ. Em xin lỗi nha!

— Thuỷ
```

### Variation (cho khách quen lâu năm)

```
Chị [Tên] ơi, em Thuỷ đây ^^

Em vừa nâng cấp web thuyjapan.com cho đăng nhập bằng SĐT, nhưng số chị lưu
trong hệ thống có dấu cách / dấu gạch nên em chưa convert tự động được.

Chị giúp em 1 phút nha:
- Vào thuyjapan.com/thanh-vien
- Login email cũ
- Tab Hồ sơ → sửa SĐT → 11 số liền (vd 09012345678) → Lưu

Xong chị login bằng SĐT cho nhanh. Em cảm ơn chị nhiều ạ!
```

---

## Workflow gửi email/Zalo (anh làm)

### Bước 1: Lấy danh sách khách

1. Anh chạy `supabase-phone-backfill.sql` Block 6 → download CSV
2. Mở Excel/Google Sheets → file CSV có cột: `email`, `customer_code`, `display_name`, `phone_original`, `created_at`
3. Sort by `created_at` DESC (khách mới ưu tiên hơn — họ active hơn, dễ phản hồi)
4. Lọc tách 2 nhóm:
   - **Nhóm A — Khách thân** (anh nhận diện qua tên/code): gửi Zalo cá nhân
   - **Nhóm B — Khách lạ/lâu rồi**: gửi email batch

### Bước 2: Email batch (Nhóm B) qua GetResponse

1. Login GetResponse → Contacts → **Add contacts** → **Import from file**
2. Upload CSV `phone-needs-update.csv`
3. Map columns: `email` → Email, `display_name` → Name, `customer_code` → Custom field
4. Tạo list mới tên: `phone-needs-update-2026-05-03`
5. **Email Marketing** → **Create newsletter** → paste HTML template ở trên
6. Replace placeholders:
   - `[Tên khách]` → `[[name]]` (GetResponse syntax)
   - `[email_khach]` → `[[email]]`
7. Test gửi cho chính email anh trước → kiểm tra render OK
8. **Send to list** `phone-needs-update-2026-05-03`
9. Schedule: gửi 9-10h sáng JP time (giờ khách đọc email cao nhất)

### Bước 3: Zalo cá nhân (Nhóm A)

1. Mở file CSV → tạo cột mới `zalo_message` = paste template Zalo
2. Replace `[Tên]` thủ công cho từng khách
3. Mở Zalo PC → tìm khách theo SĐT cũ (anh có thể có số khách trong contact riêng)
4. Copy-paste message → gửi
5. Đánh dấu cột "Đã gửi Zalo" = ✓ trong sheet

### Bước 4: Track response

Tạo Google Sheet mới tên `phone-migration-tracking-2026-05-03` với các cột:

| email | display_name | customer_code | Channel (Email/Zalo) | Đã gửi (date) | Khách phản hồi (Y/N) | Đã update DB (Y/N) | Ghi chú |
|-------|--------------|---------------|----------------------|---------------|----------------------|---------------------|---------|

Update sheet này mỗi ngày trong tuần đầu.

---

## Success criteria

### KPI 7 ngày sau khi gửi

- **Target**: 80% khách trong CSV cập nhật phone trong vòng 7 ngày
- **Cách đo**: chạy SQL query bên dưới mỗi ngày, ghi % vào tracking sheet

### Query check progress

```sql
-- Đếm % khách đã update phone (so với tổng khách bị NULL sau backfill)
WITH backfill_null AS (
  SELECT id 
  FROM public._phone_backfill_backup_2026_05_03 
  WHERE phone_new IS NULL
),
updated_now AS (
  SELECT p.id 
  FROM public.profiles p
  INNER JOIN backfill_null b ON b.id = p.id
  WHERE p.phone IS NOT NULL
)
SELECT 
  (SELECT count(*) FROM updated_now) AS updated_count,
  (SELECT count(*) FROM backfill_null) AS total_count,
  ROUND(
    100.0 * (SELECT count(*) FROM updated_now) / NULLIF((SELECT count(*) FROM backfill_null), 0),
    1
  ) AS percent_updated;
```

Output mẫu:
```
updated_count | total_count | percent_updated
--------------+-------------+-----------------
           34 |          42 |            81.0
```

→ 81% > 80% target. Pass.

### Query xem khách CHƯA update (để follow up)

```sql
SELECT p.email, p.display_name, p.customer_code, b.phone_original
FROM public._phone_backfill_backup_2026_05_03 b
INNER JOIN public.profiles p ON p.id = b.id
WHERE b.phone_new IS NULL 
  AND p.phone IS NULL
ORDER BY p.created_at DESC;
```

→ Đây là list khách cần follow up round 2.

---

## Sau 30 ngày — Cleanup

Khách CHƯA update phone (vẫn NULL trong `profiles`) → anh cân nhắc 2 option:

### Option A — Email round 2 (khuyên dùng)

Gửi email nhắc lần 2 với template variation (subject khác, ngắn gọn hơn):

```
Subject: [Bếp Thuỷ Japan] Nhắc nhẹ — cập nhật SĐT để login nhanh hơn ạ

Chào anh/chị,

Em Thuỷ đây ạ. Cách đây 30 ngày em có gửi email nhờ anh/chị cập nhật SĐT
trong tài khoản thuyjapan.com — em check lại thấy anh/chị chưa làm.

Nếu anh/chị bận, không sao ạ — anh/chị vẫn login bằng email được bình thường.
Nhưng nếu muốn login nhanh bằng SĐT, anh/chị bớt 1 phút:

→ thuyjapan.com/thanh-vien → Hồ sơ → SĐT → 11 số liền (vd 09012345678) → Lưu

Cảm ơn anh/chị!
— Thuỷ
```

### Option B — Accept phone NULL (chấp nhận)

Khách đăng nhập bằng email vẫn OK, không bắt buộc phone. Skip follow up, không làm gì.

→ Em recommend Option A vì retention tốt hơn — khách thấy mình care.

### Cleanup backup table

Sau 30-60 ngày khi đã chắc chắn không cần rollback nữa:

```sql
-- Drop backup table để clean DB
DROP TABLE public._phone_backfill_backup_2026_05_03;

-- Verify đã drop
SELECT tablename FROM pg_tables WHERE tablename LIKE '_phone_backfill_backup%';
-- Output: 0 rows
```

---

## Checklist tổng

- [ ] Day 0 — Chạy Block 6, download CSV, đếm số khách
- [ ] Day 0 — Tách CSV thành Nhóm A (Zalo) + Nhóm B (Email)
- [ ] Day 0 — Tạo tracking sheet trên Google Sheet
- [ ] Day 1 — Gửi email batch qua GetResponse (Nhóm B)
- [ ] Day 1-3 — Gửi Zalo cá nhân (Nhóm A)
- [ ] Day 3 — Check % update lần 1 (kỳ vọng 40-50%)
- [ ] Day 7 — Check % update lần 2 (target 80%+)
- [ ] Day 30 — Email round 2 cho khách chưa update
- [ ] Day 60 — DROP backup table

---

> **Note cho em (Claude)**: file này chỉ surface khi anh chạy Block 6 và thấy >0 rows. Nếu Block 6 = 0 rows thì xoá file này hoặc note "Migration không cần thiết — backfill normalize 100%". Khi anh hỏi về phone migration, link tới file này.
