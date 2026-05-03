# 🧪 BƯỚC 5: Test End-to-End (15-20 phút)

> 🎯 **Mục đích**: Verify toàn bộ flow Option B (pay-first checkout + 2-step verify + manual approve + image display + tracking modal) hoạt động đúng sau khi 4 bước infrastructure đã xong.
> ⏱️ **Thời gian**: ~15-20 phút (test 6 cases)

---

## ✅ Pre-flight checklist

Trước khi test, ĐẢM BẢO 4 bước infrastructure đã xong:

- [ ] **BƯỚC 1**: Storage bucket `payment-proofs` đã Public ✅
- [ ] **BƯỚC 2**: SQL `supabase-2-step-verify.sql` đã chạy ✅
- [ ] **BƯỚC 3**: SQL `supabase-manual-approve-payment.sql` đã chạy ✅
- [ ] **BƯỚC 4**: Apps Script đã redeploy (commit mới nhất) ✅

> ❌ Nếu thiếu 1 trong 4 → các test sau sẽ fail. Quay lại fix bước infra trước rồi mới test.

---

## 🧪 Test Case 1: Option B Pay-First Flow (5 phút)

**Mục tiêu**: Khách upload biên lai → AI verify 8 layers → đơn tự động sang `customer_paid` → khách thấy "Đặt hàng thành công"

### Setup
- Mở Chrome **incognito** (tránh dùng session admin)
- Vào https://www.thuyjapan.com
- Login bằng tài khoản KHÁCH (không phải admin)

### Steps
1. Thêm 1-2 sản phẩm vào giỏ
2. Click giỏ hàng → Checkout
3. Điền thông tin nhận hàng
4. Đến **payment-section** (step thanh toán)
5. Chọn PayPay → quét QR → trả 1 yên test (hoặc copy 1 biên lai PayPay đã save trước)
6. Upload screenshot biên lai vào ô upload
7. Đợi 5-15 giây cho AI verify

### ✅ Expected
- Hiện thông báo "Đang xác thực..." → "Xác thực thành công"
- Tự redirect sang trang `order-success` với mã đơn hàng
- Vào /thanh-vien → đơn vừa đặt hiện trên cùng với badge **"Đã thanh toán"**

### ❌ Nếu fail
| Triệu chứng | Nguyên nhân chính |
|---|---|
| Click "Đặt hàng" không phản ứng | BƯỚC 4 — Apps Script chưa redeploy |
| Báo "RPC verify_then_create_order not found" | BƯỚC 4 — Apps Script cũ |
| AI verify timeout | Network chậm hoặc Vision API quota cạn |

---

## 🧪 Test Case 2: AI Fail → Manual Review (5 phút)

**Mục tiêu**: Bill cố tình sai → AI từ chối → khách bấm "Gửi để admin xem xét thủ công" → đơn ở status `pending_manual_review`

### Setup (giả lập bill sai)
- Vẫn ở incognito tài khoản khách
- Tạo đơn mới
- Khi đến payment-section, upload **biên lai cố tình sai**:
  - Dùng ảnh PayPay cũ (Layer 6 Date sẽ fail)
  - Hoặc PNG bị edit Photoshop (Layer 8 sẽ fail)
  - Hoặc amount sai 1 yên (Layer 1 fail)

### Steps
1. Upload bill sai → đợi AI verify
2. Hiện thông báo đỏ + reason cụ thể (vd: "Bill có vẻ là giao dịch CŨ")
3. **Anh sẽ thấy** button **"Gửi để admin xem xét thủ công"**
4. Click button đó

### ✅ Expected
- Đơn được tạo với status `pending_manual_review`
- Hiện thông báo "Admin sẽ xem xét đơn của anh trong vài giờ"
- Vào /thanh-vien → đơn hiện với status **"Chờ admin duyệt"**

### Verify ở admin
- Vào /thuythang (tab khác, login admin)
- Tab **Đơn Hàng** → có sub-tab mới **"🚨 Cần xem xét"** với badge đỏ "1"
- Click sub-tab → thấy đơn vừa đặt
- Click vào đơn → modal mở → **thấy ảnh biên lai** (verify image hiển thị)
- Có 2 button: **"✅ Xác nhận lần 2"** + **"❌ Reject"**

### ❌ Nếu fail
| Triệu chứng | Nguyên nhân |
|---|---|
| Không có button "Gửi admin" | BƯỚC 4 — Apps Script chưa redeploy |
| Sub-tab "Cần xem xét" không hiện | BƯỚC 2 — SQL 2-step-verify chưa chạy |
| Click đơn không thấy ảnh | BƯỚC 1 — Storage chưa public |

---

## 🧪 Test Case 3: Admin Manual Approve (3 phút)

**Mục tiêu**: Admin override AI → đơn flip sang `customer_paid` → audit log ghi nhận

### Steps
1. Trong /thuythang → sub-tab "Cần xem xét" → click đơn từ TC2
2. Modal mở → thấy ảnh biên lai + 2 button
3. Click **"✅ Xác nhận lần 2"**
4. Modal mới mở: **"Manual Override"**
5. Chọn reason từ dropdown (vd: "Bill thật, AI fail oan") hoặc gõ tay
6. Click **"Xác nhận"**

### ✅ Expected
- Toast notification "Đã xác nhận thanh toán"
- Modal đóng
- Đơn rời sub-tab "Cần xem xét" → về sub-tab "Đã trả tiền"
- Status = `customer_paid` hoặc `confirmed`

