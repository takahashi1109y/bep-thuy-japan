# 📞 Customer Outreach — Duplicate Phone Cleared (2026-05-03)

> **Mục đích**: Hướng dẫn anh nhắc khách bị clear phone do trùng với account khác cập nhật lại
> **Trigger**: Sau khi anh chạy `supabase-phone-resolve-duplicates.sql` Block 4 export CSV
> **Audience**: Khách hàng có phone bị set NULL do duplicate (~8 khách thật, không tính test accounts)

---

## 📊 Scope dự kiến

Anh check Block 4 output:

- Tổng accounts cleared: ~18 (gồm test accounts)
- Cần liên hệ thật: chỉ ~8 (4 phones × 2 khách)
- KH dùng phone của anh `09012345678` (test): ignore
- KH dùng phone test `08012345678`: ignore

**Breakdown 5 phones bị clear**:

| Phone | Số accounts | Loại | Action |
|---|---|---|---|
| `09012345678` | 9 | Test (anh's accounts) | Skip |
| `08012345678` | 3 | Test accounts | Skip |
| `08016417132` | 2 | KH thật ("Ly") | Liên hệ |
| `07042204406` | 2 | KH thật ("Khánh Chi" + "Thanh Tâm") | Liên hệ — có thể vợ chồng |
| `09020911794` | 2 | KH thật ("NGUYỄN THỊ KHUYÊN") | Liên hệ |

---

## 📝 Email Template (gửi qua GetResponse)

### Subject

```
[Bếp Thuỷ Japan] Nhờ anh/chị cập nhật lại số điện thoại để đăng nhập được ạ 💝
```

### Body (HTML)

```html
[Tên khách],

Em là Thuỷ — Bếp Thuỷ Japan. Em viết email này để báo anh/chị một thay đổi nhỏ cần action ạ.

🔍 **Vấn đề**: Số điện thoại [PHONE_CŨ] của anh/chị đã được dùng để đăng ký 2 tài khoản khác nhau (1 phone không thể dùng cho 2 email). Để hệ thống bảo mật hơn, em đã tạm xoá số đt khỏi tài khoản của anh/chị.

✅ **Giải pháp**: Anh/chị vẫn đăng nhập bình thường bằng **email** — và bây giờ chỉ cần cập nhật lại số đt mới (riêng của anh/chị, không bị trùng):

📲 **Cách cập nhật** (1 phút):

1. Đăng nhập vào https://www.thuyjapan.com/thanh-vien bằng email [email_khach]
2. Hệ thống sẽ tự động hỏi anh/chị nhập số đt → nhập theo format chuẩn JP: **11 số viết liền nhau** (vd 09012345678)
3. Click **Lưu**

✅ Sau đó anh/chị có thể đăng nhập bằng số đt thay vì email cho tiện ạ.

Em xin lỗi vì sự bất tiện. Có gì thắc mắc, anh/chị nhắn em qua Zalo: 080-5115-6688

Cảm ơn anh/chị!
Bếp Thuỷ Japan 💝
```

---

## 📱 Zalo Template

### Standard (cho khách thân)

```
Anh/chị [Tên] ơi 👋

Em Thuỷ — Bếp Thuỷ Japan. Em vừa update hệ thống nên cần nhờ anh/chị 1 việc nhỏ:

Số đt [PHONE] của anh/chị đang được 2 tài khoản khác nhau dùng → em phải xoá số ở tài khoản của anh/chị để đảm bảo bảo mật.

Anh/chị bớt 1 phút giúp em:
1. Vào thuyjapan.com/thanh-vien → đăng nhập bằng email
2. Hệ thống sẽ tự động hỏi nhập số đt mới → nhập 11 số liền nhau (vd 09012345678)
3. Lưu lại

Sau đó đăng nhập bằng số đt cho nhanh ạ. Em xin lỗi 💝

— Thuỷ
```

### Variation (case 2 KH thật share phone, vd vợ chồng)

Nếu anh thấy 2 tên rất khác nhau (vd `07042204406` "Khánh Chi" + "Thanh Tâm"), có thể là vợ chồng/người thân share phone:

```
Chị [Tên] ơi 👋

Em Thuỷ. Em xem trên hệ thống thấy số đt [PHONE] đang được 2 tài khoản dùng — em đoán là 2 vợ chồng/bạn dùng chung phone đăng ký?

Để hệ thống tracking đơn riêng cho mỗi người, mỗi tài khoản cần 1 số đt riêng. Em đã tạm xoá phone khỏi tài khoản của chị → chị vui lòng:

1. Đăng nhập thuyjapan.com/thanh-vien bằng email [email]
2. Nhập số đt mới (riêng của chị) → 11 số liền nhau
3. Lưu

Hoặc nếu chị không có số riêng, đăng nhập bằng email cũng OK ạ — không bắt buộc phải có phone.

Em xin lỗi vì bất tiện 💝

— Thuỷ
```

---

## 📋 Workflow gửi (anh làm)

### Bước 1: Lấy CSV

Anh chạy Block 4 file `supabase-phone-resolve-duplicates.sql` → Download CSV.

CSV sẽ có columns:
- `id` (uuid)
- `email`
- `full_name`
- `phone_old` (số đt cũ bị xoá)
- `cleared_at` (timestamp)

### Bước 2: Phân loại CSV

Mở Excel/Google Sheets, thêm cột **"loại"**:

| email | tên | phone_cũ | loại |
|---|---|---|---|
| (anh's email) | Test | `09012345678` | **Test (skip)** |
| ... | ... | `08012345678` | **Test (skip)** |
| ly@... | Ly | `08016417132` | **Cần liên hệ** |
| khanhchi@... | Khánh Chi | `07042204406` | **Cần liên hệ — vợ chồng?** |
| thanhtam@... | Thanh Tâm | `07042204406` | **Cần liên hệ — vợ chồng?** |
| ... | NGUYỄN THỊ KHUYÊN | `09020911794` | **Cần liên hệ** |

**Filter loại "Cần liên hệ"** → còn lại 8 khách thật.

**Đặc biệt** `07042204406` (Khánh Chi + Thanh Tâm) → dùng template Variation.

### Bước 3: Gửi email/Zalo

- **Email blast** qua GetResponse cho khách thường:
  1. Vào GetResponse → Create Newsletter
  2. Paste subject + body HTML ở trên
  3. Replace `[Tên khách]`, `[PHONE_CŨ]`, `[email_khach]` bằng merge tags `{{NAME}}`, etc.
  4. Tạo segment "duplicate phone cleared" từ CSV → import emails
  5. Send

- **Zalo cá nhân** cho khách thân (KH đã có lịch sử nhắn Zalo trực tiếp):
  - Copy template Standard hoặc Variation
  - Replace `[Tên]`, `[PHONE]`, `[email]`
  - Gửi 1-1

### Bước 4: Track

Tạo Google Sheet tracking:

| email | tên | phone_cũ | đã gửi | đã update | ngày update |
|---|---|---|---|---|---|
| ly@... | Ly | `08016417132` | 2026-05-03 | ✅ | 2026-05-04 |
| khanhchi@... | Khánh Chi | `07042204406` | 2026-05-03 |  |  |
| thanhtam@... | Thanh Tâm | `07042204406` | 2026-05-03 | ✅ | 2026-05-05 |
| ... | NGUYỄN THỊ KHUYÊN | `09020911794` | 2026-05-03 |  |  |

Mỗi tuần check column "đã update" — verify bằng SQL ở dưới.

---

## 🎯 Success criteria

- **Target**: 80% khách (≥6/8 KH thật) update trong 7 ngày
- **Verify SQL**:

```sql
SELECT count(*) AS so_KH_da_update
FROM public._phone_dup_backup_2026_05_03 b
JOIN public.profiles p ON p.id = b.id
WHERE p.phone IS NOT NULL;
```

Kết quả mong muốn: ≥ 6 (trong số 8 KH thật).

---

## 📌 Sau 30 ngày

- KH chưa update → email round 2 (nhắc lại) hoặc accept (login bằng email vẫn OK, không bắt buộc phone)
- DROP backup table sau 60 ngày:

```sql
DROP TABLE public._phone_dup_backup_2026_05_03;
```

---

## 📎 Liên quan

- File SQL chính: `K:\bep-thuy-japan\supabase-phone-resolve-duplicates.sql`
- File outreach context khác (phone format SAI, không phải duplicate): `K:\bep-thuy-japan\CUSTOMER-MIGRATION-PHONE-FORMAT.md`
- Frontend modal prompt update phone: đã có sẵn ở `/thanh-vien` page (auto-trigger khi `phone IS NULL`)
