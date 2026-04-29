# 💴 Hướng Dẫn PayPay for Business — Bếp Thuỷ Japan

> Research date: 2026-04-29
> Mục đích: tự động hoá xác minh thanh toán 100%, bullet-proof vs Photoshop fraud
> Status hiện tại: AI Vision OCR 8-layer (~95% accuracy, vẫn có rủi ro)
> Mục tiêu sau khi đổi: 100% accurate, real-time webhook, 0 dispute

---

## 📊 TÓM TẮT NHANH (đọc 1 phút)

**2 đường để add PayPay vào thuyjapan.com:**

| | **PayPay for Developers** ⭐ EM RECOMMEND | **Decision Agent (代行)** |
|---|---|---|
| Phí giao dịch | **3.8%** (物販 — Bếp Thuỷ thuộc loại này) | 1.98%-3.5% tuỳ agent |
| Phí setup | ¥0 | Có thể có (¥10k-50k) |
| Phí tháng | ¥0 | ¥0-¥3,000 |
| Tự code | Em làm (~3-5 ngày) | Họ tích hợp sẵn nhưng tốn ¥ |
| Approval | 3-5 ngày | 1-3 tuần |
| Linh hoạt | Cao — tự control flow | Thấp — phải theo template |

**Em recommend PayPay for Developers** vì:
1. Phí 3.8% chấp nhận được cho scale anh
2. Không qua trung gian → tốc độ + linh hoạt
3. Em có sẵn infra (Supabase + Apps Script) để tích hợp
4. Sandbox đầy đủ → test trước khi go-live

---

## 💰 PHÂN TÍCH CHI PHÍ (cho scale Bếp Thuỷ)

### Hiện tại
- Phí: ¥0
- Thời gian admin verify: ~5h/tuần (thủ công + spot-check AI)
- Rủi ro fraud: ~2-5% đơn (¥925 × 2-5% × 200 đơn = ¥3,700-9,250 mất/đợt)
- Disputes/khiếu nại: chiếm thời gian hỗ trợ khách

### Với PayPay 3.8%

Tính theo mục tiêu **800 đơn/tháng × ¥3,000 trung bình = ¥2,400,000 doanh thu/tháng**:

| | Số tiền |
|---|---|
| Phí giao dịch | ¥2,400,000 × 3.8% = **¥91,200/tháng** |
| Tiết kiệm thời gian admin | ~20h/tháng × ¥3,000/h = ¥60,000/tháng giá trị |
| Giảm fraud + dispute | ~¥40,000/tháng |
| **Net cost** | **~−¥9,000/tháng** (gần break-even) |

→ Tính cả "value of time" và giảm rủi ro, **PayPay gần như free**, mà UX cho khách + admin tốt hơn rất nhiều.

### Khi scale lên ¥5M/tháng
- Phí 3.8% = ¥190,000/tháng
- Lúc này có thể đàm phán xuống 2.5-3% qua decision agent (Epsilon, KOMOJU)
- Hoặc apply MyStore Lite Plan: ¥1,980/tháng + 1.6% rate

---

## ✅ ELIGIBILITY CHECK

Anh đủ điều kiện không?

| Yêu cầu | Anh có? |
|---|---|
| 個人事業主 (đã đăng ký 開業届) hoặc 法人 | ⏳ **Anh cần confirm** |
| Tài khoản ngân hàng Nhật | ✅ Yucho 2168488 |
| Website hoạt động | ✅ thuyjapan.com |
| Mặt hàng hợp lệ (food OK) | ✅ OK |
| Identity verification | ✅ Có 在留カード hoặc 免許証 |

→ Nếu anh **chưa đăng ký 個人事業主**, đó là blocker. Đăng ký 開業届 ở 税務署 (free, ~30 phút).

---

## 📋 DOCUMENT CHECKLIST

Chuẩn bị sẵn các giấy tờ này trước khi apply:

### Bắt buộc
1. **本人確認書類** (1 trong các giấy tờ sau):
   - 運転免許証 (bằng lái xe)
   - マイナンバーカード (My Number Card)
   - 住民票 (juuminhyou — chứng nhận cư trú)
   - 在留カード (Residence card) — nếu chưa có quốc tịch Nhật

2. **事業内容を確認できる書類** (1 trong các giấy tờ sau):
   - **開業届** (Notification of Opening Business — file PDF từ 税務署)
   - **確定申告書** (Tax return form — bản copy)
   - **納税証明書** (Tax payment certificate)
   - **店舗の内外観の写真** (ảnh shop bên trong/ngoài) — không áp dụng cho EC site