### Verify trong DB (optional)
SQL Editor → New query:
```sql
SELECT order_no, status, manual_approver, manual_approve_reason, manual_approved_at
FROM payment_confirmations
JOIN orders USING (order_no)
ORDER BY manual_approved_at DESC NULLS LAST
LIMIT 5;
```
→ Phải thấy đơn vừa duyệt với 3 cột manual_* được fill.

### Verify audit log
```sql
SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 5;
```
→ Phải thấy entry mới với action `manual_approve_payment`.

### ❌ Nếu fail
| Triệu chứng | Nguyên nhân |
|---|---|
| Click "Xác nhận lần 2" báo 404 | BƯỚC 2 — SQL chưa chạy (RPC `admin_confirm_payment` không tồn tại) |
| Status không flip | BƯỚC 3 — SQL manual-approve chưa chạy |
| Audit log rỗng | BƯỚC 2 — bảng `admin_audit_log` chưa tạo |

---

## 🧪 Test Case 4: Image Display (2 phút)

**Mục tiêu**: Verify ảnh biên lai hiển thị OK trong admin modal (không 403, lightbox click mở to được)

### Steps
1. /thuythang → tab Đơn Hàng → sub-tab "Đã trả tiền"
2. Click 1 đơn bất kỳ có biên lai
3. Modal mở → cuộn xuống phần "Biên lai thanh toán"

### ✅ Expected
- Ảnh hiển thị đầy đủ, không broken icon
- Click vào ảnh → mở lightbox/tab mới → ảnh load OK
- Network tab (F12 → Network) → request `payment-proofs` trả status **200**

### ❌ Nếu fail
| Triệu chứng | Nguyên nhân |
|---|---|
| Ảnh hiện broken icon | BƯỚC 1 — Storage chưa public |
| Network 403 | BƯỚC 1 — public toggle OFF |
| Network 404 | URL trong DB sai (đơn cũ trước khi fix code) |
| Image OK cho đơn mới, fail cho đơn cũ | Đúng rồi, đơn cũ không fix được nữa |

---

## 🧪 Test Case 5: Tracking Modal (2 phút)

**Mục tiêu**: Khách click "Tình trạng vận chuyển" trên /thanh-vien → modal hiện events đúng

### Steps
1. Login /thanh-vien (tài khoản khách)
2. Tìm 1 đơn đã ship (có Yamato tracking number)
3. Click button **"📍 Tình trạng vận chuyển"**

### ✅ Expected
- Modal mở → hiện list events từ Yamato (Tokyo出発 → 配達中 → 配達完了)
- Mỗi event có timestamp + location

### Test phụ
- Click button trên đơn CHƯA ship
- **Anh sẽ thấy**: modal hiện thông báo "Đơn chưa được giao cho đơn vị vận chuyển"

### ❌ Nếu fail
- Đây không phải lỗi anh — code em viết. Báo em fix.

---

## 🧪 Test Case 6: Header Member Page (1 phút)

**Mục tiêu**: Verify UI mới (compact header, "Bạn có X điểm" 1.5x bên phải tên)

### Steps
1. Vào /thanh-vien (login khách)
2. Nhìn header

### ✅ Expected
- Header gọn (KHÔNG có vòng tròn 256px chiếm chỗ)
- Tên anh ở trái, font ~18px
- **"Bạn có X điểm"** ở bên phải, font ~27px (gấp 1.5x tên)
- Order list hiện ngay bên dưới, không phải scroll xuống mới thấy

### ❌ Nếu fail
- Lỗi CSS em viết, báo em fix.

---

## 📊 Sau khi tất cả 6 test PASS

🎉 **Chúc mừng anh!** Toàn bộ Option B + 2-step verify + manual approve đã LIVE production.

### Việc anh nên làm tiếp
1. Update `pending_thuyjapan_action_items.md`:
   - ✅ P1.1 Redeploy Apps Script
   - ✅ P1.2 Run SQL 2-step verify
   - ✅ P1.3 Run SQL manual approve
   - ✅ P1.4 Storage bucket public
2. Tự thưởng cốc cafe ☕ hoặc tô phở 🍜
3. Báo em "test xong rồi" để em update memory

### Phase tiếp theo (anh chọn)
- 🟢 **PayPay for Business** application (1.98% fee, 100% bullet-proof verify)
- 🟢 **TPCN site** Shopify launch
- 🟢 **iOS app** Team ID + TestFlight
- 🟢 **Phase C inventory**: thêm sản phẩm mới dynamic
- 🟢 **Email 4-5-6** auto-trigger từ Apps Script

---

## 🆘 Tổng hợp: Map fail → bước infra cần check

| Test fail | Nguyên nhân chính |
|---|---|
| TC1 không đặt hàng được | BƯỚC 4 — Apps Script chưa redeploy |
| TC2 không có button "Gửi admin" | BƯỚC 4 — Apps Script chưa redeploy |
| TC3 sub-tab "Cần xem xét" không hiện | BƯỚC 2 — SQL 2-step-verify chưa chạy |
| TC3 click "Xác nhận lần 2" lỗi 404/RPC | BƯỚC 2 — SQL chưa chạy |
| TC3 status không flip | BƯỚC 3 — SQL manual-approve chưa chạy |
| TC4 ảnh broken icon | BƯỚC 1 — Storage chưa Public |
| TC5 modal lỗi | Lỗi code em, không phải lỗi anh |
| TC6 UI sai | Lỗi CSS em, không phải lỗi anh |

---

## 💡 Tips test efficient

- Mở 2 browser: 1 incognito (khách), 1 thường (admin /thuythang)
- F12 → Network tab luôn mở để debug nếu fail
- Console tab (F12 → Console) check error log
- Chụp màn hình mỗi step để gửi em nếu lỗi
