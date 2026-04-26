# 🤖 Setup AI Receipt Verification — Google Vision

App đã có sẵn code. Anh chỉ cần làm **3 bước** dưới đây để kích hoạt.

---

## ✅ Bước 1: Tạo Google Cloud project + bật Vision API (5 phút)

1. Vào https://console.cloud.google.com → đăng nhập bằng Gmail
2. Bấm dropdown **"Select a project"** ở top → **NEW PROJECT**
   - Project name: `BepThuyJapan-AI`
   - Bấm **Create**
3. Đợi ~30s, chọn project vừa tạo
4. Vào **APIs & Services → Library** (sidebar trái)
5. Search **"Cloud Vision API"** → click → bấm **ENABLE**
6. Sau khi enable xong, bấm **APIs & Services → Credentials** (sidebar)
7. Bấm **+ CREATE CREDENTIALS → API Key**
8. Pop-up hiện ra với key dạng `AIzaSyC_xxxxxxxxxxxxxxxxxxx` → **COPY** lưu lại
9. (Tuỳ chọn nhưng khuyến nghị) Bấm **RESTRICT KEY** → **API restrictions** → chỉ cho phép **Cloud Vision API** → Save

⚠️ **Free tier:** 1000 ảnh/tháng — không tốn tiền. Vượt quá thì $1.50/1000 ảnh.

---

## ✅ Bước 2: Run SQL migration (1 phút)

Vào https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new

Paste + Run:

```sql
ALTER TABLE public.payment_confirmations
  ADD COLUMN IF NOT EXISTS ai_verified_amount integer,
  ADD COLUMN IF NOT EXISTS ai_match boolean,
  ADD COLUMN IF NOT EXISTS ai_reason text,
  ADD COLUMN IF NOT EXISTS ai_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_raw_text text,
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(3,2);

CREATE INDEX IF NOT EXISTS idx_payment_conf_ai_match
  ON public.payment_confirmations (ai_match) WHERE ai_match IS NOT NULL;
```

---

## ✅ Bước 3: Add API key vào Apps Script + redeploy (3 phút)

1. Mở https://script.google.com → tìm project Bếp Thuỷ Japan của anh
2. Click **⚙️ Project Settings** (sidebar)
3. Scroll xuống **Script Properties** → bấm **Add script property**
   - Property: `GOOGLE_VISION_KEY`
   - Value: paste API key từ Bước 1
   - Bấm **Save**
4. Quay lại tab **Editor** (icon code `< >`)
5. Bấm **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**
6. Done!

---

## 🧪 Cách test

1. Đăng nhập app/web bằng tài khoản test → đặt 1 đơn nhỏ
2. Upload biên lai PayPay/bank → nhấn Gửi
3. Mở admin dashboard https://www.thuyjapan.com/thuythang
4. Vào Đơn Hàng → click vào đơn vừa tạo → modal mở
5. Sau **~5-10 giây** sẽ thấy badge AI hiện:
   - 🟢 **AI: ✅ KHỚP** nếu số tiền đúng
   - 🔴 **AI: 🔴 LỆCH SỐ TIỀN** nếu số khác
   - 🟡 **AI: ⚠️ KHÔNG ĐỌC ĐƯỢC** nếu ảnh mờ

Nếu không thấy badge sau 30s, bấm nút **🤖 Xác thực AI** ở dưới (manual trigger).

---

## 📊 Logs để debug

Trong Apps Script editor → **Executions** (sidebar) → xem log của hàm `verifyReceiptWithAI_`. Có thể thấy:
- `AI verified conf #123: {match: true, detected: 12500}` → OK
- `Vision API: 403 ...` → API key sai / chưa enable Vision
- `Image fetch failed: 403` → Supabase signed URL hết hạn (1 năm — hiếm gặp)

---

## 💰 Chi phí dự kiến

| Khối lượng | Chi phí/tháng |
|---|---|
| ≤ 1000 đơn (≤ 33/ngày) | **$0 (free tier)** |
| 2000 đơn | $1.50 |
| 5000 đơn | $6 |
| 10000 đơn | $13.50 |

Bep Thuy hiện tại ~50 đơn/ngày = ~1500/tháng → ~$0.75/tháng.

Anh setup xong báo em test cùng nhau!