3. **Tài khoản ngân hàng**:
   - 銀行名: ゆうちょ銀行
   - 支店名: 二〇八店
   - 口座番号: 2168488
   - 口座名義: タカハラ ケイイチロウ

### Optional (nhưng nên có)
- Website screenshot (thuyjapan.com homepage + product page)
- 特定商取引法 page (anh chưa có → cần tạo, em có thể làm sau)
- Privacy Policy (anh có rồi tại /privacy)

---

## 🚶 CLICK-BY-CLICK ĐĂNG KÝ (cho anh)

### Bước 1: Mở trang đăng ký Online Payment

Click hoặc copy link:
```
https://paypay.ne.jp/store-online/
```

### Bước 2: Chọn "オンライン決済を導入する"

Trên trang chủ → tìm nút **"申し込む"** hoặc **"オンライン決済を導入する"** → click.

### Bước 3: Chọn loại EC

Hỏi: "貴社サイトの形態を教えてください" → chọn:
- **自社EC（独自開発）** ← Bếp Thuỷ thuộc loại này (tự dev với PayPay for Developers)

(Không chọn Shopify/BASE/Stores vì anh dùng Vercel + custom code)

### Bước 4: Điền thông tin doanh nghiệp

| Field | Giá trị |
|---|---|
| 事業者形態 | 個人事業主 |
| 屋号 (tên shop) | Bếp Thuỷ Japan |
| 代表者氏名 | タカハラ ケイイチロウ |
| 事業内容 | ベトナム食品の販売（手作りハム・ソーセージ等） |
| Website URL | https://www.thuyjapan.com |
| 電話番号 | 080-5115-6688 |
| Email | thanghoang1109@gmail.com |
| 住所 | (địa chỉ ở Nhật của anh) |

### Bước 5: Upload giấy tờ

Upload các file đã chuẩn bị ở phần Document Checklist.

### Bước 6: Submit

Bấm **送信 / Submit**. Sẽ hiện trang "申し込み完了".

### Bước 7: Đợi email từ PayPay (3-5 ngày)

PayPay sẽ gửi email với:
- Kết quả audit
- Login vào PayPay for Business dashboard
- API credentials (API Key + Secret)
- Merchant ID

→ **Báo em ngay** khi nhận được credentials, em wire integration trong 3-5 ngày.

---

## 🛠 TECHNICAL INTEGRATION SPEC (em làm sau khi anh có credentials)

### Architecture

```
Customer → thuyjapan.com → Apps Script /paypay_create_code
                                     ↓
                           PayPay Web Cashier API
                                     ↓
                           Returns QR code + redirect URL
                                     ↓
Customer scans/clicks → PayPay app → Pays → PayPay Server
                                     ↓
                           Webhook to Apps Script
                                     ↓
                           Auto-create order with status='paid'
```

### Files to change

| File | Changes |
|---|---|
| `google-apps-script.js` | Add `paypay_create_code` doPost handler. Add `paypay_webhook` handler (verify HMAC, update order status). Store API_KEY + API_SECRET + MERCHANT_ID in Script Properties. |
| `index.html` | Replace upload-receipt UI with "Pay with PayPay" button → redirect to PayPay or show QR. Replace `verify_then_create_order` with `paypay_create_code`. |
| `supabase-paypay.sql` (new) | Add `paypay_payments` table tracking merchantPaymentId → order_no. Add columns to orders table for `paypay_merchant_payment_id`, `paypay_status`. |
| `vercel.json` | Add `apigw.paypay.ne.jp` to CSP `connect-src`. |

### API Flow (theo PayPay Web Cashier docs)

**1. Create Code** (sau khi khách điền form):
```
POST https://apigw.paypay.ne.jp/v2/codes
Headers:
  Authorization: HMAC SHA256 sign with API_SECRET
  X-ASSUME-MERCHANT: <MERCHANT_ID>
Body:
{
  "merchantPaymentId": "BEPTHUY-{orderNo}-{ts}",
  "amount": { "amount": 925, "currency": "JPY" },
  "codeType": "ORDER_QR",
  "orderDescription": "Bếp Thuỷ Japan - Đơn #0001",
  "redirectUrl": "https://www.thuyjapan.com/payment-complete?id={orderNo}",
  "redirectType": "WEB_LINK"
}
```

Response: `{ codeId, url, deeplink, expiryDate, ... }` → frontend hiện QR hoặc redirect tới `url`.

