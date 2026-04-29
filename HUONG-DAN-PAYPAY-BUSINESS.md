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

## ✅ ELIGIBILITY CHECK (UPDATED 2026-04-29 — 法人 path confirmed)

Anh có **愛ビュティージャパン株式会社** (Ai Beauty Japan KK) thành lập 4/2019 → **法人 path** áp dụng.

| Yêu cầu | Anh có? |
|---|---|
| 法人登記 (corporation registration) | ✅ Có từ 4/2019 |
| 履歴事項全部証明書 / 印鑑証明書 | ✅ Lấy ở 法務局 (¥600 + ¥450) |
| 定款 với 事業目的 bao gồm "食品の販売" | ⏳ **Anh cần CONFIRM** |
| 法人口座 (corporate bank account) | ⏳ **Anh cần CONFIRM** |
| 代表者本人確認書類 | ✅ Có (在留カード / 免許証) |
| Website hoạt động | ✅ thuyjapan.com |

### ⚠️ 2 BLOCKER POTENTIAL CẦN CHECK

**Blocker #1: Tên công ty "愛ビュティージャパン" gợi ý Beauty, nhưng kinh doanh thực tế là Food.**

PayPay audit check 定款 → cần 事業目的 bao gồm:
- 食品の販売
- 飲食料品の輸入及び販売
- 加工食品の製造及び販売
- 食料品の通信販売
- (hoặc 前各号に附帯する一切の業務 — catch-all)

→ Nếu không có → 2 options:
- **A**: Update 定款 (¥30k + ~1 tuần ở 法務局)
- **B**: Đăng ký 個人事業主 mới với 屋号 "Bếp Thuỷ Japan" → apply PayPay tên cá nhân (free, ~30 phút)

**Blocker #2: 法人口座 — PayPay chỉ chuyển tiền vào 法人 account.**

→ 法人 (Ai Beauty) cần có corporate bank account. Yucho 2168488 hiện tại có phải 法人 account hay không?

---

## 📋 DOCUMENT CHECKLIST cho 法人

Chuẩn bị sẵn các giấy tờ này trước khi apply:

### Bắt buộc cho 法人 (corporation)

| # | Giấy tờ | Lấy ở đâu | Phí | Validity |
|---|---|---|---|---|
| 1 | **履歴事項全部証明書** (登記簿謄本 — corporate registry extract) | 法務局 | ¥600/bản | 3 tháng kể từ ngày cấp |
| 2 | **印鑑証明書** (法人 — corporate seal certificate) | 法務局 | ¥450/bản | 3 tháng kể từ ngày cấp |
| 3 | **定款** (articles of incorporation) | Bản gốc/copy lúc thành lập | Free | — |
| 4 | **代表者本人確認書類** (1 trong: 運転免許証, マイナンバー, 在留カード, パスポート) | Anh có sẵn | Free | — |
| 5 | **法人口座情報** (corporate bank account in name of 愛ビュティージャパン株式会社) | Bank book / online banking screenshot | Free | — |

### Tip cho anh đi 法務局

- Lấy **2 bản** mỗi loại (1 cho PayPay, 1 dự phòng) — chỉ tốn thêm ¥600+450 = ¥1,050
- Online cũng được: https://www.touki.or.jp/ (登記情報提供サービス) nhưng phí cao hơn 1 chút và không phải bản gốc
- Đi sớm sáng: ít người, lấy nhanh

### Optional (nhưng nên có)
- Website screenshot (thuyjapan.com homepage + product page) — chứng minh business hoạt động
- **特定商取引法 page** trên thuyjapan.com — bắt buộc cho EC site Nhật (anh chưa có → em sẽ tạo trong Phase integration)
- Privacy Policy — anh có rồi tại `/privacy`
- Terms of Service — anh chưa có → em tạo cùng 特商法 page

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

### Bước 4: Điền thông tin doanh nghiệp (法人 path)

| Field | Giá trị |
|---|---|
| 事業者形態 | **法人** |
| 法人名 | **愛ビュティージャパン株式会社** |
| 法人番号 | (12 chữ số — có trong 履歴事項全部証明書) |
| 設立年月日 | 2019年4月... (ngày thành lập) |
| 屋号 / サービス名 | Bếp Thuỷ Japan |
| 代表者氏名 | タカハラ ケイイチロウ |
| 代表者生年月日 | (ngày sinh anh) |
| 事業内容 | ベトナム食品の販売（手作りハム・ソーセージ・パテ・ネムルイ等） |
| Website URL | https://www.thuyjapan.com |
| 電話番号 | 080-5115-6688 |
| Email | thanghoang1109@gmail.com |
| 本店所在地 | (địa chỉ trụ sở 法人 trong 履歴事項全部証明書) |

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

**Phase pre-apply (BẮT BUỘC trước khi apply)**:
1. ✅ Đọc hướng dẫn này
2. ⏳ **CHECK 定款 của 愛ビュティージャパン**: có 事業目的 bao gồm "食品の販売" không?
   - ✅ Có → đi tiếp
   - ❌ Không → quyết định: update 定款 (¥30k, 1 tuần) HOẶC đăng ký 個人事業主 với 屋号 "Bếp Thuỷ Japan"
3. ⏳ **CHECK 法人口座**: 愛ビュティージャパン có corporate bank account chưa?
   - ✅ Có → ghi rõ ngân hàng + số tài khoản
   - ❌ Chưa → mở 法人口座 (1-2 tuần — Yucho hoặc bank khác)

**Phase apply**:
4. ⏳ Đến 法務局 lấy 履歴事項全部証明書 + 印鑑証明書 (mỗi loại 2 bản, tổng ~¥2,100)
5. ⏳ Chuẩn bị 定款 (bản gốc hoặc copy)
6. ⏳ Apply tại https://paypay.ne.jp/store-online/ (~30 phút điền + upload)
7. ⏳ Đợi email PayPay (3-5 ngày)
8. ⏳ Báo em khi có credentials → em integrate (~3-5 ngày)

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