**2. Webhook khi khách thanh toán** (PayPay POST tới Apps Script):
```json
{
  "notification_type": "Transaction",
  "merchant_id": "...",
  "order_id": "BEPTHUY-0001-...",
  "state": "COMPLETED",
  "paid_at": "2026-04-29T13:35:29Z",
  "order_amount": "925"
}
```

→ Apps Script: verify HMAC signature → match `order_id` với pending order → mark `status='customer_paid'` → trigger sản xuất.

**3. Polling fallback** (nếu webhook fail):
```
GET https://apigw.paypay.ne.jp/v2/codes/payments/BEPTHUY-0001-...
```
Frontend poll mỗi 2-3s sau khi user redirect.

### Migration plan

**Phase 1 (week 3 sau approval)**: Em integrate PayPay alongside existing AI verify
- Customer thấy 2 lựa chọn: "Pay with PayPay" (mới) hoặc "Bank transfer + upload bill" (cũ)
- Default: PayPay (recommended)
- Bank transfer: dành cho khách không có PayPay

**Phase 2 (week 4-5)**: Monitor metrics
- % khách dùng PayPay vs bank
- Conversion rate so với trước
- Tỷ lệ failed verify

**Phase 3 (sau 4-6 tuần data)**: Decide
- Nếu PayPay >80% khách dùng → có thể disable bank flow (đơn giản hoá)
- Hoặc giữ cả 2 nếu bank còn quan trọng

---

## ⏱ TIMELINE TỔNG THỂ

| Tuần | Việc | Ai làm |
|---|---|---|
| 0 | Anh review hướng dẫn này, chuẩn bị documents | Anh |
| 0-1 | Anh apply tại https://paypay.ne.jp/store-online/ | Anh |
| 1-2 | Đợi PayPay audit (3-5 ngày làm việc) | PayPay |
| 2 | Anh nhận credentials → báo em | Anh + Em |
| 2-3 | Em integrate sandbox (3-5 ngày) | Em |
| 3 | Anh test sandbox với 1-2 đơn thử | Anh |
| 3-4 | Em deploy production + monitor | Em |
| 4-8 | Theo dõi conversion + dần migrate khỏi AI verify | Cả 2 |

---

## ❓ FAQ

**Q: Nếu anh chưa có 開業届 thì sao?**
A: Đăng ký free tại 税務署 quận anh ở. ~30 phút điền form. PayPay yêu cầu cái này (hoặc 確定申告書) để verify business.

**Q: Khách Việt không có PayPay app thì sao?**
A: Vẫn giữ flow bank transfer + AI verify (em đã làm) làm phương án dự phòng. Khách chọn 1 trong 2.

**Q: Phí 3.8% có giảm được không?**
A: Có, nếu đăng ký MyStore Lite Plan: 1.6% + ¥1,980/tháng. Break-even khi doanh thu > ¥99,000/tháng. Anh đã đạt → có thể chọn Lite từ đầu để tiết kiệm.

**Q: Nếu anh muốn nhận thẻ tín dụng (cho khách Nhật bản địa)?**
A: Add Stripe Japan song song với PayPay. Em làm sau Phase 1 nếu anh muốn.

**Q: Webhook không tới thì sao?**
A: Em build polling fallback — frontend poll PayPay status mỗi 3s. Hai lớp đảm bảo không miss đơn.

---

## 🚀 NEXT STEPS

### Anh cần làm:
1. ✅ Đọc hướng dẫn này
2. ⏳ Confirm: Anh đã có 開業届 chưa? (yes/no)
3. ⏳ Chuẩn bị documents (1 ngày)
4. ⏳ Apply tại https://paypay.ne.jp/store-online/ (30 phút)
5. ⏳ Đợi email PayPay (3-5 ngày)
6. ⏳ Báo em khi có credentials

### Em sẵn sàng:
- ✅ Spec đã viết xong
- ⏳ Sẽ implement khi anh có credentials (3-5 ngày code)

---

## 📚 REFERENCES

- [PayPay Online Payment](https://paypay.ne.jp/store-online/)
- [PayPay Web Cashier API Documentation](https://www.paypay.ne.jp/opa/doc/v1.0/webcashier)
- [PayPay for Developers](https://paypayue.github.io/en/)
- [Phí và plan](https://paypay.ne.jp/help-merchant/b0544/)
- [Cá nhân kinh doanh hướng dẫn](https://paypay.ne.jp/store-media/qr/0016_qr_individual/)

---

**File này là master guide. Mỗi lần em research thêm hoặc anh có thay đổi, em sẽ update file này.**
